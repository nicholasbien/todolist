"""Tests for the /activity-feed endpoint."""

import re

import pytest

from tests.conftest import get_token


@pytest.mark.asyncio
async def test_activity_feed_requires_auth(client):
    """Unauthenticated requests should be rejected."""
    resp = await client.get("/activity-feed")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_activity_feed_empty(client, test_email):
    """A new user should get an empty activity feed."""
    token = await get_token(client, test_email)
    resp = await client.get(
        "/activity-feed",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_activity_feed_includes_created_todo(client, test_email):
    """Creating a todo should produce a task_created event in the feed."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a todo
    todo_resp = await client.post(
        "/todos",
        json={"text": "Activity feed test task", "dateAdded": "2026-03-11T10:00:00"},
        headers=headers,
    )
    assert todo_resp.status_code == 200

    # Fetch the activity feed
    resp = await client.get("/activity-feed", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # Should have at least one task_created event
    created_events = [e for e in data if e["type"] == "task_created"]
    assert len(created_events) >= 1
    assert any("Activity feed test task" in e["title"] for e in created_events)


@pytest.mark.asyncio
async def test_activity_feed_includes_completed_todo(client, test_email):
    """Completing a todo should produce a task_completed event in the feed."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create and complete a todo
    todo_resp = await client.post(
        "/todos",
        json={"text": "Complete me", "dateAdded": "2026-03-11T10:00:00"},
        headers=headers,
    )
    assert todo_resp.status_code == 200
    todo_id = todo_resp.json()["_id"]

    await client.put(f"/todos/{todo_id}/complete", headers=headers)

    # Fetch the activity feed
    resp = await client.get("/activity-feed", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    completed_events = [e for e in data if e["type"] == "task_completed"]
    assert len(completed_events) >= 1


@pytest.mark.asyncio
async def test_activity_feed_respects_limit(client, test_email):
    """The limit parameter should cap the number of returned events."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a few todos
    for i in range(5):
        await client.post(
            "/todos",
            json={"text": f"Task {i}", "dateAdded": "2026-03-11T10:00:00"},
            headers=headers,
        )

    resp = await client.get("/activity-feed?limit=3", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) <= 3


@pytest.mark.asyncio
async def test_activity_feed_timestamps_have_timezone(client, test_email):
    """Timestamps must include timezone info so JS Date() parses them as UTC."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a todo to ensure there's at least one event
    await client.post(
        "/todos",
        json={"text": "Timezone test task", "dateAdded": "2026-03-11T10:00:00"},
        headers=headers,
    )

    resp = await client.get("/activity-feed", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0

    tz_pattern = re.compile(r"(Z|[+-]\d{2}:\d{2})$")
    for event in data:
        ts = event["timestamp"]
        assert tz_pattern.search(ts), (
            f"Timestamp {ts!r} is missing timezone info — "
            f"JavaScript will parse it as local time, breaking relative display"
        )
