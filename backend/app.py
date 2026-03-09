import csv
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from io import StringIO
from typing import List, Optional, Union

import httpx
from agent import agent_router
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
from bs4 import BeautifulSoup
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
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

# Import journal functions
from journals import (
    JournalEntry,
    create_journal_entry,
    delete_journal_entry,
    get_journal_entries,
    get_journal_entry_by_date,
    journals_collection,
)
from pydantic import BaseModel
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
    get_todos,
    health_check,
    todos_collection,
    update_todo_fields,
)

# Set up logging with more detail
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
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
            logger.warning(f"⚠️  Startup completed with {len(failed_steps)} failed steps: {', '.join(failed_steps)}")
        else:
            logger.info("🚀 All initialization completed successfully")

        logger.info("✅ Startup event completed")

    except Exception as e:
        logger.error(f"Critical startup error: {e}")
        # Don't re-raise to prevent crash loop
        logger.error("App started with startup errors - some features may not work correctly")

    # Application is now running
    yield

    # Cleanup on shutdown
    logger.info("🔄 FastAPI shutdown event triggered")


app = FastAPI(title="AI Todo List API", lifespan=lifespan)

# Include agent router
app.include_router(agent_router)

MAX_HISTORY = 10


# Enable CORS - specifically for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods including DELETE and PUT
    allow_headers=["*"],
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
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

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
async def api_update_name(request: UpdateNameRequest, current_user: dict = Depends(get_current_user)):
    """Update user's first name."""
    logger.info(f"Update name request for user: {current_user['email']}, name: {request.first_name}")
    return await update_user_name(current_user["user_id"], request.first_name)


@app.delete("/auth/me")
async def api_delete_account(current_user: dict = Depends(get_current_user)):
    """Delete user account and all associated data."""
    logger.info(f"Account deletion request for user: {current_user['email']}")
    return await delete_user_account(current_user["user_id"])


# Add todo management endpoints
@app.get("/todos", response_model=List[Todo])
async def api_get_todos(space_id: str | None = None, current_user: dict = Depends(get_current_user)):
    logger.info(f"Fetching todos for user: {current_user['email']} in space {space_id}")
    result = await get_todos(current_user["user_id"], space_id)
    logger.info(f"Fetched {len(result)} todos")
    return result


@app.post("/todos", response_model=Todo)
async def api_create_todo(request: Request, current_user: dict = Depends(get_current_user)):
    try:
        # Log the raw request body for debugging
        body = await request.json()
        logger.info(f"Received todo creation request: {json.dumps(body)}")

        body["user_id"] = current_user["user_id"]
        if "space_id" not in body:
            body["space_id"] = None

        # Determine the text to classify
        text = body.get("text", "").strip()
        classify_text = text

        # Detect if text is a URL and fetch page title
        if text.startswith("http://") or text.startswith("https://"):
            body["link"] = text
            try:
                headers = {
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                    )
                }
                async with httpx.AsyncClient(timeout=5, headers=headers, follow_redirects=True) as client:
                    resp = await client.get(text)
                    print(f"URL fetch response: {resp.status_code} for {text}")
                    if resp.status_code == 200:
                        soup = BeautifulSoup(resp.text, "html.parser")
                        title_tag = soup.find("title")
                        if title_tag and title_tag.text:
                            page_title = title_tag.text.strip()
                            print(f"Extracted title: '{page_title}' from {text}")
                            body["text"] = page_title
                            classify_text = page_title
                        else:
                            print(f"No title found for {text}")
                    else:
                        print(f"HTTP error {resp.status_code} for {text}")
            except Exception as e:
                print(f"Exception fetching {text}: {e}")
                logger.error(f"Failed to fetch title for {text}: {e}")

        # Only classify if not created offline and no category provided
        if not body.get("created_offline", False) and not body.get("category"):
            try:
                # Get categories (this automatically ensures "General" exists)
                categories_list = await get_categories(body.get("space_id")) if body.get("space_id") else []

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
                session_id = await create_chat_session(
                    current_user["user_id"],
                    body.get("space_id"),
                    todo_dict["text"],
                    todo_id=todo_id,
                    agent_id=auto_agent_id,
                )
                await append_message(session_id, current_user["user_id"], role, initial_msg)
            except Exception as e:
                logger.error(f"Failed to auto-create session for todo: {e}")

        return result
    except Exception as e:
        logger.error(f"Error creating todo: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating todo: {str(e)}")


@app.put("/todos/reorder")
async def api_reorder_todos(request: Request, current_user: dict = Depends(get_current_user)):
    try:
        body = await request.json()
        todo_ids = body.get("todoIds", [])
        if not todo_ids:
            raise HTTPException(status_code=400, detail="todoIds required")
        from bson import ObjectId

        for i, todo_id in enumerate(todo_ids):
            await todos_collection.update_one({"_id": ObjectId(todo_id)}, {"$set": {"sortOrder": i}})
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reordering todos: {repr(e)}")
        raise HTTPException(status_code=500, detail=f"Error reordering todos: {repr(e)}")


