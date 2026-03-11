import csv
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from io import StringIO
from typing import List, Optional, Union

import httpx
from bs4 import BeautifulSoup
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from activity_feed import get_activity_feed
from agent import agent_router
from agent_memory import get_recent_memory_logs
from auth import (
    LoginRequest,
    SignupRequest,
    UpdateNameRequest,
    delete_user_account,
    login_user,
    logout_user,
    signup_user,
    update_user_email_instructions,
    update_user_email_spaces,
    update_user_name,
    update_user_summary_time,
    verify_session,
)
from categories import (
    Category,
    CategoryRename,
    add_category,
    delete_category,
    get_categories,
    init_default_categories,
    migrate_legacy_categories,
    rename_category,
)
from chat_sessions import append_message
from chat_sessions import create_session as create_chat_session
from chat_sessions import find_session_by_todo, mark_session_read

# Import the classification function and todo management
from classify import classify_task
from email_summary import send_daily_summary

# Import journal functions
from journals import (
    JournalEntry,
    create_journal_entry,
    delete_journal_entry,
    get_journal_entries,
    get_journal_entry_by_date,
    journals_collection,
)
from scheduler import get_scheduler_status, start_scheduler, update_schedule_time
from spaces import (
    Space,
    create_space,
    delete_space,
    get_spaces_for_user,
    invite_members,
    leave_space,
    list_space_members,
    update_space,
    user_in_space,
)
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

# Set up logging with more detail
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize application on startup and cleanup on shutdown."""
    logger.info("🚀 FastAPI startup (lifespan) event triggered")

    try:
        # Skip startup tasks in test environment
        if os.getenv("USE_MOCK_DB"):
            logger.info("Running in test mode - skipping initialization")
            yield
            return

        logger.info("Starting initialization tasks...")

        # Import initialization functions
        from agent_memory import init_memory_indexes
        from auth import cleanup_expired_sessions, init_auth_indexes
        from categories import init_category_indexes
        from chat_sessions import init_chat_session_indexes
        from chats import init_chat_indexes

        # Test database connection first
        from db import check_database_health
        from journals import init_journal_indexes
        from spaces import init_space_indexes, migrate_default_spaces
        from todos import init_todo_indexes, migrate_legacy_todos

        if not await check_database_health():
            logger.error("Database health check failed - continuing anyway")

        # Run each initialization step with individual error handling
        initialization_steps = [
            ("migrate_legacy_categories", migrate_legacy_categories),
            ("migrate_legacy_todos", migrate_legacy_todos),
            ("migrate_default_spaces", migrate_default_spaces),
            ("rename_default_spaces_to_personal", rename_default_spaces_to_personal),
            ("init_todo_indexes", init_todo_indexes),
            ("init_auth_indexes", init_auth_indexes),
            ("init_space_indexes", init_space_indexes),
            ("init_category_indexes", init_category_indexes),
            ("init_journal_indexes", init_journal_indexes),
            ("init_chat_indexes", init_chat_indexes),
            ("init_chat_session_indexes", init_chat_session_indexes),
            ("init_memory_indexes", init_memory_indexes),
            ("init_default_categories", init_default_categories),
            ("cleanup_expired_sessions", cleanup_expired_sessions),
        ]

        failed_steps = []
        for step_name, step_func in initialization_steps:
            try:
                logger.info(f"⏳ Starting {step_name}...")
                await step_func()  # type: ignore
                logger.info(f"✓ {step_name} completed")
            except Exception as e:
                logger.error(f"✗ {step_name} failed: {e}")
                failed_steps.append(step_name)
                # Don't let individual failures stop the entire startup

        # Start scheduler (non-critical, should not fail startup)
        try:
            logger.info("⏳ Starting scheduler...")
            start_scheduler()
            logger.info("✓ Scheduler started")
        except Exception as e:
            logger.error(f"✗ Scheduler failed to start: {e}")
            failed_steps.append("scheduler")

        if failed_steps:
            logger.warning(
                f"⚠️  Startup completed with {len(failed_steps)} failed steps: {', '.join(failed_steps)}"
            )
        else:
            logger.info("🚀 All initialization completed successfully")

        logger.info("✅ Startup event completed")

    except Exception as e:
        logger.error(f"Critical startup error: {e}")
        # Don't re-raise to prevent crash loop
        logger.error(
            "App started with startup errors - some features may not work correctly"
        )

    # Application is now running
    yield

    # Cleanup on shutdown
    logger.info("🔄 FastAPI shutdown event triggered")


app = FastAPI(title="AI Todo List API", lifespan=lifespan)

# Include agent router
app.include_router(agent_router)

MAX_HISTORY = 10


# Security headers middleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)


# Enable CORS - specifically for the Next.js frontend
_allowed_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,https://app.todolist.nyc,capacitor://localhost,ionic://localhost",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# Authentication dependency
async def get_current_user(authorization: str = Header(None)):
    """Extract user from Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    # Expect format: "Bearer <token>"
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
    except ValueError:
        raise HTTPException(
            status_code=401, detail="Invalid authorization header format"
        )

    # Verify the session token
    user_info = await verify_session(token)
    user_info["token"] = token  # Add token to user info for logout
    return user_info


