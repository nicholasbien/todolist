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

from app import app  # noqa: E402


@pytest_asyncio.fixture
async def client():
    """HTTPX client running against the FastAPI app."""
    os.environ.setdefault("USE_MOCK_DB", "true")

    # Reset database connections to avoid event loop issues between tests
    import auth
    import categories
    import spaces
    import todos
    from mongomock_motor import AsyncMongoMockClient

    # Recreate database connections in the current event loop context
    auth.client = AsyncMongoMockClient()
    auth.db = auth.client.todo_db
    auth.users_collection = auth.db.users
    auth.sessions_collection = auth.db.sessions

    todos.client = AsyncMongoMockClient()
    todos.db = todos.client.todo_db
    todos.todos_collection = todos.db.todos

    categories.client = AsyncMongoMockClient()
    categories.db = categories.client.todo_db
    categories.categories_collection = categories.db.categories

    spaces.client = AsyncMongoMockClient()
    spaces.db = spaces.client.todo_db
    spaces.spaces_collection = spaces.db.spaces

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