@app.delete("/todos/{todo_id}")
async def api_delete_todo(todo_id: str, current_user: dict = Depends(get_current_user)):
    logger.info(f"Deleting todo with ID: {todo_id} for user: {current_user['email']}")
    return await delete_todo(todo_id, current_user["user_id"])


@app.put("/todos/{todo_id}/complete")
async def api_complete_todo(todo_id: str, current_user: dict = Depends(get_current_user)):
    logger.info(f"Marking todo as complete with ID: {todo_id} for user: {current_user['email']}")
    return await complete_todo(todo_id, current_user["user_id"])


@app.put("/todos/{todo_id}", response_model=Todo)
async def api_update_todo(todo_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    try:
        body = await request.json()

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
            if new_space_id and not await user_in_space(current_user["user_id"], new_space_id):
                raise HTTPException(status_code=403, detail="Not authorized to move to target space")
            updates["space_id"] = new_space_id
        if "agent_id" in body:
            updates["agent_id"] = body["agent_id"]

        if not updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        logger.info(f"Updating todo {todo_id} with: {updates} for user: {current_user['email']}")
        logger.info(f"CURRENT_USER DEBUG: {current_user}")
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
                            {"_id": _ObjId(str(session["_id"]))}, {"$set": {"agent_id": body["agent_id"]}}
                        )
                    else:
                        await db.sessions.update_one({"_id": _ObjId(str(session["_id"]))}, {"$unset": {"agent_id": 1}})
            except Exception as e:
                logger.error(f"Failed to update session agent_id: {e}")

        return result
    except HTTPException:
        # Re-raise HTTP exceptions (like 403, 404) without converting to 500
        raise
    except Exception as e:
        logger.error(f"Error updating todo - Exception type: {type(e)}, Exception args: {e.args}, Exception: {repr(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating todo: {repr(e)}")


@app.get("/health")
async def api_health_check():
    logger.info("Health check requested")
    return await health_check()


async def rename_default_spaces_to_personal():
    """One-time migration to rename all 'Default' spaces to 'Personal'."""
    try:
        from spaces import spaces_collection

        # Update all spaces with name "Default" to "Personal"
        result = await spaces_collection.update_many({"name": "Default"}, {"$set": {"name": "Personal"}})

        if result.modified_count > 0:
            logger.info(f"Renamed {result.modified_count} 'Default' spaces to 'Personal'")
        else:
            logger.info("No 'Default' spaces found to rename")

    except Exception as e:
        logger.error(f"Error renaming Default spaces to Personal: {e}")


