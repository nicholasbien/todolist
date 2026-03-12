"""Todo management routes."""

import logging
from datetime import datetime
from typing import List

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Request

from chat_sessions import append_message
from chat_sessions import create_session as create_chat_session
from chat_sessions import find_session_by_todo
from classify import classify_task
from categories import get_categories
from spaces import user_in_space
from todos import (
    Todo,
    complete_todo,
    create_todo,
    delete_todo,
    get_subtasks,
    get_todos,
    handle_subtask_completion,
    health_check,
    permanent_delete_todo,
    todos_collection,
    update_todo_fields,
)

from .dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["todos"])


@router.get("/todos", response_model=List[Todo])
async def api_get_todos(
    space_id: str | None = None, current_user: dict = Depends(get_current_user)
):
    logger.info(f"Fetching todos for user: {current_user['email']} in space {space_id}")
    result = await get_todos(current_user["user_id"], space_id)
    logger.info(f"Fetched {len(result)} todos")
    return result


@router.post("/todos", response_model=Todo)
async def api_create_todo(
    request: Request, current_user: dict = Depends(get_current_user)
):
    try:
        body = await request.json()

        body["user_id"] = current_user["user_id"]
        if "space_id" not in body:
            body["space_id"] = None

        # Input length validation
        text = body.get("text", "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="Task text is required")
        if len(text) > 2000:
            raise HTTPException(
                status_code=400, detail="Task text too long (max 2000 chars)"
            )
        notes = body.get("notes", "")
        if notes and len(notes) > 10000:
            raise HTTPException(
                status_code=400, detail="Notes too long (max 10000 chars)"
            )

        # Determine the text to classify
        classify_text = text

        # Detect if text is a URL and fetch page title
        if text.startswith("http://") or text.startswith("https://"):
            body["link"] = text
            try:
                from urllib.parse import urlparse

                parsed = urlparse(text)
                hostname = parsed.hostname or ""

                # Block requests to private/internal networks (SSRF protection)
                import ipaddress

                _blocked = False
                try:
                    ip = ipaddress.ip_address(hostname)
                    if (
                        ip.is_private
                        or ip.is_loopback
                        or ip.is_reserved
                        or ip.is_link_local
                    ):
                        _blocked = True
                except ValueError:
                    # hostname is not an IP — block common internal names
                    if (
                        hostname in ("localhost",)
                        or hostname.endswith(".local")
                        or hostname.endswith(".internal")
                    ):
                        _blocked = True

                if _blocked:
                    logger.warning(
                        f"Blocked URL fetch to private/internal host: {hostname}"
                    )
                else:
                    req_headers = {
                        "User-Agent": (
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                            "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                        )
                    }
                    async with httpx.AsyncClient(
                        timeout=5,
                        headers=req_headers,
                        follow_redirects=True,
                        max_redirects=5,
                    ) as client:
                        resp = await client.get(text)
                        if resp.status_code == 200:
                            # Only parse a limited amount of response body
                            body_text = resp.text[:100_000]
                            soup = BeautifulSoup(body_text, "html.parser")
                            title_tag = soup.find("title")
                            if title_tag and title_tag.text:
                                page_title = title_tag.text.strip()[:500]
                                body["text"] = page_title
                                classify_text = page_title
            except Exception as e:
                logger.error(f"Failed to fetch title for URL: {e}")

        # Only classify if not created offline and no category provided
        if not body.get("created_offline", False) and not body.get("category"):
            try:
                # Get categories (this automatically ensures "General" exists)
                categories_list = (
                    await get_categories(body.get("space_id"))
                    if body.get("space_id")
                    else []
                )

                classification = await classify_task(
                    classify_text,
                    categories_list,
                    body.get("dateAdded", ""),
                )
                body["category"] = classification.get("category", "General")
                body["priority"] = classification.get("priority", "Medium")
                if classification.get("text"):
                    body["text"] = classification["text"]
                if classification.get("dueDate"):
                    body["dueDate"] = classification["dueDate"]
            except Exception as e:
                logger.error(f"Failed to classify text '{classify_text}': {e}")
                body["category"] = "General"
                body["priority"] = "Medium"
        else:
            # If category provided or created offline, ensure priority defaults
            body.setdefault("priority", "Medium")

        # Ensure dateAdded exists (frontend should provide this)
        body.setdefault("dateAdded", datetime.now().isoformat())

        # Pass through creator_type if provided
        body.setdefault("creator_type", "user")

        # Create Todo object from request data
        todo = Todo(**body)
        logger.info(f"Created Todo object: {todo}")

        # Create the todo in the database
        result = await create_todo(todo)
        logger.info(f"Todo created successfully: {result}")

        # Auto-create a linked session for the task (unless created offline)
        if not body.get("created_offline", False):
            try:
                todo_dict = result.dict(by_alias=True)
                todo_id = str(todo_dict["_id"])
                is_subtask = bool(body.get("parent_id"))

                # Build initial message with task details
                details = []
                if todo_dict.get("category") and todo_dict["category"] != "General":
                    details.append(f"Category: {todo_dict['category']}")
                if todo_dict.get("priority"):
                    details.append(f"Priority: {todo_dict['priority']}")
                if todo_dict.get("dueDate"):
                    details.append(f"Due: {todo_dict['dueDate']}")
                if todo_dict.get("notes"):
                    details.append(f"Notes: {todo_dict['notes']}")

                if is_subtask:
                    # For subtasks, include parent context
                    from bson import ObjectId as _ObjId

                    parent_doc = await todos_collection.find_one(
                        {"_id": _ObjId(body["parent_id"])}
                    )
                    parent_text = parent_doc.get("text", "") if parent_doc else ""
                    initial_msg = (
                        f"Subtask of: \"{parent_text}\"\n\nTask: {todo_dict['text']}"
                    )
                    if details:
                        initial_msg += "\n" + "\n".join(details)
                else:
                    initial_msg = f"Please help me with this task: {todo_dict['text']}"
                    if details:
                        initial_msg += "\n" + "\n".join(details)

                # Post as assistant if agent-created, user if user-created
                role = "assistant" if body.get("creator_type") == "agent" else "user"
                # Use explicit agent_id from request, fallback to hashtag detection for backwards compat
                auto_agent_id = body.get("agent_id") or None
                if not auto_agent_id:
                    text_lower = todo_dict["text"].lower()
                    if "#openclaw" in text_lower:
                        auto_agent_id = "openclaw"
                    elif "#claude" in text_lower:
                        auto_agent_id = "claude"

                # For subtasks, inherit agent_id from parent session if not set
                if is_subtask and not auto_agent_id and parent_doc:
                    parent_session = await find_session_by_todo(
                        current_user["user_id"], body["parent_id"]
                    )
                    if parent_session and parent_session.get("agent_id"):
                        auto_agent_id = parent_session["agent_id"]

                session_id = await create_chat_session(
                    current_user["user_id"],
                    body.get("space_id"),
                    todo_dict["text"],
                    todo_id=todo_id,
                    agent_id=auto_agent_id,
                )
                await append_message(
                    session_id, current_user["user_id"], role, initial_msg
                )

                # For subtasks with dependencies, make session dormant
                # (will be activated when all dependencies complete)
                # Subtasks without dependencies start active (parallel by default)
                if is_subtask:
                    from bson import ObjectId as _ObjId

                    from chat_sessions import sessions_collection as sess_coll

                    depends_on = body.get("depends_on", [])
                    if depends_on:
                        # This subtask has dependencies — start dormant
                        await sess_coll.update_one(
                            {"_id": _ObjId(session_id)},
                            {"$set": {"needs_agent_response": False}},
                        )
            except Exception as e:
                logger.error(f"Failed to auto-create session for todo: {e}")

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating todo: {str(e)}")
        raise HTTPException(status_code=500, detail="Error creating todo")


@router.put("/todos/reorder")
async def api_reorder_todos(
    request: Request, current_user: dict = Depends(get_current_user)
):
    try:
        body = await request.json()
        todo_ids = body.get("todoIds", [])
        if not todo_ids:
            raise HTTPException(status_code=400, detail="todoIds required")
        if len(todo_ids) > 500:
            raise HTTPException(status_code=400, detail="Too many items to reorder")
        from bson import ObjectId

        user_id = current_user["user_id"]
        # Verify the user owns all the todos being reordered
        oid_list = [ObjectId(tid) for tid in todo_ids]
        owned_count = await todos_collection.count_documents(
            {"_id": {"$in": oid_list}, "user_id": user_id}
        )
        if owned_count != len(oid_list):
            # Fall back to checking space membership for collaborative todos
            space_docs = await todos_collection.find(
                {"_id": {"$in": oid_list}}, {"space_id": 1}
            ).to_list(length=len(oid_list))
            if len(space_docs) != len(oid_list):
                raise HTTPException(
                    status_code=403, detail="Not authorized to reorder these todos"
                )
            for doc in space_docs:
                sid = doc.get("space_id")
                if not sid or not await user_in_space(user_id, sid):
                    raise HTTPException(
                        status_code=403, detail="Not authorized to reorder these todos"
                    )

        for i, todo_id in enumerate(todo_ids):
            await todos_collection.update_one(
                {"_id": ObjectId(todo_id)}, {"$set": {"sortOrder": i}}
            )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reordering todos: {e}")
        raise HTTPException(status_code=500, detail="Error reordering todos")


@router.delete("/todos/{todo_id}")
async def api_delete_todo(todo_id: str, current_user: dict = Depends(get_current_user)):
    logger.info(
        f"Soft-deleting (closing) todo with ID: {todo_id} for user: {current_user['email']}"
    )
    return await delete_todo(todo_id, current_user["user_id"])


@router.delete("/todos/{todo_id}/permanent")
async def api_permanent_delete_todo(
    todo_id: str, current_user: dict = Depends(get_current_user)
):
    logger.info(
        f"Permanently deleting todo with ID: {todo_id} for user: {current_user['email']}"
    )
    return await permanent_delete_todo(todo_id, current_user["user_id"])


@router.put("/todos/{todo_id}/complete")
async def api_complete_todo(
    todo_id: str, current_user: dict = Depends(get_current_user)
):
    logger.info(
        f"Marking todo as complete with ID: {todo_id} for user: {current_user['email']}"
    )
    result = await complete_todo(todo_id, current_user["user_id"])
    # Trigger subtask orchestration (activate next subtask, post final results)
    try:
        await handle_subtask_completion(todo_id, current_user["user_id"])
    except Exception as e:
        logger.error(f"Subtask orchestration error: {e}")
    return result


@router.post("/todos/{todo_id}/restore", response_model=Todo)
async def api_restore_todo(
    todo_id: str, current_user: dict = Depends(get_current_user)
):
    """Restore a soft-deleted (closed) todo by setting closed=false."""
    logger.info(
        f"Restoring soft-deleted todo {todo_id} for user: {current_user['email']}"
    )
    return await update_todo_fields(todo_id, {"closed": False}, current_user["user_id"])


@router.put("/todos/{todo_id}", response_model=Todo)
async def api_update_todo(
    todo_id: str, request: Request, current_user: dict = Depends(get_current_user)
):
    try:
        body = await request.json()

        # Input length validation
        if "text" in body and len(body["text"]) > 2000:
            raise HTTPException(
                status_code=400, detail="Task text too long (max 2000 chars)"
            )
        if "notes" in body and body["notes"] and len(body["notes"]) > 10000:
            raise HTTPException(
                status_code=400, detail="Notes too long (max 10000 chars)"
            )
        if "category" in body and len(body["category"]) > 100:
            raise HTTPException(status_code=400, detail="Category name too long")

        # Build updates dict from request body
        updates = {}
        if "text" in body:
            updates["text"] = body["text"]
        if "notes" in body:
            updates["notes"] = body["notes"]
        if "category" in body:
            updates["category"] = body["category"]
        if "priority" in body:
            updates["priority"] = body["priority"]
        if "dueDate" in body:
            updates["dueDate"] = body["dueDate"]
        if "sortOrder" in body:
            updates["sortOrder"] = body["sortOrder"]
        if "space_id" in body:
            new_space_id = body["space_id"]
            # Validate user has access to destination space
            if new_space_id and not await user_in_space(
                current_user["user_id"], new_space_id
            ):
                raise HTTPException(
                    status_code=403, detail="Not authorized to move to target space"
                )
            updates["space_id"] = new_space_id
        if "agent_id" in body:
            updates["agent_id"] = body["agent_id"]
        if "recurrence_rule" in body:
            rule = body["recurrence_rule"]
            if rule not in (None, "daily", "weekly", "monthly"):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid recurrence_rule. Must be daily, weekly, monthly, or null",
                )
            updates["recurrence_rule"] = rule
            # Compute next occurrence when setting a rule
            if rule:
                from todos import _compute_next_occurrence

                updates["recurrence_next"] = _compute_next_occurrence(rule)
            else:
                updates["recurrence_next"] = None

        if "closed" in body:
            updates["closed"] = bool(body["closed"])

        if not updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        logger.info(f"Updating todo {todo_id} for user: {current_user['email']}")
        result = await update_todo_fields(todo_id, updates, current_user["user_id"])

        # If agent_id changed, update the linked session
        if "agent_id" in body:
            try:
                session = await find_session_by_todo(current_user["user_id"], todo_id)
                if session:
                    from bson import ObjectId as _ObjId

                    from db import db

                    if body["agent_id"]:
                        await db.sessions.update_one(
                            {"_id": _ObjId(str(session["_id"]))},
                            {"$set": {"agent_id": body["agent_id"]}},
                        )
                    else:
                        await db.sessions.update_one(
                            {"_id": _ObjId(str(session["_id"]))},
                            {"$unset": {"agent_id": 1}},
                        )
            except Exception as e:
                logger.error(f"Failed to update session agent_id: {e}")

        return result
    except HTTPException:
        # Re-raise HTTP exceptions (like 403, 404) without converting to 500
        raise
    except Exception as e:
        logger.error(f"Error updating todo: {repr(e)}")
        raise HTTPException(status_code=500, detail="Error updating todo")


@router.get("/todos/{todo_id}/subtasks")
async def api_get_subtasks(
    todo_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get subtasks of a parent todo, ordered by the parent's subtask_ids array."""
    return await get_subtasks(todo_id)


@router.get("/todos/{todo_id}")
async def api_get_single_todo(
    todo_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a single todo by ID."""
    from bson import ObjectId as _ObjId

    try:
        doc = await todos_collection.find_one({"_id": _ObjId(todo_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid todo ID")
    if not doc:
        raise HTTPException(status_code=404, detail="Todo not found")
    # Check ownership: user must own the todo or be in the same space
    is_owner = doc.get("user_id") == current_user["user_id"]
    is_space_member = doc.get("space_id") and await user_in_space(
        current_user["user_id"], doc["space_id"]
    )
    if not is_owner and not is_space_member:
        raise HTTPException(status_code=403, detail="Not authorized")
    doc["_id"] = str(doc["_id"])
    # Add first_name
    try:
        import auth

        user = await auth.users_collection.find_one({"_id": _ObjId(doc["user_id"])})
        if user:
            doc["first_name"] = user.get("first_name", "")
    except Exception:
        doc["first_name"] = ""
    return doc
