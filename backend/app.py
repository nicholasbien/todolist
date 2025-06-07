import json
import logging
import os
from collections import defaultdict
from typing import Dict, List, Optional

from auth import (
    LoginRequest,
    SignupRequest,
    UpdateNameRequest,
    cleanup_expired_sessions,
    login_user,
    logout_user,
    signup_user,
    update_user_name,
    verify_session,
)
from categories import (
    DEFAULT_CATEGORIES,
    Category,
    add_category,
    delete_category,
    get_categories,
    init_default_categories,
)

# Import the classification function and todo management
from classify import classify_task
from email_summary import send_daily_summary
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from scheduler import get_scheduler_status, start_scheduler
from todos import Todo, complete_todo, create_todo, delete_todo, get_todos, health_check, update_todo_fields

# Set up logging with more detail
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Todo List API")

# Rate limiting for email summaries
email_rate_limiter: Dict[str, List] = defaultdict(list)

# Enable CORS - specifically for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods including DELETE and PUT
    allow_headers=["*"],
)


class ClassificationRequest(BaseModel):
    text: str
    categories: Optional[List[str]] = DEFAULT_CATEGORIES


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


@app.post("/classify")
async def classify(request: ClassificationRequest):
    """
    Classify a task based on its text description.
    Returns category and priority.
    """
    try:
        logger.info(f"Starting classification for text: {request.text[:30]}...")
        result = await classify_task(request.text, request.categories or [])
        logger.info(f"Classification completed with result: {result}")
        return result
    except Exception as e:
        logger.error(f"Error in classification: {str(e)}")
        return {"category": "General", "priority": "Low"}


# Add todo management endpoints
@app.get("/todos", response_model=List[Todo])
async def api_get_todos(current_user: dict = Depends(get_current_user)):
    logger.info(f"Fetching todos for user: {current_user['email']}")
    result = await get_todos(current_user["user_id"])
    logger.info(f"Fetched {len(result)} todos")
    return result


@app.post("/todos", response_model=Todo)
async def api_create_todo(request: Request, current_user: dict = Depends(get_current_user)):
    try:
        # Log the raw request body for debugging
        body = await request.json()
        logger.info(f"Received todo creation request: {json.dumps(body)}")

        # Add user_id to the todo
        body["user_id"] = current_user["user_id"]

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
    await init_default_categories()
    await cleanup_expired_sessions()
    start_scheduler()


# Category management endpoints
@app.get("/categories", response_model=List[str])
async def api_get_categories():
    """Get all categories."""
    logger.info("Fetching all categories")
    return await get_categories()


@app.post("/categories")
async def api_add_category(category: Category):
    """Add a new category."""
    logger.info(f"Adding new category: {category.name}")
    return await add_category(category)


@app.delete("/categories/{name}")
async def api_delete_category(name: str):
    """Delete a category."""
    logger.info(f"Deleting category: {name}")
    return await delete_category(name)


# Email summary endpoints
@app.post("/email/send-summary")
async def api_send_summary(current_user: dict = Depends(get_current_user)):
    """Send daily summary email to current user."""
    logger.info(f"Manual summary request for user: {current_user['email']}")
    success = await send_daily_summary(
        current_user["user_id"],
        current_user["email"],
        current_user.get("first_name") or "",
    )

    if success:
        return {"message": "Summary email sent successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send summary email")


@app.get("/email/scheduler-status")
async def api_scheduler_status():
    """Get scheduler status."""
    return get_scheduler_status()


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