# Category management endpoints
@app.get("/categories", response_model=List[str])
async def api_get_categories(space_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get categories for a space, or default categories if no space_id provided."""
    if space_id is not None and not await user_in_space(current_user["user_id"], space_id):
        raise HTTPException(status_code=403, detail="Not in space")
    logger.info("Fetching categories for space %s", space_id or "default")
    return await get_categories(space_id)


@app.post("/categories")
async def api_add_category(category: Category, current_user: dict = Depends(get_current_user)):
    """Add a new category to a space."""
    if category.space_id is not None and not await user_in_space(current_user["user_id"], category.space_id):
        raise HTTPException(status_code=403, detail="Not in space")
    logger.info("Adding new category %s to space %s", category.name, category.space_id or "default")
    return await add_category(category)


@app.put("/categories/{name}")
async def api_rename_category(
    name: str, body: CategoryRename, space_id: Optional[str] = None, current_user: dict = Depends(get_current_user)
):
    """Rename an existing category within a space."""
    if space_id is not None and not await user_in_space(current_user["user_id"], space_id):
        raise HTTPException(status_code=403, detail="Not in space")
    logger.info("Renaming category %s to %s in space %s", name, body.new_name, space_id or "default")
    return await rename_category(name, body.new_name, space_id)


@app.delete("/categories/{name}")
async def api_delete_category(
    name: str, space_id: Optional[str] = None, current_user: dict = Depends(get_current_user)
):
    """Delete a category from a space."""
    if space_id is not None and not await user_in_space(current_user["user_id"], space_id):
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
async def api_create_space_endpoint(req: SpaceCreateRequest, current_user: dict = Depends(get_current_user)):
    return await create_space(req.name, current_user["user_id"])


@app.post("/spaces/{space_id}/invite")
async def api_invite_members(space_id: str, req: InviteRequest, current_user: dict = Depends(get_current_user)):
    await invite_members(space_id, current_user["email"], req.emails, inviter_user_id=current_user["user_id"])
    return {"message": "Invitations sent"}


@app.get("/spaces/{space_id}/members")
async def api_list_members(space_id: str, current_user: dict = Depends(get_current_user)):
    if not await user_in_space(current_user["user_id"], space_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    return await list_space_members(space_id, current_user["user_id"])


@app.post("/spaces/{space_id}/leave")
async def api_leave_space(space_id: str, current_user: dict = Depends(get_current_user)):
    if not await user_in_space(current_user["user_id"], space_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    return await leave_space(space_id, current_user["user_id"])


@app.put("/spaces/{space_id}", response_model=Space)
async def api_update_space(space_id: str, req: SpaceUpdateRequest, current_user: dict = Depends(get_current_user)):
    return await update_space(space_id, current_user["user_id"], req.name, req.collaborative)


@app.delete("/spaces/{space_id}")
async def api_delete_space(space_id: str, current_user: dict = Depends(get_current_user)):
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
    await update_user_summary_time(current_user["user_id"], req.email_enabled, req.hour, req.minute, req.timezone)

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
    return await update_user_email_instructions(current_user["user_id"], req.instructions)


@app.post("/email/update-spaces")
async def api_update_email_spaces(
    req: UpdateEmailSpacesRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update which spaces are included in the user's daily summary emails."""
    logger.info("Email spaces update requested by %s", current_user["email"])
    return await update_user_email_spaces(current_user["user_id"], req.space_ids)


class ContactRequest(BaseModel):
    message: str


@app.post("/contact")
async def api_contact(
    req: ContactRequest,
    current_user: dict = Depends(get_current_user),
):
    """Send contact message to admin email."""
    try:
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
                raise HTTPException(status_code=403, detail="Access denied to this space")
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


class JournalCreateRequest(BaseModel):
    date: str  # YYYY-MM-DD format
    text: str
    space_id: Optional[str] = None


# Journal endpoints
@app.get("/journals", response_model=Union[JournalEntry, List[JournalEntry], None])
async def api_get_journal_entries(
    date: Optional[str] = None, space_id: Optional[str] = None, current_user: dict = Depends(get_current_user)
):
    """Get journal entries. If date is provided, get entry for that specific date. Otherwise get recent entries."""
    try:
        # Check space access if space_id provided
        if space_id is not None and not await user_in_space(current_user["user_id"], space_id):
            raise HTTPException(status_code=403, detail="Access denied to this space")

        if date:
            # Get specific date entry
            entry = await get_journal_entry_by_date(current_user["user_id"], date, space_id)
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
async def api_create_journal_entry(request: JournalCreateRequest, current_user: dict = Depends(get_current_user)):
    """Create or update a journal entry."""
    try:
        # Check space access if space_id provided
        if request.space_id is not None and not await user_in_space(current_user["user_id"], request.space_id):
            raise HTTPException(status_code=403, detail="Access denied to this space")

        # Create journal entry
        entry = JournalEntry(
            user_id=current_user["user_id"], space_id=request.space_id, date=request.date, text=request.text
        )

        result = await create_journal_entry(entry, current_user.get("timezone", "UTC"))
        logger.info(f"Journal entry created/updated for user {current_user['email']}, date {request.date}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating journal entry: {e}")
        raise HTTPException(status_code=500, detail="Failed to create journal entry")


@app.delete("/journals/{entry_id}")
async def api_delete_journal_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a journal entry."""
    try:
        success = await delete_journal_entry(entry_id, current_user["user_id"])
        if success:
            logger.info(f"Journal entry {entry_id} deleted by user {current_user['email']}")
            return {"message": "Journal entry deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Journal entry not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting journal entry: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete journal entry")


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
        raise HTTPException(status_code=403, detail="Not a member of the specified space")

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


@app.post("/agent/sessions")
async def api_create_agent_session(req: CreateSessionRequest, current_user: dict = Depends(get_current_user)):
    """Create a new messaging session, optionally linked to a todo."""
    user_id = current_user["user_id"]

    # If todo_id provided, check for existing session
    if req.todo_id:
        existing = await find_session_by_todo(user_id, req.todo_id)
        if existing:
            return existing

    title = req.title or req.initial_message or "New session"
    session_id = await create_chat_session(user_id, req.space_id, title, todo_id=req.todo_id, agent_id=req.agent_id)

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
    message = await append_message(session_id, user_id, req.role, req.content, req.agent_id, interim=req.interim)
    return {"ok": True, "message": message}


@app.post("/agent/sessions/{session_id}/mark-read")
async def api_mark_session_read(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Mark a session's agent replies as read."""
    ok = await mark_session_read(session_id, current_user["user_id"])
    return {"ok": ok}


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
    # Check space access
    if doc.get("space_id") and not await user_in_space(current_user["user_id"], doc["space_id"]):
        raise HTTPException(status_code=403, detail="Not in space")
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


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    # Only enable hot reload in development
    is_dev = os.environ.get("ENV", "development") == "development"
    uvicorn.run(app, host="0.0.0.0", port=port, reload=is_dev)
