import pytest

from app import rename_default_spaces_to_personal
from tests.conftest import get_token


@pytest.mark.asyncio
async def test_rename_default_spaces_to_personal(client, test_email, test_email2):
    """Test that the migration successfully renames Default spaces to Personal."""
    # Import the mock database collections that are set up in conftest.py
    from bson import ObjectId

    import spaces

    # Create users and get their default spaces
    token1 = await get_token(client, test_email)
    token2 = await get_token(client, test_email2)

    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    # Get initial spaces for both users (should have "Personal" spaces by default now)
    spaces1_resp = await client.get("/spaces", headers=headers1)
    spaces2_resp = await client.get("/spaces", headers=headers2)

    assert spaces1_resp.status_code == 200
    assert spaces2_resp.status_code == 200

    spaces1 = spaces1_resp.json()
    spaces2 = spaces2_resp.json()

    # Find the personal spaces
    personal_space1 = next((s for s in spaces1 if s["name"] == "Personal"), None)
    personal_space2 = next((s for s in spaces2 if s["name"] == "Personal"), None)

    assert personal_space1 is not None, "User 1 should have a Personal space"
    assert personal_space2 is not None, "User 2 should have a Personal space"

    # Store their IDs for later verification
    space1_id = personal_space1["_id"]
    space2_id = personal_space2["_id"]

    # Manually update these spaces back to "Default" to test the migration
    await spaces.spaces_collection.update_one({"_id": ObjectId(space1_id)}, {"$set": {"name": "Default"}})
    await spaces.spaces_collection.update_one({"_id": ObjectId(space2_id)}, {"$set": {"name": "Default"}})

    # Verify they are now "Default"
    default_spaces = await spaces.spaces_collection.find({"name": "Default"}).to_list(None)
    assert len(default_spaces) >= 2, "Should have at least 2 Default spaces"

    # Run the migration
    await rename_default_spaces_to_personal()

    # Verify migration worked
    default_spaces_after = await spaces.spaces_collection.find({"name": "Default"}).to_list(None)
    personal_spaces_after = await spaces.spaces_collection.find({"name": "Personal"}).to_list(None)

    assert len(default_spaces_after) == 0, "Should have no Default spaces after migration"
    assert len(personal_spaces_after) >= 2, "Should have at least 2 Personal spaces after migration"

    # Verify through API that spaces are now "Personal" again
    spaces1_after = await client.get("/spaces", headers=headers1)
    spaces2_after = await client.get("/spaces", headers=headers2)

    assert spaces1_after.status_code == 200
    assert spaces2_after.status_code == 200

    spaces1_data = spaces1_after.json()
    spaces2_data = spaces2_after.json()

    personal_space1_after = next((s for s in spaces1_data if s["_id"] == space1_id), None)
    personal_space2_after = next((s for s in spaces2_data if s["_id"] == space2_id), None)

    assert personal_space1_after["name"] == "Personal", "User 1's space should be renamed to Personal"
    assert personal_space2_after["name"] == "Personal", "User 2's space should be renamed to Personal"


@pytest.mark.asyncio
async def test_migration_with_no_default_spaces(client, test_email):
    """Test that migration handles the case where there are no Default spaces."""
    # Import the mock database collections that are set up in conftest.py
    import spaces

    # Create a user to ensure we have a database connection established
    await get_token(client, test_email)

    # Ensure no Default spaces exist in the mock database
    await spaces.spaces_collection.delete_many({"name": "Default"})

    # Verify no Default spaces exist
    default_spaces_before = await spaces.spaces_collection.find({"name": "Default"}).to_list(None)
    assert len(default_spaces_before) == 0, "Should have no Default spaces before migration"

    # Run migration - should not error and should log appropriately
    await rename_default_spaces_to_personal()

    # Should still have no Default spaces
    default_spaces_after = await spaces.spaces_collection.find({"name": "Default"}).to_list(None)
    assert len(default_spaces_after) == 0, "Should have no Default spaces after migration"


@pytest.mark.asyncio
async def test_migration_preserves_other_spaces(client, test_email):
    """Test that migration only affects Default spaces and preserves other spaces."""
    # Import the mock database collections that are set up in conftest.py
    from bson import ObjectId

    import spaces

    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a custom space
    custom_resp = await client.post("/spaces", json={"name": "My Custom Space"}, headers=headers)
    assert custom_resp.status_code == 200
    custom_space_id = custom_resp.json()["_id"]

    # Create another space with a different name
    work_resp = await client.post("/spaces", json={"name": "Work Projects"}, headers=headers)
    assert work_resp.status_code == 200
    work_space_id = work_resp.json()["_id"]

    # Create a Default space to test that only Default spaces are affected
    await spaces.spaces_collection.insert_one(
        {
            "_id": ObjectId(),
            "name": "Default",
            "owner_id": "test_owner",
            "member_ids": ["test_owner"],
            "pending_emails": [],
            "is_default": True,
            "collaborative": False,
        }
    )

    # Verify we have the test Default space
    default_spaces_before = await spaces.spaces_collection.find({"name": "Default"}).to_list(None)
    assert len(default_spaces_before) >= 1, "Should have at least 1 Default space before migration"

    # Run migration
    await rename_default_spaces_to_personal()

    # Verify Default spaces were renamed but other spaces preserved
    default_spaces_after = await spaces.spaces_collection.find({"name": "Default"}).to_list(None)
    assert len(default_spaces_after) == 0, "Should have no Default spaces after migration"

    # Verify custom spaces are unchanged through API
    spaces_resp = await client.get("/spaces", headers=headers)
    assert spaces_resp.status_code == 200
    spaces_data = spaces_resp.json()

    custom_space = next((s for s in spaces_data if s["_id"] == custom_space_id), None)
    work_space = next((s for s in spaces_data if s["_id"] == work_space_id), None)

    assert custom_space is not None, "Custom space should still exist"
    assert work_space is not None, "Work space should still exist"
    assert custom_space["name"] == "My Custom Space", "Custom space name should be unchanged"
    assert work_space["name"] == "Work Projects", "Work space name should be unchanged"
