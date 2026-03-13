#!/usr/bin/env python3
"""
Pytest configuration and shared fixtures.
"""

import os
import sys

import httpx
import pytest
import pytest_asyncio

# Add the backend directory to Python path so we can import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_module  # noqa: E402
from app import app  # noqa: E402


@pytest_asyncio.fixture
async def client():
    """HTTPX client running against the FastAPI app."""
    os.environ.setdefault("USE_MOCK_DB", "true")
    os.environ.setdefault("ALLOW_TEST_AUTH_BYPASS", "true")

    # Reset database connections to avoid event loop issues between tests
    from mongomock_motor import AsyncMongoMockClient

    import activity_feed
    import auth
    import categories
    import chat_sessions
    import chats
    import db
    import journals
    import spaces
    import todos

    # Recreate database connections in the current event loop context
    # This ensures each test gets a fresh database connection in the correct event loop
    db.client = AsyncMongoMockClient()
    db.db = db.client.todo_db

    import briefings

    # Update all module collection references to use the new shared connection
    auth.users_collection = db.db.users
    auth.sessions_collection = db.db.sessions
    todos.todos_collection = db.db.todos
    todos.db = db.db  # health_check() uses todos.db.command("ping")
    categories.categories_collection = db.db.categories
    spaces.spaces_collection = db.db.spaces
    chats.chats_collection = db.db.chats
    journals.journals_collection = db.db.journals
    chat_sessions.sessions_collection = db.db.chat_sessions
    chat_sessions.trajectories_collection = db.db.chat_trajectories
    briefings.users_collection = db.db.users
    briefings.todos_collection = db.db.todos
    briefings.journals_collection = db.db.journals

    import agent_memory

    agent_memory.memories_collection = db.db.agent_memories
    agent_memory.memory_logs_collection = db.db.agent_memory_logs

    activity_feed.todos_collection = db.db.todos
    activity_feed.sessions_collection = db.db.chat_sessions
    activity_feed.trajectories_collection = db.db.chat_trajectories
    activity_feed.journals_collection = db.db.journals

    # Also update collection references that app.py imported directly
    # (from X import Y creates a local binding that isn't updated by X.Y = ...)
    app_module.todos_collection = db.db.todos
    app_module.journals_collection = db.db.journals

    # Update router module collection references (same local-binding issue)
    from routers import misc_router, todos_router

    todos_router.todos_collection = db.db.todos
    misc_router.todos_collection = db.db.todos
    misc_router.journals_collection = db.db.journals

    # Clear global MCP session state to prevent stale connections across tests
    from agent.agent import mcp_contexts, mcp_sessions

    mcp_sessions.clear()
    mcp_contexts.clear()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://testserver") as async_client:
        yield async_client


@pytest.fixture
def test_email():
    """Test email for authentication tests."""
    return "pytest@example.com"


@pytest.fixture
def test_email2():
    """Second test email for user isolation tests."""
    return "pytest2@example.com"


@pytest.fixture
def test_email3():
    """Third test email for collaboration tests."""
    return "pytest3@example.com"


async def get_token(client, email):
    """Helper function to get authentication token for tests."""
    from tests.test_auth import get_verification_code_from_db

    await client.post("/auth/signup", json={"email": email})
    code = await get_verification_code_from_db(email)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    resp = await client.post("/auth/login", json={"email": email, "code": code})
    assert resp.status_code == 200
    return resp.json()["token"]
