#!/usr/bin/env python3
"""
Tests for the agent memory system.
Run with: pytest tests/test_agent_memory.py -v
"""

import pytest
from tests.conftest import get_token


@pytest.mark.asyncio
async def test_save_and_list_memories(client):
    """Test saving and listing memory facts via API."""
    token = await get_token(client, "memory_test@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Save a memory fact
    resp = await client.put(
        "/memories",
        json={"key": "preferred_name", "value": "Nick", "category": "preference"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["key"] == "preferred_name"
    assert data["value"] == "Nick"
    assert data["category"] == "preference"

    # Save another memory
    resp = await client.put(
        "/memories",
        json={"key": "timezone", "value": "America/New_York", "category": "preference"},
        headers=headers,
    )
    assert resp.status_code == 200

    # List all memories
    resp = await client.get("/memories", headers=headers)
    assert resp.status_code == 200
    memories = resp.json()
    assert len(memories) == 2
    keys = {m["key"] for m in memories}
    assert "preferred_name" in keys
    assert "timezone" in keys

    # Filter by category
    resp = await client.get("/memories?category=preference", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_update_memory(client):
    """Test updating an existing memory fact."""
    token = await get_token(client, "memory_update@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Save initial value
    resp = await client.put(
        "/memories",
        json={"key": "role", "value": "Engineer"},
        headers=headers,
    )
    assert resp.status_code == 200

    # Update it
    resp = await client.put(
        "/memories",
        json={"key": "role", "value": "Senior Engineer"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == "Senior Engineer"

    # Verify only one entry
    resp = await client.get("/memories", headers=headers)
    assert resp.status_code == 200
    memories = resp.json()
    assert len(memories) == 1
    assert memories[0]["value"] == "Senior Engineer"


@pytest.mark.asyncio
async def test_delete_memory(client):
    """Test deleting a specific memory fact."""
    token = await get_token(client, "memory_delete@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Save a memory
    await client.put(
        "/memories",
        json={"key": "temp_fact", "value": "temporary"},
        headers=headers,
    )

    # Delete it
    resp = await client.delete("/memories/temp_fact", headers=headers)
    assert resp.status_code == 200

    # Verify it's gone
    resp = await client.get("/memories", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_delete_nonexistent_memory(client):
    """Test deleting a memory that doesn't exist returns 404."""
    token = await get_token(client, "memory_404@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.delete("/memories/nonexistent_key", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_all_memories(client):
    """Test deleting all memories for a user."""
    token = await get_token(client, "memory_delall@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Save several memories
    for key in ["fact1", "fact2", "fact3"]:
        await client.put(
            "/memories",
            json={"key": key, "value": f"value_{key}"},
            headers=headers,
        )

    # Delete all
    resp = await client.delete("/memories", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["deleted_count"] == 3

    # Verify empty
    resp = await client.get("/memories", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_save_memory_validation(client):
    """Test that empty key or value is rejected."""
    token = await get_token(client, "memory_val@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Empty key
    resp = await client.put(
        "/memories",
        json={"key": "", "value": "something"},
        headers=headers,
    )
    assert resp.status_code == 400

    # Empty value
    resp = await client.put(
        "/memories",
        json={"key": "something", "value": ""},
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_memory_module_direct():
    """Test agent_memory module functions directly."""
    import os

    os.environ.setdefault("USE_MOCK_DB", "true")

    import db
    from mongomock_motor import AsyncMongoMockClient

    db.client = AsyncMongoMockClient()
    db.db = db.client.todo_db

    import agent_memory

    agent_memory.memories_collection = db.db.agent_memories
    agent_memory.memory_logs_collection = db.db.agent_memory_logs

    user_id = "test_user_123"
    space_id = "test_space_456"

    # Test save_memory
    fact = await agent_memory.save_memory(user_id, "name", "Alice", space_id, "preference")
    assert fact.key == "name"
    assert fact.value == "Alice"

    # Test get_memory
    retrieved = await agent_memory.get_memory(user_id, "name", space_id)
    assert retrieved is not None
    assert retrieved.value == "Alice"

    # Test list_memories
    await agent_memory.save_memory(user_id, "role", "Developer", space_id, "context")
    facts = await agent_memory.list_memories(user_id, space_id)
    assert len(facts) == 2

    # Test append_memory_log
    log = await agent_memory.append_memory_log(user_id, "User prefers morning standups", space_id, "2026-03-11")
    assert len(log.entries) == 1

    log = await agent_memory.append_memory_log(user_id, "User works in Python primarily", space_id, "2026-03-11")
    assert len(log.entries) == 2

    # Test get_memory_log
    retrieved_log = await agent_memory.get_memory_log(user_id, "2026-03-11", space_id)
    assert retrieved_log is not None
    assert len(retrieved_log.entries) == 2

    # Test get_recent_memory_logs
    await agent_memory.append_memory_log(user_id, "Another observation", space_id, "2026-03-10")
    logs = await agent_memory.get_recent_memory_logs(user_id, space_id, limit=5)
    assert len(logs) == 2

    # Test build_memory_context
    context = await agent_memory.build_memory_context(user_id, space_id)
    assert "Agent Memory" in context
    assert "name" in context
    assert "Alice" in context
    assert "Recent observations" in context

    # Test empty context for unknown user
    empty_ctx = await agent_memory.build_memory_context("unknown_user", space_id)
    assert empty_ctx == ""

    # Test delete_memory_by_key
    deleted = await agent_memory.delete_memory_by_key(user_id, "name", space_id)
    assert deleted is True
    facts_after = await agent_memory.list_memories(user_id, space_id)
    assert len(facts_after) == 1

    # Test delete_all_memories
    count = await agent_memory.delete_all_memories(user_id, space_id)
    assert count == 1
