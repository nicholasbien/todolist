from datetime import datetime

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
async def test_default_space_categories(client, test_email):
    """Test that default space categories work without space_id"""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Initialize default categories manually for test
    from categories import init_default_categories

    await init_default_categories(None)

    # Get categories for default space (no space_id)
    resp = await client.get("/categories", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()

    # Should have default categories
    expected_categories = ["General"]
    for cat in expected_categories:
        assert cat in categories


@pytest.mark.asyncio
async def test_space_specific_categories(client, test_email):
    """Test that each space has its own categories"""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create two spaces
    space1_id = await create_test_space(client, token, "Space 1")
    space2_id = await create_test_space(client, token, "Space 2")

    # Add custom category to space 1
    resp = await client.post(
        "/categories",
        json={"name": "Space1 Category", "space_id": space1_id},
        headers=headers,
    )
    assert resp.status_code == 200

    # Add different category to space 2
    resp = await client.post(
        "/categories",
        json={"name": "Space2 Category", "space_id": space2_id},
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify space 1 categories
    resp = await client.get(f"/categories?space_id={space1_id}", headers=headers)
    assert resp.status_code == 200
    space1_categories = resp.json()
    assert "Space1 Category" in space1_categories
    assert "Space2 Category" not in space1_categories

    # Verify space 2 categories
    resp = await client.get(f"/categories?space_id={space2_id}", headers=headers)
    assert resp.status_code == 200
    space2_categories = resp.json()
    assert "Space2 Category" in space2_categories
    assert "Space1 Category" not in space2_categories


@pytest.mark.asyncio
async def test_category_operations_in_spaces(client, test_email):
    """Test category CRUD operations within spaces"""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    space_id = await create_test_space(client, token, "Category Test Space")

    # Add a custom category
    resp = await client.post(
        "/categories",
        json={"name": "Custom Category", "space_id": space_id},
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify category exists
    resp = await client.get(f"/categories?space_id={space_id}", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()
    assert "Custom Category" in categories

    # Rename the category
    resp = await client.put(
        f"/categories/Custom Category?space_id={space_id}",
        json={"new_name": "Renamed Category"},
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify rename worked
    resp = await client.get(f"/categories?space_id={space_id}", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()
    assert "Renamed Category" in categories
    assert "Custom Category" not in categories

    # Delete the category
    resp = await client.delete(f"/categories/Renamed Category?space_id={space_id}", headers=headers)
    assert resp.status_code == 200

    # Verify deletion worked
    resp = await client.get(f"/categories?space_id={space_id}", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()
    assert "Renamed Category" not in categories


@pytest.mark.asyncio
async def test_default_space_category_operations(client, test_email):
    """Test category operations in default space (no space_id)"""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Add category to default space
    resp = await client.post(
        "/categories",
        json={"name": "Default Space Category", "space_id": None},
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify category exists in default space
    resp = await client.get("/categories", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()
    assert "Default Space Category" in categories

    # Rename category in default space
    resp = await client.put(
        "/categories/Default Space Category",
        json={"new_name": "Renamed Default Category"},
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify rename worked
    resp = await client.get("/categories", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()
    assert "Renamed Default Category" in categories

    # Delete category from default space
    resp = await client.delete("/categories/Renamed Default Category", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_category_isolation_between_spaces(client, test_email):
    """Test that categories are properly isolated between spaces"""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create two spaces
    space1_id = await create_test_space(client, token, "Space 1")
    space2_id = await create_test_space(client, token, "Space 2")

    # Add same-named category to both spaces
    for space_id in [space1_id, space2_id]:
        resp = await client.post(
            "/categories",
            json={"name": "Shared Name", "space_id": space_id},
            headers=headers,
        )
        assert resp.status_code == 200

    # Delete category from space 1
    resp = await client.delete(f"/categories/Shared Name?space_id={space1_id}", headers=headers)
    assert resp.status_code == 200

    # Verify category still exists in space 2
    resp = await client.get(f"/categories?space_id={space2_id}", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()
    assert "Shared Name" in categories

    # Verify category is gone from space 1
    resp = await client.get(f"/categories?space_id={space1_id}", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()
    assert "Shared Name" not in categories


@pytest.mark.asyncio
async def test_collaborative_category_management(client, test_email, test_email2):
    """Test that space members can manage categories together"""
    token1 = await get_token(client, test_email)
    token2 = await get_token(client, test_email2)
    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    # Create space and invite user 2
    space_id = await create_test_space(client, token1, "Collaboration")
    await client.post(f"/spaces/{space_id}/invite", json={"emails": [test_email2]}, headers=headers1)

    # User 1 adds a category
    resp = await client.post(
        "/categories",
        json={"name": "Team Category", "space_id": space_id},
        headers=headers1,
    )
    assert resp.status_code == 200

    # User 2 should see the category
    resp = await client.get(f"/categories?space_id={space_id}", headers=headers2)
    assert resp.status_code == 200
    categories = resp.json()
    assert "Team Category" in categories

    # User 2 can rename the category
    resp = await client.put(
        f"/categories/Team Category?space_id={space_id}",
        json={"new_name": "Updated Team Category"},
        headers=headers2,
    )
    assert resp.status_code == 200

    # User 1 should see the renamed category
    resp = await client.get(f"/categories?space_id={space_id}", headers=headers1)
    assert resp.status_code == 200
    categories = resp.json()
    assert "Updated Team Category" in categories
    assert "Team Category" not in categories


@pytest.mark.asyncio
async def test_category_todo_relationship_in_spaces(client, test_email):
    """Test that todos and categories work together in spaces"""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    space_id = await create_test_space(client, token, "Todo Category Space")

    # Add custom category
    resp = await client.post(
        "/categories",
        json={"name": "Project Alpha", "space_id": space_id},
        headers=headers,
    )
    assert resp.status_code == 200

    # Add todo with custom category
    resp = await client.post(
        "/todos",
        json={
            "text": "Complete project alpha task",
            "category": "Project Alpha",
            "space_id": space_id,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    resp.json()["_id"]

    # Verify todo has correct category
    resp = await client.get(f"/todos?space_id={space_id}", headers=headers)
    assert resp.status_code == 200
    todos = resp.json()
    assert len(todos) == 1
    assert todos[0]["category"] == "Project Alpha"

    # Delete the category (should move todos to General)
    resp = await client.delete(f"/categories/Project Alpha?space_id={space_id}", headers=headers)
    assert resp.status_code == 200

    # Verify todo was moved to General category
    resp = await client.get(f"/todos?space_id={space_id}", headers=headers)
    assert resp.status_code == 200
    todos = resp.json()
    assert len(todos) == 1
    assert todos[0]["category"] == "General"


@pytest.mark.asyncio
async def test_general_category_recreated_on_delete(client, test_email):
    """General category should exist after deleting categories."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    space_id = await create_test_space(client, token, "General Recreation")

    # Add a custom category and todo
    resp = await client.post(
        "/categories",
        json={"name": "Temp", "space_id": space_id},
        headers=headers,
    )
    assert resp.status_code == 200

    todo_data = {
        "text": "Temp task",
        "category": "Temp",
        "priority": "Low",
        "dateAdded": datetime.now().isoformat(),
        "space_id": space_id,
    }
    resp = await client.post("/todos", json=todo_data, headers=headers)
    assert resp.status_code == 200

    # Delete the General category if present
    resp = await client.delete(f"/categories/General?space_id={space_id}", headers=headers)
    assert resp.status_code == 200

    # General category should be recreated automatically
    resp = await client.get(f"/categories?space_id={space_id}", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()
    assert "General" in categories

    # Delete the custom category
    resp = await client.delete(f"/categories/Temp?space_id={space_id}", headers=headers)
    assert resp.status_code == 200

    # Verify General still exists
    resp = await client.get(f"/categories?space_id={space_id}", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()
    assert "General" in categories

    # Todo should now be in General category
    resp = await client.get(f"/todos?space_id={space_id}", headers=headers)
    assert resp.status_code == 200
    todos = resp.json()
    assert len(todos) == 1
    assert todos[0]["category"] == "General"
