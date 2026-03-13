import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from agent import agent_router
from routers.auth_router import router as auth_router
from routers.briefings_router import router as briefings_router
from routers.categories_router import router as categories_router
from routers.email_router import router as email_router
from routers.journals_router import router as journals_router
from routers.misc_router import router as misc_router
from routers.sessions_router import router as sessions_router
from routers.spaces_router import router as spaces_router
from routers.todos_router import router as todos_router

# Set up logging with more detail
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize application on startup and cleanup on shutdown."""
    logger.info("FastAPI startup (lifespan) event triggered")

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
        from categories import init_category_indexes, migrate_legacy_categories
        from chat_sessions import init_chat_session_indexes
        from chats import init_chat_indexes

        # Test database connection first
        from db import check_database_health
        from journals import init_journal_indexes
        from scheduler import start_scheduler
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
            ("init_default_categories", None),
            ("cleanup_expired_sessions", cleanup_expired_sessions),
        ]

        # Import init_default_categories separately since it was imported at top level before
        from categories import init_default_categories

        # Replace the None placeholder
        initialization_steps[12] = ("init_default_categories", init_default_categories)

        failed_steps = []
        for step_name, step_func in initialization_steps:
            try:
                logger.info(f"Starting {step_name}...")
                await step_func()  # type: ignore
                logger.info(f"{step_name} completed")
            except Exception as e:
                logger.error(f"{step_name} failed: {e}")
                failed_steps.append(step_name)
                # Don't let individual failures stop the entire startup

        # Start scheduler (non-critical, should not fail startup)
        try:
            logger.info("Starting scheduler...")
            start_scheduler()
            logger.info("Scheduler started")
        except Exception as e:
            logger.error(f"Scheduler failed to start: {e}")
            failed_steps.append("scheduler")

        if failed_steps:
            logger.warning(f"Startup completed with {len(failed_steps)} failed steps: {', '.join(failed_steps)}")
        else:
            logger.info("All initialization completed successfully")

        # Warn about optional configuration
        if not os.getenv("OPENAI_API_KEY"):
            logger.warning(
                "OPENAI_API_KEY not set — AI classification and assistant features are disabled. "
                "The app is fully functional for task management without it."
            )

        logger.info("Startup event completed")

    except Exception as e:
        logger.error(f"Critical startup error: {e}")
        # Don't re-raise to prevent crash loop
        logger.error("App started with startup errors - some features may not work correctly")

    # Application is now running
    yield

    # Cleanup on shutdown
    logger.info("FastAPI shutdown event triggered")


app = FastAPI(title="AI Todo List API", lifespan=lifespan)

# Include agent router (streaming AI chat — already uses APIRouter)
app.include_router(agent_router)

# Include domain routers
app.include_router(auth_router)
app.include_router(todos_router)
app.include_router(categories_router)
app.include_router(spaces_router)
app.include_router(journals_router)
app.include_router(sessions_router)
app.include_router(email_router)
app.include_router(briefings_router)
app.include_router(misc_router)

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
    "http://localhost:3141,https://app.todolist.nyc,capacitor://localhost,ionic://localhost",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/")
async def root():
    return {"message": "AI Todo List API is running"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8141))
    # Only enable hot reload in development
    is_dev = os.environ.get("ENV", "development") == "development"
    uvicorn.run(app, host="0.0.0.0", port=port, reload=is_dev)
