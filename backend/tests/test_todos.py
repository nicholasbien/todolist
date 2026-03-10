from datetime import datetime

import pytest
from tests.test_auth import get_verification_code_from_db


async def get_token(client, email):
    await client.post("/auth/signup", json={"email": email})
    code = await get_verification_code_from_db(email)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    login_resp = await client.post("/auth/login", json={"email": email, "code": code})
    assert login_resp.status_code == 200
    return login_resp.json()["token"]


@pytest.mark.asyncio
async def test_todo_crud_flow(client, test_email):
    """Full CRUD flow for todos with classification integration."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}
    todo_payload = {
        "text": "Buy milk",
        "dateAdded": datetime.now().isoformat(),
    }
    create_resp = await client.post("/todos", json=todo_payload, headers=headers)
    assert create_resp.status_code == 200
    todo = create_resp.json()
    # Classification runs via OpenAI — verify a category and priority were assigned
    assert todo["category"]  # Should be a non-empty string
    assert todo["priority"] in ("Low", "Medium", "High")
    todo_id = todo["_id"]

    # Retrieve todos from default space
    # Note: After migration, we need to get todos from the user's default space
    spaces_resp = await client.get("/spaces", headers=headers)
    assert spaces_resp.status_code == 200
    spaces = spaces_resp.json()
    default_space = next((s for s in spaces if s.get("is_default", False)), None)
    assert default_space is not None

    get_resp = await client.get(f"/todos?space_id={default_space['_id']}", headers=headers)
    assert get_resp.status_code == 200
    todos = get_resp.json()
    assert any(t["_id"] == todo_id for t in todos)

    # Complete todo
    complete_resp = await client.put(f"/todos/{todo_id}/complete", headers=headers)
    assert complete_resp.status_code == 200

    # Create "Work" category before updating todo to use it
    await client.post(
        "/categories",
        json={"name": "Work", "space_id": default_space["_id"]},
        headers=headers,
    )

    # Update todo fields
    update_resp = await client.put(
        f"/todos/{todo_id}",
        json={"category": "Work", "priority": "Low"},
        headers=headers,
    )
    assert update_resp.status_code == 200

    # Delete todo
    delete_resp = await client.delete(f"/todos/{todo_id}", headers=headers)
    assert delete_resp.status_code == 200


@pytest.mark.asyncio
async def test_category_management(client, test_email):
    """Test adding and deleting categories with todo reassignment."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}
    spaces_resp = await client.get("/spaces", headers=headers)
    assert spaces_resp.status_code == 200
    default_space = spaces_resp.json()[0]["_id"]  # This will be None for default space

    # Add category to default space (space_id = None)
    add_resp = await client.post("/categories", json={"name": "Errands", "space_id": default_space}, headers=headers)
    assert add_resp.status_code == 200

    # Ensure category exists (for default space, don't pass space_id)
    if default_space is None:
        categories_resp = await client.get("/categories", headers=headers)
    else:
        categories_resp = await client.get(f"/categories?space_id={default_space}", headers=headers)
    assert categories_resp.status_code == 200
    categories = categories_resp.json()
    assert "Errands" in categories

    # Create todo using this category (pass category explicitly to skip classification)
    todo_payload = {
        "text": "Pick up dry cleaning",
        "dateAdded": datetime.now().isoformat(),
        "category": "Errands",
        "space_id": default_space,
    }
    create_resp = await client.post("/todos", json=todo_payload, headers=headers)
    assert create_resp.status_code == 200
    todo_id = create_resp.json()["_id"]

    # Delete category and ensure todo updated to General
    if default_space is None:
        delete_resp = await client.delete("/categories/Errands", headers=headers)
    else:
        delete_resp = await client.delete(f"/categories/Errands?space_id={default_space}", headers=headers)
    assert delete_resp.status_code == 200

    if default_space is None:
        get_todos_resp = await client.get("/todos", headers=headers)
    else:
        get_todos_resp = await client.get(f"/todos?space_id={default_space}", headers=headers)
    assert get_todos_resp.status_code == 200
    todos = get_todos_resp.json()
    todo = next(t for t in todos if t["_id"] == todo_id)
    assert todo["category"] == "General"


@pytest.mark.asyncio
async def test_add_todo_with_selected_category(client, test_email):
    """Ensure classification is skipped when category provided."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Get default space
    spaces_resp = await client.get("/spaces", headers=headers)
    default_space = spaces_resp.json()[0]["_id"]

    # Create "Work" category first
    await client.post(
        "/categories",
        json={"name": "Work", "space_id": default_space},
        headers=headers,
    )

    todo_payload = {
        "text": "Walk the dog",
        "dateAdded": datetime.now().isoformat(),
        "category": "Work",
        "space_id": default_space,
    }
    create_resp = await client.post("/todos", json=todo_payload, headers=headers)
    assert create_resp.status_code == 200
    todo = create_resp.json()
    # Category should be preserved as-is (not overridden by classification)
    assert todo["category"] == "Work"
    assert todo["priority"] == "Medium"


@pytest.mark.asyncio
async def test_update_todo_rejects_nonexistent_category(client, test_email):
    """Updating a todo to a non-existent category should return 400."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a todo (no explicit category, will be classified or default)
    todo_payload = {
        "text": "Test task",
        "dateAdded": datetime.now().isoformat(),
    }
    create_resp = await client.post("/todos", json=todo_payload, headers=headers)
    assert create_resp.status_code == 200
    todo_id = create_resp.json()["_id"]

    # Try to update category to one that doesn't exist
    update_resp = await client.put(
        f"/todos/{todo_id}",
        json={"category": "NonExistentCategory"},
        headers=headers,
    )
    assert update_resp.status_code == 400
    assert "does not exist" in update_resp.json()["detail"]
    assert "create the category first" in update_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_todo_allows_existing_category(client, test_email):
    """Updating a todo to an existing category should succeed."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Get default space
    spaces_resp = await client.get("/spaces", headers=headers)
    default_space = spaces_resp.json()[0]["_id"]

    # Create "Shopping" category
    await client.post(
        "/categories",
        json={"name": "Shopping", "space_id": default_space},
        headers=headers,
    )

    # Create a todo
    todo_payload = {
        "text": "Buy groceries",
        "dateAdded": datetime.now().isoformat(),
    }
    create_resp = await client.post("/todos", json=todo_payload, headers=headers)
    assert create_resp.status_code == 200
    todo_id = create_resp.json()["_id"]

    # Update to existing category should work
    update_resp = await client.put(
        f"/todos/{todo_id}",
        json={"category": "Shopping"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["category"] == "Shopping"


@pytest.mark.asyncio
async def test_create_todo_rejects_nonexistent_category(client, test_email):
    """Creating a todo with a non-existent explicit category should return 400."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    todo_payload = {
        "text": "Test task",
        "dateAdded": datetime.now().isoformat(),
        "category": "FakeCategory",
    }
    create_resp = await client.post("/todos", json=todo_payload, headers=headers)
    assert create_resp.status_code == 400
    assert "does not exist" in create_resp.json()["detail"]
