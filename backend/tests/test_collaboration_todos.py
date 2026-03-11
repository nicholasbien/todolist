import pytest

from tests.test_auth import get_verification_code_from_db


async def get_token(client, email):
    await client.post("/auth/signup", json={"email": email})
    code = await get_verification_code_from_db(email)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    resp = await client.post("/auth/login", json={"email": email, "code": code})
    assert resp.status_code == 200
    return resp.json()["token"]


async def create_test_space(client, token, name="Test Space"):
    """Helper to create a test space and return its ID"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.post("/spaces", json={"name": name}, headers=headers)
    assert resp.status_code == 200
    return resp.json()["_id"]


@pytest.mark.asyncio
async def test_todos_isolated_between_spaces_and_default(
    client, test_email, test_email2
):
    """Test that todos are properly isolated between spaces and default space."""
    token1 = await get_token(client, test_email)
    headers1 = {"Authorization": f"Bearer {token1}"}

    # Create a collaborative space
    space_id = await create_test_space(client, token1, "Collaboration Space")

    # Add todo to default space (no space_id)
    default_todo_resp = await client.post(
        "/todos", json={"text": "Default space todo"}, headers=headers1
    )
    assert default_todo_resp.status_code == 200

    # Add todo to collaborative space
    space_todo_resp = await client.post(
        "/todos", json={"text": "Space todo", "space_id": space_id}, headers=headers1
    )
    assert space_todo_resp.status_code == 200

    # Get todos from default space - should only show default todo
    # Note: After migration, we need to explicitly get the default space ID
    spaces_resp = await client.get("/spaces", headers=headers1)
    assert spaces_resp.status_code == 200
    spaces = spaces_resp.json()
    default_space = next((s for s in spaces if s.get("is_default", False)), None)
    assert default_space is not None, "User should have a default space"

    default_todos_resp = await client.get(
        f"/todos?space_id={default_space['_id']}", headers=headers1
    )
    assert default_todos_resp.status_code == 200
    default_todos = default_todos_resp.json()

    # Get todos from collaborative space - should only show space todo
    space_todos_resp = await client.get(f"/todos?space_id={space_id}", headers=headers1)
    assert space_todos_resp.status_code == 200
    space_todos = space_todos_resp.json()

    # Verify isolation
    assert len(default_todos) == 1
    assert len(space_todos) == 1
    assert default_todos[0]["text"] == "Default space todo"
    assert space_todos[0]["text"] == "Space todo"

    # Verify todos don't appear in wrong spaces
    default_todo_texts = [todo["text"] for todo in default_todos]
    space_todo_texts = [todo["text"] for todo in space_todos]

    assert "Space todo" not in default_todo_texts
    assert "Default space todo" not in space_todo_texts


@pytest.mark.asyncio
async def test_collaborative_todo_visibility(client, test_email, test_email2):
    """Test that all space members can see todos created by any member."""
    token1 = await get_token(client, test_email)
    token2 = await get_token(client, test_email2)
    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    # User 1 creates a space and invites User 2
    space_id = await create_test_space(client, token1, "Team Space")

    invite_resp = await client.post(
        f"/spaces/{space_id}/invite", json={"emails": [test_email2]}, headers=headers1
    )
    assert invite_resp.status_code == 200

    # User 1 creates a todo in the space (pass category to skip classification)
    todo1_resp = await client.post(
        "/todos",
        json={"text": "Todo by User 1", "category": "General", "space_id": space_id},
        headers=headers1,
    )
    assert todo1_resp.status_code == 200

    # User 2 creates a todo in the space
    todo2_resp = await client.post(
        "/todos",
        json={"text": "Todo by User 2", "category": "General", "space_id": space_id},
        headers=headers2,
    )
    assert todo2_resp.status_code == 200

    # User 1 should see both todos
    user1_todos_resp = await client.get(f"/todos?space_id={space_id}", headers=headers1)
    assert user1_todos_resp.status_code == 200
    user1_todos = user1_todos_resp.json()

    # User 2 should see both todos
    user2_todos_resp = await client.get(f"/todos?space_id={space_id}", headers=headers2)
    assert user2_todos_resp.status_code == 200
    user2_todos = user2_todos_resp.json()

    # Both users should see the same todos
    assert len(user1_todos) == 2
    assert len(user2_todos) == 2

    user1_todo_texts = sorted([todo["text"] for todo in user1_todos])
    user2_todo_texts = sorted([todo["text"] for todo in user2_todos])

    expected_texts = sorted(["Todo by User 1", "Todo by User 2"])
    assert user1_todo_texts == expected_texts
    assert user2_todo_texts == expected_texts


@pytest.mark.asyncio
async def test_default_space_privacy(client, test_email, test_email2):
    """Test that default space todos are private to each user."""
    token1 = await get_token(client, test_email)
    token2 = await get_token(client, test_email2)
    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    # User 1 creates todo in default space
    todo1_resp = await client.post(
        "/todos", json={"text": "User 1 private todo"}, headers=headers1
    )
    assert todo1_resp.status_code == 200

    # User 2 creates todo in default space
    todo2_resp = await client.post(
        "/todos", json={"text": "User 2 private todo"}, headers=headers2
    )
    assert todo2_resp.status_code == 200

    # User 1 should only see their own default todos
    # Note: After migration, we need to get each user's default space explicitly
    user1_spaces_resp = await client.get("/spaces", headers=headers1)
    assert user1_spaces_resp.status_code == 200
    user1_spaces = user1_spaces_resp.json()
    user1_default_space = next(
        (s for s in user1_spaces if s.get("is_default", False)), None
    )
    assert user1_default_space is not None

    user1_todos_resp = await client.get(
        f"/todos?space_id={user1_default_space['_id']}", headers=headers1
    )
    assert user1_todos_resp.status_code == 200
    user1_todos = user1_todos_resp.json()

    # User 2 should only see their own default todos
    user2_spaces_resp = await client.get("/spaces", headers=headers2)
    assert user2_spaces_resp.status_code == 200
    user2_spaces = user2_spaces_resp.json()
    user2_default_space = next(
        (s for s in user2_spaces if s.get("is_default", False)), None
    )
    assert user2_default_space is not None

    user2_todos_resp = await client.get(
        f"/todos?space_id={user2_default_space['_id']}", headers=headers2
    )
    assert user2_todos_resp.status_code == 200
    user2_todos = user2_todos_resp.json()

    # Verify privacy
    assert len(user1_todos) == 1
    assert len(user2_todos) == 1
    assert user1_todos[0]["text"] == "User 1 private todo"
    assert user2_todos[0]["text"] == "User 2 private todo"


@pytest.mark.asyncio
async def test_space_member_can_complete_others_todos(client, test_email, test_email2):
    """Test that space members can complete todos created by other members."""
    token1 = await get_token(client, test_email)
    token2 = await get_token(client, test_email2)
    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    # Create space and invite member
    space_id = await create_test_space(client, token1, "Shared Work")
    await client.post(
        f"/spaces/{space_id}/invite", json={"emails": [test_email2]}, headers=headers1
    )

    # User 1 creates a todo
    todo_resp = await client.post(
        "/todos", json={"text": "Team task", "space_id": space_id}, headers=headers1
    )
    assert todo_resp.status_code == 200
    todo_id = todo_resp.json()["_id"]

    # User 2 completes the todo created by User 1
    complete_resp = await client.put(f"/todos/{todo_id}/complete", headers=headers2)
    assert complete_resp.status_code == 200

    # Verify todo is completed for both users
    for headers in [headers1, headers2]:
        todos_resp = await client.get(f"/todos?space_id={space_id}", headers=headers)
        assert todos_resp.status_code == 200
        todos = todos_resp.json()
        assert len(todos) == 1
        assert todos[0]["completed"] is True


@pytest.mark.asyncio
async def test_space_access_control(client, test_email, test_email2, test_email3):
    """Test that only space members can access space todos."""
    token1 = await get_token(client, test_email)
    token2 = await get_token(client, test_email2)
    token3 = await get_token(client, test_email3)
    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}
    headers3 = {"Authorization": f"Bearer {token3}"}

    # User 1 creates space and invites User 2 (but not User 3)
    space_id = await create_test_space(client, token1, "Private Space")
    await client.post(
        f"/spaces/{space_id}/invite", json={"emails": [test_email2]}, headers=headers1
    )

    # Add todo to the space
    todo_resp = await client.post(
        "/todos",
        json={"text": "Private team todo", "space_id": space_id},
        headers=headers1,
    )
    assert todo_resp.status_code == 200

    # User 2 (member) should be able to see todos
    user2_todos_resp = await client.get(f"/todos?space_id={space_id}", headers=headers2)
    assert user2_todos_resp.status_code == 200
    user2_todos = user2_todos_resp.json()
    assert len(user2_todos) == 1

    # User 3 (non-member) should get 403 Forbidden
    user3_todos_resp = await client.get(f"/todos?space_id={space_id}", headers=headers3)
    assert user3_todos_resp.status_code == 403


@pytest.mark.asyncio
async def test_pending_invite_becomes_member(client, test_email, test_email2):
    """Test that a user invited by email becomes a space member when they sign up."""
    token1 = await get_token(client, test_email)
    headers1 = {"Authorization": f"Bearer {token1}"}

    # Create space and invite email that doesn't exist yet
    space_id = await create_test_space(client, token1, "Future Member Space")

    # Create todo before inviting anyone
    todo_resp = await client.post(
        "/todos", json={"text": "Existing todo", "space_id": space_id}, headers=headers1
    )
    assert todo_resp.status_code == 200

    # Invite user who hasn't signed up yet
    invite_resp = await client.post(
        f"/spaces/{space_id}/invite", json={"emails": [test_email2]}, headers=headers1
    )
    assert invite_resp.status_code == 200

    # Now the invited user signs up
    token2 = await get_token(client, test_email2)
    headers2 = {"Authorization": f"Bearer {token2}"}

    # The new user should now be able to see the space and its todos
    spaces_resp = await client.get("/spaces", headers=headers2)
    assert spaces_resp.status_code == 200
    spaces = spaces_resp.json()

    # Should have default space + the invited space
    space_names = [space["name"] for space in spaces]
    assert "Future Member Space" in space_names

    # Should be able to see existing todos
    todos_resp = await client.get(f"/todos?space_id={space_id}", headers=headers2)
    assert todos_resp.status_code == 200
    todos = todos_resp.json()
    assert len(todos) == 1
    assert todos[0]["text"] == "Existing todo"


@pytest.mark.asyncio
async def test_todo_operations_in_collaborative_space(client, test_email, test_email2):
    """Test various todo operations (update, delete) in collaborative spaces."""
    token1 = await get_token(client, test_email)
    token2 = await get_token(client, test_email2)
    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    # Create space and invite member
    space_id = await create_test_space(client, token1, "Operations Test")
    await client.post(
        f"/spaces/{space_id}/invite", json={"emails": [test_email2]}, headers=headers1
    )

    # User 1 creates a todo
    todo_resp = await client.post(
        "/todos",
        json={"text": "Original task", "category": "Work", "space_id": space_id},
        headers=headers1,
    )
    assert todo_resp.status_code == 200
    todo_id = todo_resp.json()["_id"]

    # User 2 updates the todo (category change)
    update_resp = await client.put(
        f"/todos/{todo_id}",
        json={"category": "Personal", "priority": "High"},
        headers=headers2,
    )
    assert update_resp.status_code == 200

    # Both users should see the updated todo
    for headers in [headers1, headers2]:
        todos_resp = await client.get(f"/todos?space_id={space_id}", headers=headers)
        assert todos_resp.status_code == 200
        todos = todos_resp.json()
        assert len(todos) == 1
        assert todos[0]["category"] == "Personal"
        assert todos[0]["priority"] == "High"

    # User 2 soft-deletes (closes) the todo created by User 1
    delete_resp = await client.delete(f"/todos/{todo_id}", headers=headers2)
    assert delete_resp.status_code == 200

    # Both users should see the todo is now closed and completed
    for headers in [headers1, headers2]:
        todos_resp = await client.get(f"/todos?space_id={space_id}", headers=headers)
        assert todos_resp.status_code == 200
        todos = todos_resp.json()
        assert len(todos) == 1
        assert todos[0]["closed"] is True
        assert todos[0]["completed"] is True

    # User 2 permanently deletes the todo
    perm_delete_resp = await client.delete(
        f"/todos/{todo_id}/permanent", headers=headers2
    )
    assert perm_delete_resp.status_code == 200

    # Both users should see the todo is gone
    for headers in [headers1, headers2]:
        todos_resp = await client.get(f"/todos?space_id={space_id}", headers=headers)
        assert todos_resp.status_code == 200
        todos = todos_resp.json()
        assert len(todos) == 0
