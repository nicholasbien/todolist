#!/usr/bin/env python3
"""
Pytest configuration and shared fixtures.
"""

import asyncio
import os
import sys

import httpx
import pytest
from httpx import ASGITransport

# Add the backend directory to Python path so we can import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """HTTPX client running against the FastAPI app."""
    os.environ.setdefault("USE_MOCK_DB", "true")
    transport = ASGITransport(app)
    async_client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

    class ClientWrapper:
        def __init__(self, async_client):
            self._async = async_client

        def _run(self, coro):
            return asyncio.get_event_loop().run_until_complete(coro)

        # Synchronous helpers for regular tests
        def get(self, *args, **kwargs):
            return self._run(self._async.get(*args, **kwargs))

        def post(self, *args, **kwargs):
            return self._run(self._async.post(*args, **kwargs))

        def put(self, *args, **kwargs):
            return self._run(self._async.put(*args, **kwargs))

        def delete(self, *args, **kwargs):
            return self._run(self._async.delete(*args, **kwargs))

        # Expose async client for async tests
        async def aget(self, *args, **kwargs):
            return await self._async.get(*args, **kwargs)

        async def apost(self, *args, **kwargs):
            return await self._async.post(*args, **kwargs)

        async def aput(self, *args, **kwargs):
            return await self._async.put(*args, **kwargs)

        async def adelete(self, *args, **kwargs):
            return await self._async.delete(*args, **kwargs)

        async def aclose(self):
            await self._async.aclose()

    client = ClientWrapper(async_client)
    try:
        yield client
    finally:
        asyncio.get_event_loop().run_until_complete(client.aclose())


@pytest.fixture
def test_email():
    """Test email for authentication tests."""
    return "pytest@example.com"


@pytest.fixture
def test_email2():
    """Second test email for user isolation tests."""
    return "pytest2@example.com"