# Optional authentication dependency (for backward compatibility)
async def get_current_user_optional(authorization: str = Header(None)):
    """Extract user from Authorization header, but don't require it."""
    if not authorization:
        return None

    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            return None
        user_info = await verify_session(token)
        return user_info
    except Exception:
        return None


@app.get("/")
async def root():
    return {"message": "AI Todo List API is running"}


# Authentication endpoints
@app.post("/auth/signup")
async def api_signup(request: SignupRequest):
    """Send verification code to email for signup/login."""
    logger.info(f"Signup request for email: {request.email}")
    return await signup_user(request.email)


@app.post("/auth/login")
async def api_login(request: LoginRequest):
    """Verify code and create session."""
    logger.info(f"Login request for email: {request.email}")
    return await login_user(request.email, request.code)


@app.post("/auth/logout")
async def api_logout(current_user: dict = Depends(get_current_user)):
    """Logout and deactivate session."""
    logger.info(f"Logout request for user: {current_user['email']}")
    return await logout_user(current_user["token"])


@app.get("/auth/me")
async def api_get_current_user(current_user: dict = Depends(get_current_user)):
    """Get current user info."""
    return current_user


@app.post("/auth/update-name")
async def api_update_name(
    request: UpdateNameRequest, current_user: dict = Depends(get_current_user)
):
    """Update user's first name."""
    logger.info(
        f"Update name request for user: {current_user['email']}, name: {request.first_name}"
    )
    return await update_user_name(current_user["user_id"], request.first_name)


@app.delete("/auth/me")
async def api_delete_account(current_user: dict = Depends(get_current_user)):
    """Delete user account and all associated data."""
    logger.info(f"Account deletion request for user: {current_user['email']}")
    return await delete_user_account(current_user["user_id"])


# Add todo management endpoints
@app.get("/todos", response_model=List[Todo])
async def api_get_todos(
    space_id: str | None = None, current_user: dict = Depends(get_current_user)
):
    logger.info(f"Fetching todos for user: {current_user['email']} in space {space_id}")
    result = await get_todos(current_user["user_id"], space_id)
    logger.info(f"Fetched {len(result)} todos")
    return result


@app.post("/todos", response_model=Todo)
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
                    # TODO: AI is over-aggressively cleaning text, removing "by User X" as date keywords
                    # This causes "Todo by User 1" to become just "Todo". Need to fix AI prompt
                    # to be more precise about date keyword detection vs meaningful content
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


@app.put("/todos/reorder")
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


@app.delete("/todos/{todo_id}")
async def api_delete_todo(todo_id: str, current_user: dict = Depends(get_current_user)):
    logger.info(
        f"Soft-deleting (closing) todo with ID: {todo_id} for user: {current_user['email']}"
    )
    return await delete_todo(todo_id, current_user["user_id"])


@app.delete("/todos/{todo_id}/permanent")
async def api_permanent_delete_todo(
    todo_id: str, current_user: dict = Depends(get_current_user)
):
    logger.info(
        f"Permanently deleting todo with ID: {todo_id} for user: {current_user['email']}"
    )
    return await permanent_delete_todo(todo_id, current_user["user_id"])


@app.put("/todos/{todo_id}/complete")
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


