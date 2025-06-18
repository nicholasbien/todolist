import json
import logging
import os
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional

import httpx
from auth import (
    LoginRequest,
    SignupRequest,
    UpdateNameRequest,
    cleanup_expired_sessions,
    login_user,
    logout_user,
    signup_user,
    update_user_email_instructions,
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
from chatbot import answer_question

# Import the classification function and todo management
from classify import classify_task
from email_summary import send_daily_summary
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from scheduler import get_scheduler_status, start_scheduler, update_schedule_time
from spaces import (
    create_space,
    delete_space,
    get_spaces_for_user,
    invite_members,
    leave_space,
    list_space_members,
    update_space,
    user_in_space,
)
from todos import Todo, complete_todo, create_todo, delete_todo, get_todos, health_check, update_todo_fields

# Set up logging with more detail
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Todo List API")

# In-memory conversation history
conversations: Dict[str, List[dict]] = defaultdict(list)
MAX_HISTORY = 20


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
                categories_list = await get_categories(body.get("space_id")) if body.get("space_id") else []
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

        # Create Todo object from request data
        todo = Todo(**body)
        logger.info(f"Created Todo object: {todo}")

        # Create the todo in the database
        result = await create_todo(todo)
        logger.info(f"Todo created successfully: {result}")
        return result
    except Exception as e:
        logger.error(f"Error creating todo: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating todo: {str(e)}")


@app.delete("/todos/{todo_id}")
async def api_delete_todo(todo_id: str, current_user: dict = Depends(get_current_user)):
    logger.info(f"Deleting todo with ID: {todo_id} for user: {current_user['email']}")
    return await delete_todo(todo_id, current_user["user_id"])


@app.put("/todos/{todo_id}/complete")
async def api_complete_todo(todo_id: str, current_user: dict = Depends(get_current_user)):
    logger.info(f"Marking todo as complete with ID: {todo_id} for user: {current_user['email']}")
    return await complete_todo(todo_id, current_user["user_id"])


@app.put("/todos/{todo_id}")
async def api_update_todo(todo_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    try:
        body = await request.json()

        # Build updates dict from request body
        updates = {}
        if "category" in body:
            updates["category"] = body["category"]
        if "priority" in body:
            updates["priority"] = body["priority"]

        if not updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        logger.info(f"Updating todo {todo_id} with: {updates} for user: {current_user['email']}")
        return await update_todo_fields(todo_id, updates, current_user["user_id"])
    except Exception as e:
        logger.error(f"Error updating todo: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating todo: {str(e)}")


@app.get("/health")
async def api_health_check():
    logger.info("Health check requested")
    return await health_check()


@app.on_event("startup")
async def startup_event():
    """Initialize default categories, cleanup expired sessions, and start scheduler."""
    # Skip startup tasks in test environment
    if not os.getenv("USE_MOCK_DB"):
        # Migrate legacy data to have space_id fields
        await migrate_legacy_categories()
        # Also migrate legacy todos
        from todos import init_todo_indexes, migrate_legacy_todos

        await migrate_legacy_todos()
        await init_todo_indexes()
        # Initialize default categories for default space (no space_id)
        await init_default_categories()
        await cleanup_expired_sessions()
        start_scheduler()


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
@app.get("/spaces")
async def api_get_spaces(current_user: dict = Depends(get_current_user)):
    return await get_spaces_for_user(current_user["user_id"])


@app.post("/spaces")
async def api_create_space_endpoint(req: SpaceCreateRequest, current_user: dict = Depends(get_current_user)):
    return await create_space(req.name, current_user["user_id"])


@app.post("/spaces/{space_id}/invite")
async def api_invite_members(space_id: str, req: InviteRequest, current_user: dict = Depends(get_current_user)):
    await invite_members(space_id, current_user["email"], req.emails)
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


@app.put("/spaces/{space_id}")
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


class ContactRequest(BaseModel):
    message: str


class ChatRequest(BaseModel):
    question: str


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


@app.post("/chat")
async def api_chat(
    req: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """Answer user questions about their todos using OpenAI."""
    try:
        spaces = await get_spaces_for_user(current_user["user_id"])
        spaces_data = []
        for space in spaces:
            todos = await get_todos(current_user["user_id"], space.id)
            todos_dict = [todo.dict() if hasattr(todo, "dict") else todo for todo in todos]
            spaces_data.append({"space": space.name, "todos": todos_dict})

        history = conversations[current_user["user_id"]]
        answer = await answer_question(req.question, spaces_data, history)

        history.append({"role": "user", "content": req.question})
        history.append({"role": "assistant", "content": answer})
        if len(history) > MAX_HISTORY:
            conversations[current_user["user_id"]] = history[-MAX_HISTORY:]
        else:
            conversations[current_user["user_id"]] = history

        return {"answer": answer}
    except Exception as e:
        logger.error(f"Chatbot error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate answer")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
