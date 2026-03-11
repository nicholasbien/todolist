"""Tests for moving todos between spaces via space_id updates."""

from datetime import datetime

import pytest

from tests.test_auth import get_verification_code_from_db


async def get_token(client, email):
    """Helper to get auth token for a user."""
    await client.post("/auth/signup", json={"email": email})
    code = await get_verification_code_from_db(email)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    login_resp = await client.post("/auth/login", json={"email": email, "code": code})
    assert login_resp.status_code == 200
    return login_resp.json()["token"]


@pytest.mark.asyncio
async def test_move_todo_between_spaces(client, test_email):
    """Test moving a todo from one space to another."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Get user's default space
    spaces_resp = await client.get("/spaces", headers=headers)
    assert spaces_resp.status_code == 200
    spaces = spaces_resp.json()
    default_space = next((s for s in spaces if s.get("is_default", False)), None)
    assert default_space is not None

    # Create a second space
    create_space_resp = await client.post(
        "/spaces", json={"name": "Work Projects"}, headers=headers
    )
    assert create_space_resp.status_code == 200
    work_space = create_space_resp.json()
    work_space_id = work_space["_id"]

    # Create a todo in the default space
    todo_payload = {
        "text": "Review code",
        "dateAdded": datetime.now().isoformat(),
        "space_id": default_space["_id"],
        "category": "General",
    }
    create_resp = await client.post("/todos", json=todo_payload, headers=headers)
    assert create_resp.status_code == 200
    todo = create_resp.json()
    todo_id = todo["_id"]
    assert todo["space_id"] == default_space["_id"]

    # Move the todo to the work space
    update_resp = await client.put(
        f"/todos/{todo_id}", json={"space_id": work_space_id}, headers=headers
    )
    assert update_resp.status_code == 200
    updated_todo = update_resp.json()
    assert updated_todo["space_id"] == work_space_id

    # Verify todo appears in work space todos
    work_todos_resp = await client.get(
        f"/todos?space_id={work_space_id}", headers=headers
    )
    assert work_todos_resp.status_code == 200
    work_todos = work_todos_resp.json()
    assert any(t["_id"] == todo_id for t in work_todos)

    # Verify todo does not appear in default space todos
    default_todos_resp = await client.get(
        f"/todos?space_id={default_space['_id']}", headers=headers
    )
    assert default_todos_resp.status_code == 200
    default_todos = default_todos_resp.json()
    assert not any(t["_id"] == todo_id for t in default_todos)


@pytest.mark.asyncio
async def test_cannot_move_todo_to_unauthorized_space(client, test_email):
    """Test that users cannot move todos to spaces they don't have access to."""
    # Create two users
    token1 = await get_token(client, test_email)
    token2 = await get_token(client, f"other_{test_email}")
    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    # User 1 creates a space
    create_space_resp = await client.post(
        "/spaces", json={"name": "User 1 Private Space"}, headers=headers1
    )
    assert create_space_resp.status_code == 200
    user1_space = create_space_resp.json()

    # User 2 gets their default space
    spaces_resp = await client.get("/spaces", headers=headers2)
    assert spaces_resp.status_code == 200
    user2_spaces = spaces_resp.json()
    user2_default_space = next(
        (s for s in user2_spaces if s.get("is_default", False)), None
    )
    assert user2_default_space is not None

    # User 2 creates a todo in their default space
    todo_payload = {
        "text": "User 2's task",
        "dateAdded": datetime.now().isoformat(),
        "space_id": user2_default_space["_id"],
        "category": "General",
    }
    create_resp = await client.post("/todos", json=todo_payload, headers=headers2)
    assert create_resp.status_code == 200
    todo = create_resp.json()
    todo_id = todo["_id"]

    # User 2 attempts to move todo to User 1's private space (should fail with 403)
    update_resp = await client.put(
        f"/todos/{todo_id}", json={"space_id": user1_space["_id"]}, headers=headers2
    )
    assert update_resp.status_code == 403
    assert "Not authorized" in update_resp.json()["detail"]


@pytest.mark.asyncio
async def test_update_space_and_other_fields_together(client, test_email):
    """Test updating space_id along with other todo fields."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Get user's default space
    spaces_resp = await client.get("/spaces", headers=headers)
    assert spaces_resp.status_code == 200
    spaces = spaces_resp.json()
    default_space = next((s for s in spaces if s.get("is_default", False)), None)
    assert default_space is not None

    # Create a second space
    create_space_resp = await client.post(
        "/spaces", json={"name": "Personal Projects"}, headers=headers
    )
    assert create_space_resp.status_code == 200
    personal_space = create_space_resp.json()

    # Create a todo
    todo_payload = {
        "text": "Original task",
        "dateAdded": datetime.now().isoformat(),
        "space_id": default_space["_id"],
        "category": "General",
        "priority": "Low",
    }
    create_resp = await client.post("/todos", json=todo_payload, headers=headers)
    assert create_resp.status_code == 200
    todo = create_resp.json()
    todo_id = todo["_id"]

    # Update space, text, and priority all together
    update_resp = await client.put(
        f"/todos/{todo_id}",
        json={
            "space_id": personal_space["_id"],
            "text": "Updated task text",
            "priority": "High",
        },
        headers=headers,
    )
    assert update_resp.status_code == 200
    updated_todo = update_resp.json()
    assert updated_todo["space_id"] == personal_space["_id"]
    assert updated_todo["text"] == "Updated task text"
    assert updated_todo["priority"] == "High"