@app.post("/todos/{todo_id}/restore", response_model=Todo)
async def api_restore_todo(
    todo_id: str, current_user: dict = Depends(get_current_user)
):
    """Restore a soft-deleted (closed) todo by setting closed=false."""
    logger.info(
        f"Restoring soft-deleted todo {todo_id} for user: {current_user['email']}"
    )
    return await update_todo_fields(todo_id, {"closed": False}, current_user["user_id"])


@app.put("/todos/{todo_id}", response_model=Todo)
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


@app.get("/health")
async def api_health_check():
    logger.info("Health check requested")
    return await health_check()


async def rename_default_spaces_to_personal():
    """One-time migration to rename all 'Default' spaces to 'Personal'."""
    try:
        from spaces import spaces_collection

        # Update all spaces with name "Default" to "Personal"
        result = await spaces_collection.update_many(
            {"name": "Default"}, {"$set": {"name": "Personal"}}
        )

        if result.modified_count > 0:
            logger.info(
                f"Renamed {result.modified_count} 'Default' spaces to 'Personal'"
            )
        else:
            logger.info("No 'Default' spaces found to rename")

    except Exception as e:
        logger.error(f"Error renaming Default spaces to Personal: {e}")


# Category management endpoints
@app.get("/categories", response_model=List[str])
async def api_get_categories(
    space_id: Optional[str] = None, current_user: dict = Depends(get_current_user)
):
    """Get categories for a space, or default categories if no space_id provided."""
    if space_id is not None and not await user_in_space(
        current_user["user_id"], space_id
    ):
        raise HTTPException(status_code=403, detail="Not in space")
    logger.info("Fetching categories for space %s", space_id or "default")
    return await get_categories(space_id)


@app.post("/categories")
async def api_add_category(
    category: Category, current_user: dict = Depends(get_current_user)
):
    """Add a new category to a space."""
    if category.space_id is not None and not await user_in_space(
        current_user["user_id"], category.space_id
    ):
        raise HTTPException(status_code=403, detail="Not in space")
    logger.info(
        "Adding new category %s to space %s",
        category.name,
        category.space_id or "default",
    )
    return await add_category(category)


