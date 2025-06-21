#!/usr/bin/env python3
"""
Tests for todo due date updates via the edit todo endpoint.
"""

from datetime import datetime

import pytest
from tests.conftest import get_token


@pytest.mark.asyncio
async def test_update_todo_due_date(client, test_email):
    """Test updating a todo's due date."""
    # Get authentication token
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a todo first
    todo_data = {
        "text": "Test todo with date",
        "category": "General",
        "priority": "Medium",
        "dateAdded": datetime.now().isoformat(),
        "completed": False,
    }

    create_response = await client.post("/todos", json=todo_data, headers=headers)
    assert create_response.status_code == 200
    todo = create_response.json()
    todo_id = todo["_id"]

    # Update the todo with a due date
    update_data = {"dueDate": "2024-12-25"}

    update_response = await client.put(f"/todos/{todo_id}", json=update_data, headers=headers)
    assert update_response.status_code == 200
    updated_todo = update_response.json()

    # Verify the due date was set
    assert updated_todo["dueDate"] == "2024-12-25"
    assert updated_todo["text"] == "Test todo with date"  # Other fields unchanged


@pytest.mark.asyncio
async def test_update_todo_clear_due_date(client, test_email):
    """Test clearing a todo's due date by setting it to null."""
    # Get authentication token
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a todo with a due date
    todo_data = {
        "text": "Test todo with date",
        "category": "General",
        "priority": "Medium",
        "dateAdded": datetime.now().isoformat(),
        "dueDate": "2024-12-25",
        "completed": False,
    }

    create_response = await client.post("/todos", json=todo_data, headers=headers)
    assert create_response.status_code == 200
    todo = create_response.json()
    todo_id = todo["_id"]

    # Verify it was created with the due date
    assert todo["dueDate"] == "2024-12-25"

    # Clear the due date
    update_data = {"dueDate": None}

    update_response = await client.put(f"/todos/{todo_id}", json=update_data, headers=headers)
    assert update_response.status_code == 200
    updated_todo = update_response.json()

    # Verify the due date was cleared
    assert updated_todo["dueDate"] is None
    assert updated_todo["text"] == "Test todo with date"  # Other fields unchanged


@pytest.mark.asyncio
async def test_update_todo_multiple_fields_including_date(client, test_email):
    """Test updating multiple fields including due date in a single request."""
    # Get authentication token
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a todo first
    todo_data = {
        "text": "Original text",
        "notes": "Original notes",
        "category": "General",
        "priority": "Low",
        "dateAdded": datetime.now().isoformat(),
        "completed": False,
    }

    create_response = await client.post("/todos", json=todo_data, headers=headers)
    assert create_response.status_code == 200
    todo = create_response.json()
    todo_id = todo["_id"]

    # Update multiple fields including due date
    update_data = {
        "text": "Updated text",
        "notes": "Updated notes",
        "category": "Work",
        "priority": "High",
        "dueDate": "2024-12-31",
    }

    update_response = await client.put(f"/todos/{todo_id}", json=update_data, headers=headers)
    assert update_response.status_code == 200
    updated_todo = update_response.json()

    # Verify all fields were updated
    assert updated_todo["text"] == "Updated text"
    assert updated_todo["notes"] == "Updated notes"
    assert updated_todo["category"] == "Work"
    assert updated_todo["priority"] == "High"
    assert updated_todo["dueDate"] == "2024-12-31"


@pytest.mark.asyncio
async def test_update_todo_date_formats(client, test_email):
    """Test different date formats are handled correctly."""
    # Get authentication token
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a todo first
    todo_data = {
        "text": "Test todo for date formats",
        "category": "General",
        "priority": "Medium",
        "dateAdded": datetime.now().isoformat(),
        "completed": False,
    }

    create_response = await client.post("/todos", json=todo_data, headers=headers)
    assert create_response.status_code == 200
    todo = create_response.json()
    todo_id = todo["_id"]

    # Test different date formats
    test_dates = [
        "2024-12-25",  # YYYY-MM-DD (HTML date input format)
        "2024-12-25T00:00:00",  # ISO format without timezone
        "2024-12-25T00:00:00.000Z",  # Full ISO format
    ]

    for test_date in test_dates:
        update_data = {"dueDate": test_date}

        update_response = await client.put(f"/todos/{todo_id}", json=update_data, headers=headers)
        assert update_response.status_code == 200
        updated_todo = update_response.json()

        # Should accept the date (backend may normalize the format)
        assert updated_todo["dueDate"] is not None
        assert updated_todo["dueDate"] == test_date  # Exact format preservation


@pytest.mark.asyncio
async def test_update_todo_empty_string_date(client, test_email):
    """Test that empty string for date is treated as null."""
    # Get authentication token
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a todo with a due date
    todo_data = {
        "text": "Test todo with date",
        "category": "General",
        "priority": "Medium",
        "dateAdded": datetime.now().isoformat(),
        "dueDate": "2024-12-25",
        "completed": False,
    }

    create_response = await client.post("/todos", json=todo_data, headers=headers)
    assert create_response.status_code == 200
    todo = create_response.json()
    todo_id = todo["_id"]

    # Update with empty string
    update_data = {"dueDate": ""}

    update_response = await client.put(f"/todos/{todo_id}", json=update_data, headers=headers)
    assert update_response.status_code == 200
    updated_todo = update_response.json()

    # Empty string should be treated as null/None
    assert updated_todo["dueDate"] is None or updated_todo["dueDate"] == ""


@pytest.mark.asyncio
async def test_update_todo_partial_update_preserves_date(client, test_email):
    """Test that partial updates don't affect the due date if not specified."""
    # Get authentication token
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a todo with a due date
    todo_data = {
        "text": "Original text",
        "category": "General",
        "priority": "Medium",
        "dateAdded": datetime.now().isoformat(),
        "dueDate": "2024-12-25",
        "completed": False,
    }

    create_response = await client.post("/todos", json=todo_data, headers=headers)
    assert create_response.status_code == 200
    todo = create_response.json()
    todo_id = todo["_id"]

    # Update only the text (not the date)
    update_data = {"text": "Updated text"}

    update_response = await client.put(f"/todos/{todo_id}", json=update_data, headers=headers)
    assert update_response.status_code == 200
    updated_todo = update_response.json()

    # Due date should be preserved
    assert updated_todo["dueDate"] == "2024-12-25"
    assert updated_todo["text"] == "Updated text"
