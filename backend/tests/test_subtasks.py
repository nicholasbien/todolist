#!/usr/bin/env python3
"""Tests for sub-task functionality."""

import pytest

from .conftest import get_token


async def _get_space_id(client, headers):
    """Helper to get the default space ID."""
    resp = await client.get("/spaces", headers=headers)
    spaces = resp.json()
    return spaces[0]["_id"]


async def _get_todo(client, headers, space_id, todo_id):
    """Helper to fetch a single todo from the list endpoint (reliable in tests)."""
    resp = await client.get(f"/todos?space_id={space_id}", headers=headers)
    todos = resp.json()
    matches = [t for t in todos if t["_id"] == todo_id]
    return matches[0] if matches else None


class TestSubtasks:
    """Integration tests for sub-task CRUD and orchestration."""

    @pytest.mark.asyncio
    async def test_create_subtask(self, client, test_email):
        """Creating a todo with parent_id creates a sub-task."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)

        # Create parent task
        resp = await client.post("/todos", json={"text": "Parent task", "space_id": space_id}, headers=headers)
        assert resp.status_code == 200
        parent = resp.json()
        parent_id = parent["_id"]

        # Create sub-task
        resp = await client.post(
            "/todos",
            json={"text": "Sub-task 1", "parent_id": parent_id, "space_id": space_id},
            headers=headers,
        )
        assert resp.status_code == 200
        subtask = resp.json()
        assert subtask["parent_id"] == parent_id

        # Verify parent's subtask_ids contains the child
        parent_fresh = await _get_todo(client, headers, space_id, parent_id)
        assert subtask["_id"] in parent_fresh["subtask_ids"]

    @pytest.mark.asyncio
    async def test_subtask_ordering_via_parent(self, client, test_email):
        """Subtasks are ordered by the parent's subtask_ids array."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)

        # Create parent
        resp = await client.post("/todos", json={"text": "Parent", "space_id": space_id}, headers=headers)
        parent_id = resp.json()["_id"]

        # Create 3 subtasks
        child_ids = []
        for i in range(3):
            resp = await client.post(
                "/todos",
                json={"text": f"Step {i+1}", "parent_id": parent_id, "space_id": space_id},
                headers=headers,
            )
            assert resp.status_code == 200
            child_ids.append(resp.json()["_id"])

        # Check parent's subtask_ids has them in order
        parent_fresh = await _get_todo(client, headers, space_id, parent_id)
        assert parent_fresh["subtask_ids"] == child_ids

    @pytest.mark.asyncio
    async def test_no_nested_subtasks(self, client, test_email):
        """Cannot create a sub-task of a sub-task."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}

        resp = await client.post("/todos", json={"text": "Parent"}, headers=headers)
        parent_id = resp.json()["_id"]

        resp = await client.post(
            "/todos",
            json={"text": "Child", "parent_id": parent_id},
            headers=headers,
        )
        child_id = resp.json()["_id"]

        # Try to nest deeper
        resp = await client.post(
            "/todos",
            json={"text": "Grandchild", "parent_id": child_id},
            headers=headers,
        )
        assert resp.status_code == 500  # wraps the 400

    @pytest.mark.asyncio
    async def test_cascade_delete(self, client, test_email):
        """Deleting a parent deletes all sub-tasks."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}

        resp = await client.post("/todos", json={"text": "Parent"}, headers=headers)
        parent_id = resp.json()["_id"]

        # Create subtasks
        subtask_ids = []
        for i in range(2):
            resp = await client.post(
                "/todos",
                json={"text": f"Step {i+1}", "parent_id": parent_id},
                headers=headers,
            )
            subtask_ids.append(resp.json()["_id"])

        # Delete parent
        resp = await client.delete(f"/todos/{parent_id}", headers=headers)
        assert resp.status_code == 200

        # Verify subtasks are gone
        resp = await client.get("/todos", headers=headers)
        remaining_ids = [t["_id"] for t in resp.json()]
        for sid in subtask_ids:
            assert sid not in remaining_ids

    @pytest.mark.asyncio
    async def test_delete_subtask_removes_from_parent(self, client, test_email):
        """Deleting a subtask removes its ID from the parent's subtask_ids."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)

        resp = await client.post("/todos", json={"text": "Parent", "space_id": space_id}, headers=headers)
        parent_id = resp.json()["_id"]

        # Create 2 subtasks
        child_ids = []
        for i in range(2):
            resp = await client.post(
                "/todos",
                json={"text": f"Step {i+1}", "parent_id": parent_id, "space_id": space_id},
                headers=headers,
            )
            child_ids.append(resp.json()["_id"])

        # Delete first subtask
        resp = await client.delete(f"/todos/{child_ids[0]}", headers=headers)
        assert resp.status_code == 200

        # Parent's subtask_ids should only have the second child
        parent_fresh = await _get_todo(client, headers, space_id, parent_id)
        assert parent_fresh["subtask_ids"] == [child_ids[1]]

    @pytest.mark.asyncio
    async def test_completing_subtask_does_not_auto_complete_parent(self, client, test_email):
        """Completing all sub-tasks does NOT auto-complete the parent (agent handles that)."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)

        resp = await client.post("/todos", json={"text": "Parent", "space_id": space_id}, headers=headers)
        parent_id = resp.json()["_id"]

        subtask_ids = []
        for i in range(2):
            resp = await client.post(
                "/todos",
                json={"text": f"Step {i+1}", "parent_id": parent_id, "space_id": space_id},
                headers=headers,
            )
            subtask_ids.append(resp.json()["_id"])

        # Complete both subtasks
        for sid in subtask_ids:
            resp = await client.put(f"/todos/{sid}/complete", headers=headers)
            assert resp.status_code == 200

        # Parent should NOT be auto-completed — managing agent does that
        parent_fresh = await _get_todo(client, headers, space_id, parent_id)
        assert parent_fresh["completed"] is False

    @pytest.mark.asyncio
    async def test_get_subtasks_endpoint(self, client, test_email):
        """GET /todos/{id}/subtasks returns ordered subtasks."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}

        resp = await client.post("/todos", json={"text": "Parent"}, headers=headers)
        parent_id = resp.json()["_id"]

        for i in range(3):
            await client.post(
                "/todos",
                json={"text": f"Step {i+1}", "parent_id": parent_id},
                headers=headers,
            )

        resp = await client.get(f"/todos/{parent_id}/subtasks", headers=headers)
        assert resp.status_code == 200
        subtasks = resp.json()
        assert len(subtasks) == 3
        assert subtasks[0]["text"] == "Step 1"
        assert subtasks[1]["text"] == "Step 2"
        assert subtasks[2]["text"] == "Step 3"

    @pytest.mark.asyncio
    async def test_subtasks_hidden_from_top_level(self, client, test_email):
        """Sub-tasks have parent_id set so frontend can filter them."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)

        resp = await client.post("/todos", json={"text": "Parent", "space_id": space_id}, headers=headers)
        parent_id = resp.json()["_id"]

        await client.post(
            "/todos",
            json={"text": "Child", "parent_id": parent_id, "space_id": space_id},
            headers=headers,
        )

        resp = await client.get(f"/todos?space_id={space_id}", headers=headers)
        todos = resp.json()
        # Both parent and child are in the flat list
        assert len(todos) == 2
        # But the child has parent_id set for frontend filtering
        child = [t for t in todos if t.get("parent_id")][0]
        assert child["parent_id"] == parent_id