@app.put("/categories/{name}")
async def api_rename_category(
    name: str,
    body: CategoryRename,
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Rename an existing category within a space."""
    if space_id is not None and not await user_in_space(
        current_user["user_id"], space_id
    ):
        raise HTTPException(status_code=403, detail="Not in space")
    logger.info(
        "Renaming category %s to %s in space %s",
        name,
        body.new_name,
        space_id or "default",
    )
    return await rename_category(name, body.new_name, space_id)


@app.delete("/categories/{name}")
async def api_delete_category(
    name: str,
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Delete a category from a space."""
    if space_id is not None and not await user_in_space(
        current_user["user_id"], space_id
    ):
        raise HTTPException(status_code=403, detail="Not in space")
    logger.info("Deleting category %s from space %s", name, space_id or "default")
    return await delete_category(name, space_id)


class SpaceCreateRequest(BaseModel):
    name: str


class InviteRequest(BaseModel):
    emails: List[str]


class SpaceUpdateRequest(BaseModel):
    name: Optional[str] = None
    collaborative: Optional[bool] = None


# Space management endpoints
@app.get("/spaces", response_model=List[Space])
async def api_get_spaces(current_user: dict = Depends(get_current_user)):
    return await get_spaces_for_user(current_user["user_id"])


@app.post("/spaces", response_model=Space)
async def api_create_space_endpoint(
    req: SpaceCreateRequest, current_user: dict = Depends(get_current_user)
):
    return await create_space(req.name, current_user["user_id"])


@app.post("/spaces/{space_id}/invite")
async def api_invite_members(
    space_id: str, req: InviteRequest, current_user: dict = Depends(get_current_user)
):
    await invite_members(
        space_id,
        current_user["email"],
        req.emails,
        inviter_user_id=current_user["user_id"],
    )
    return {"message": "Invitations sent"}


@app.get("/spaces/{space_id}/members")
async def api_list_members(
    space_id: str, current_user: dict = Depends(get_current_user)
):
    if not await user_in_space(current_user["user_id"], space_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    return await list_space_members(space_id, current_user["user_id"])


@app.post("/spaces/{space_id}/leave")
async def api_leave_space(
    space_id: str, current_user: dict = Depends(get_current_user)
):
    if not await user_in_space(current_user["user_id"], space_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    return await leave_space(space_id, current_user["user_id"])


@app.put("/spaces/{space_id}", response_model=Space)
async def api_update_space(
    space_id: str,
    req: SpaceUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    return await update_space(
        space_id, current_user["user_id"], req.name, req.collaborative
    )


@app.delete("/spaces/{space_id}")
async def api_delete_space(
    space_id: str, current_user: dict = Depends(get_current_user)
):
    return await delete_space(space_id, current_user["user_id"])


# Email summary endpoints
@app.post("/email/send-summary")
async def api_send_summary(current_user: dict = Depends(get_current_user)):
    """Send daily summary email to current user."""
    logger.info(f"Manual summary request for user: {current_user['email']}")
    success = await send_daily_summary(
        current_user["user_id"],
        current_user["email"],
        current_user.get("first_name") or "",
        current_user.get("email_instructions", ""),
    )

    if success:
        return {"message": "Summary email sent successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send summary email")


@app.get("/email/scheduler-status")
async def api_scheduler_status():
    """Get scheduler status."""
    return get_scheduler_status()


class UpdateScheduleRequest(BaseModel):
    hour: int
    minute: int
    timezone: str = "America/New_York"
    email_enabled: bool = False


class UpdateInstructionsRequest(BaseModel):
    instructions: str


class UpdateEmailSpacesRequest(BaseModel):
    space_ids: List[str]


@app.post("/email/update-schedule")
async def api_update_schedule(
    req: UpdateScheduleRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update daily summary schedule time, timezone, and enabled status."""
    logger.info(
        "Schedule update requested by %s to %02d:%02d %s (enabled: %s)",
        current_user["email"],
        req.hour,
        req.minute,
        req.timezone,
        req.email_enabled,
    )
    await update_user_summary_time(
        current_user["user_id"], req.email_enabled, req.hour, req.minute, req.timezone
    )

    if req.email_enabled:
        update_schedule_time(
            current_user["user_id"],
            current_user["email"],
            current_user.get("first_name", ""),
            req.hour,
            req.minute,
            req.timezone,
        )
    else:
        # Remove the scheduled job if email is disabled
        from scheduler import remove_user_schedule

        remove_user_schedule(current_user["user_id"])
    return {"message": "Schedule updated"}


@app.post("/email/update-instructions")
async def api_update_instructions(
    req: UpdateInstructionsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update custom summary instructions for the current user."""
    logger.info("Instructions update requested by %s", current_user["email"])
    return await update_user_email_instructions(
        current_user["user_id"], req.instructions
    )


@app.post("/email/update-spaces")
async def api_update_email_spaces(
    req: UpdateEmailSpacesRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update which spaces are included in the user's daily summary emails."""
    logger.info("Email spaces update requested by %s", current_user["email"])
    return await update_user_email_spaces(current_user["user_id"], req.space_ids)


# ---------------------------------------------------------------------------
# Proactive Agent Briefings
# ---------------------------------------------------------------------------


class UpdateBriefingRequest(BaseModel):
    briefing_enabled: bool = False
    briefing_hour: int = 8
    briefing_minute: int = 0
    stale_task_days: int = 3
    timezone: str = "America/New_York"


@app.get("/briefings/preferences")
async def api_get_briefing_preferences(
    current_user: dict = Depends(get_current_user),
):
    """Get the current user's briefing preferences."""
    from briefings import get_briefing_preferences

    return await get_briefing_preferences(current_user["user_id"])


@app.post("/briefings/preferences")
async def api_update_briefing_preferences(
    req: UpdateBriefingRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update the current user's briefing preferences and reschedule jobs."""
    from briefings import update_briefing_preferences
    from scheduler import remove_briefing_schedule, update_briefing_schedule

    logger.info(
        "Briefing update requested by %s: enabled=%s hour=%02d:%02d stale_days=%d",
        current_user["email"],
        req.briefing_enabled,
        req.briefing_hour,
        req.briefing_minute,
        req.stale_task_days,
    )

    prefs = await update_briefing_preferences(
        current_user["user_id"],
        briefing_enabled=req.briefing_enabled,
        briefing_hour=req.briefing_hour,
        briefing_minute=req.briefing_minute,
        stale_task_days=req.stale_task_days,
        timezone=req.timezone,
    )

    if req.briefing_enabled:
        update_briefing_schedule(
            current_user["user_id"],
            req.briefing_hour,
            req.briefing_minute,
            req.timezone,
        )
    else:
        remove_briefing_schedule(current_user["user_id"])

    return {"message": "Briefing preferences updated", "preferences": prefs}


@app.post("/briefings/trigger")
async def api_trigger_briefing(
    current_user: dict = Depends(get_current_user),
):
    """Manually trigger a morning briefing for the current user (for testing)."""
    from briefings import post_morning_briefing

    session_id = await post_morning_briefing(current_user["user_id"])
    if session_id:
        return {"ok": True, "session_id": session_id}
    raise HTTPException(status_code=500, detail="Failed to generate briefing")


@app.post("/briefings/trigger-nudges")
async def api_trigger_nudges(
    current_user: dict = Depends(get_current_user),
):
    """Manually trigger stale task nudges for the current user (for testing)."""
    from briefings import get_briefing_preferences, post_stale_task_nudges

    prefs = await get_briefing_preferences(current_user["user_id"])
    stale_days = prefs.get("stale_task_days", 3)
    nudged = await post_stale_task_nudges(
        current_user["user_id"], stale_days=stale_days
    )
    return {"ok": True, "nudged_sessions": nudged, "count": len(nudged)}


class ContactRequest(BaseModel):
    message: str


@app.post("/contact")
async def api_contact(
    req: ContactRequest,
    current_user: dict = Depends(get_current_user),
):
    """Send contact message to admin email."""
    try:
        if len(req.message) > 5000:
            raise HTTPException(
                status_code=400, detail="Message too long (max 5000 chars)"
            )

        logger.info("Contact message from %s", current_user["email"])

        # Import email sending function
        from email_summary import send_contact_message

        await send_contact_message(
            sender_email=current_user["email"],
            sender_name=current_user.get("first_name", ""),
            message=req.message,
        )

        return {"message": "Contact message sent successfully"}
    except Exception as e:
        logger.error(f"Error sending contact message: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send contact message")


@app.get("/insights")
async def get_insights(
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get insights and analytics for user's todos."""
    try:
        from insights_utils import generate_insights

        # Get todos for the specified space or all spaces
        if space_id:
            # Check if user has access to this space
            if not await user_in_space(current_user["user_id"], space_id):
                raise HTTPException(
                    status_code=403, detail="Access denied to this space"
                )
            todos = await get_todos(current_user["user_id"], space_id)
        else:
            # Get todos from all accessible spaces
            spaces = await get_spaces_for_user(current_user["user_id"])
            all_todos = []
            for space in spaces:
                space_todos = await get_todos(current_user["user_id"], space.id)
                all_todos.extend(space_todos)
            todos = all_todos

        # Convert todos to dictionaries if they aren't already
        todo_dicts = []
        for todo in todos:
            if hasattr(todo, "dict"):
                todo_dicts.append(todo.dict(by_alias=True))
            elif hasattr(todo, "__dict__"):
                todo_dicts.append(todo.__dict__)
            else:
                todo_dicts.append(dict(todo))

        # Use shared insights computation logic
        insights = generate_insights(todo_dicts)
        return insights

    except Exception as e:
        logger.error(f"Error getting insights: {e}")
        raise HTTPException(status_code=500, detail="Failed to get insights")


@app.get("/activity-feed")
async def api_get_activity_feed(
    space_id: Optional[str] = None,
    limit: int = 50,
    before: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get a chronological activity feed of all events (tasks, messages, journals)."""
    try:
        events = await get_activity_feed(
            user_id=current_user["user_id"],
            space_id=space_id,
            limit=min(limit, 100),
            before=before,
        )
        return events
    except Exception as e:
        logger.error(f"Error getting activity feed: {e}")
        raise HTTPException(status_code=500, detail="Failed to get activity feed")


class JournalCreateRequest(BaseModel):
    date: str  # YYYY-MM-DD format
    text: str
    space_id: Optional[str] = None


# Journal endpoints
@app.get("/journals", response_model=Union[JournalEntry, List[JournalEntry], None])
async def api_get_journal_entries(
    date: Optional[str] = None,
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get journal entries. If date is provided, get entry for that specific date. Otherwise get recent entries."""
    try:
        # Check space access if space_id provided
        if space_id is not None and not await user_in_space(
            current_user["user_id"], space_id
        ):
            raise HTTPException(status_code=403, detail="Access denied to this space")

        if date:
            # Get specific date entry
            entry = await get_journal_entry_by_date(
                current_user["user_id"], date, space_id
            )
            return entry
        else:
            # Get recent entries
            entries = await get_journal_entries(current_user["user_id"], space_id)
            return entries

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching journal entries: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch journal entries")


@app.post("/journals", response_model=JournalEntry)
async def api_create_journal_entry(
    request: JournalCreateRequest, current_user: dict = Depends(get_current_user)
):
    """Create or update a journal entry."""
    try:
        # Input length validation
        if len(request.text) > 50000:
            raise HTTPException(
                status_code=400, detail="Journal text too long (max 50000 chars)"
            )

        # Check space access if space_id provided
        if request.space_id is not None and not await user_in_space(
            current_user["user_id"], request.space_id
        ):
            raise HTTPException(status_code=403, detail="Access denied to this space")

        # Create journal entry
        entry = JournalEntry(
            user_id=current_user["user_id"],
            space_id=request.space_id,
            date=request.date,
            text=request.text,
        )

        result = await create_journal_entry(entry, current_user.get("timezone", "UTC"))
        logger.info(
            f"Journal entry created/updated for user {current_user['email']}, date {request.date}"
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating journal entry: {e}")
        raise HTTPException(status_code=500, detail="Failed to create journal entry")


@app.delete("/journals/{entry_id}")
async def api_delete_journal_entry(
    entry_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete a journal entry."""
    try:
        success = await delete_journal_entry(entry_id, current_user["user_id"])
        if success:
            logger.info(
                f"Journal entry {entry_id} deleted by user {current_user['email']}"
            )
            return {"message": "Journal entry deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Journal entry not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting journal entry: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete journal entry")


# ── Agent Memory Endpoints ────────────────────────────────────────────


@app.get("/memories")
async def api_list_memories(
    space_id: Optional[str] = None,
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List all agent memory facts for the current user/space."""
    from agent_memory import list_memories

    facts = await list_memories(current_user["user_id"], space_id, category)
    return [
        {
            "_id": f.id,
            "key": f.key,
            "value": f.value,
            "category": f.category,
            "agent_id": f.agent_id,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "updated_at": f.updated_at.isoformat() if f.updated_at else None,
        }
        for f in facts
    ]


@app.put("/memories")
async def api_save_memory(
    request: Request,
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Save or update a memory fact."""
    from agent_memory import save_memory

    body = await request.json()
    key = body.get("key", "").strip()
    value = body.get("value", "").strip()
    category = body.get("category")

    if not key or not value:
        raise HTTPException(status_code=400, detail="key and value are required")

    fact = await save_memory(current_user["user_id"], key, value, space_id, category)
    return {"key": fact.key, "value": fact.value, "category": fact.category}


@app.delete("/memories/{memory_id}")
async def api_delete_memory(
    memory_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a specific memory fact by its _id."""
    from agent_memory import delete_memory, delete_memory_by_key

    # Try deleting by ObjectId first, then fall back to key-based delete
    deleted = await delete_memory(memory_id, current_user["user_id"])
    if not deleted:
        deleted = await delete_memory_by_key(current_user["user_id"], memory_id)
    if deleted:
        return {"ok": True}
    raise HTTPException(status_code=404, detail="Memory not found")


@app.delete("/memories")
async def api_delete_all_memories(
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Delete all memory facts for the current user/space."""
    from agent_memory import delete_all_memories

    count = await delete_all_memories(current_user["user_id"], space_id)
    return {"deleted_count": count}


@app.get("/export")
async def export_data(
    data: str,
    space_id: str,
    format: str = "csv",
    current_user: dict = Depends(get_current_user),
):
    """Export user's todos or journal entries in JSON or CSV format."""
    valid_types = {"todos": todos_collection, "journals": journals_collection}
    if data not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid data type")

    if not await user_in_space(current_user["user_id"], space_id):
        raise HTTPException(
            status_code=403, detail="Not a member of the specified space"
        )

    collection = valid_types[data]
    query = {"user_id": current_user["user_id"], "space_id": space_id}
    cursor = collection.find(query)
    items = await cursor.to_list(length=None)
    for item in items:
        item.pop("_id", None)
        item.pop("user_id", None)
        item.pop("space_id", None)
        item.pop("created_offline", None)
        item["first_name"] = current_user.get("first_name", "")

    if format == "json":
        content = json.dumps(items, indent=2)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={data}.json"},
        )

    if format == "csv":
        if data == "todos":
            fields = [
                "text",
                "category",
                "priority",
                "dateAdded",
                "dueDate",
                "completed",
                "notes",
                "first_name",
            ]
        else:
            fields = ["date", "text", "first_name"]

        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for item in items:
            writer.writerow({field: item.get(field, "") for field in fields})

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={data}.csv"},
        )

    raise HTTPException(status_code=400, detail="Invalid format")


# ---------------------------------------------------------------------------
# Agent session messaging endpoints
# ---------------------------------------------------------------------------


class CreateSessionRequest(BaseModel):
    space_id: Optional[str] = None
    title: Optional[str] = None
    todo_id: Optional[str] = None
    initial_message: Optional[str] = None
    initial_role: str = "user"
    agent_id: Optional[str] = None


class PostMessageRequest(BaseModel):
    role: str = "user"
    content: str
    agent_id: Optional[str] = None
    interim: bool = False
    needs_human_response: bool = False


@app.post("/agent/sessions")
async def api_create_agent_session(
    req: CreateSessionRequest, current_user: dict = Depends(get_current_user)
):
    """Create a new messaging session, optionally linked to a todo."""
    user_id = current_user["user_id"]

    # If todo_id provided, check for existing session
    if req.todo_id:
        existing = await find_session_by_todo(user_id, req.todo_id)
        if existing:
            return existing

    title = req.title or req.initial_message or "New session"
    session_id = await create_chat_session(
        user_id, req.space_id, title, todo_id=req.todo_id, agent_id=req.agent_id
    )

    # Post initial message if provided
    if req.initial_message:
        await append_message(session_id, user_id, req.initial_role, req.initial_message)

    session = await find_session_by_todo(user_id, req.todo_id) if req.todo_id else None
    if not session:
        from bson import ObjectId as _ObjId

        from chat_sessions import sessions_collection

        doc = await sessions_collection.find_one({"_id": _ObjId(session_id)})
        if doc:
            doc["_id"] = str(doc["_id"])
            session = doc

    return session


@app.post("/agent/sessions/{session_id}/messages")
async def api_post_session_message(
    session_id: str,
    req: PostMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    """Post a message to a session."""
    user_id = current_user["user_id"]
    message = await append_message(
        session_id,
        user_id,
        req.role,
        req.content,
        req.agent_id,
        interim=req.interim,
        needs_human_response=req.needs_human_response,
    )
    return {"ok": True, "message": message}


@app.post("/agent/sessions/{session_id}/mark-read")
async def api_mark_session_read(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Mark a session's agent replies as read."""
    ok = await mark_session_read(session_id, current_user["user_id"])
    return {"ok": ok}


@app.get("/todos/{todo_id}/subtasks")
async def api_get_subtasks(
    todo_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get subtasks of a parent todo, ordered by the parent's subtask_ids array."""
    return await get_subtasks(todo_id)


@app.get("/todos/{todo_id}")
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


@app.get("/memory-logs")
async def api_get_memory_logs(
    space_id: Optional[str] = None,
    limit: int = 14,
    current_user: dict = Depends(get_current_user),
):
    """Return recent daily memory logs for the current user."""
    sid = space_id or current_user.get("active_space_id", "")
    logs = await get_recent_memory_logs(
        current_user["user_id"], sid, limit=min(limit, 30)
    )
    result = []
    for log in logs:
        result.append(
            {
                "_id": log.id,
                "date": log.date,
                "entries": log.entries,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "updated_at": log.updated_at.isoformat() if log.updated_at else None,
            }
        )
    return result


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    # Only enable hot reload in development
    is_dev = os.environ.get("ENV", "development") == "development"
    uvicorn.run(app, host="0.0.0.0", port=port, reload=is_dev)
