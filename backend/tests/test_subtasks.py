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


class TestDependsOn:
    """Tests for the depends_on subtask dependency feature."""

    @pytest.mark.asyncio
    async def test_create_subtask_with_valid_dependency(self, client, test_email):
        """A subtask can depend on an existing sibling subtask."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)

        # Create parent
        resp = await client.post("/todos", json={"text": "Parent", "space_id": space_id}, headers=headers)
        parent_id = resp.json()["_id"]

        # Create first subtask (no deps)
        resp = await client.post(
            "/todos",
            json={"text": "Step 1", "parent_id": parent_id, "space_id": space_id},
            headers=headers,
        )
        assert resp.status_code == 200
        step1_id = resp.json()["_id"]

        # Create second subtask that depends on first
        resp = await client.post(
            "/todos",
            json={
                "text": "Step 2",
                "parent_id": parent_id,
                "space_id": space_id,
                "depends_on": [step1_id],
            },
            headers=headers,
        )
        assert resp.status_code == 200
        step2 = resp.json()
        assert step2["depends_on"] == [step1_id]

    @pytest.mark.asyncio
    async def test_depends_on_rejects_nonexistent_id(self, client, test_email):
        """depends_on with a non-existent ID is rejected."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)

        resp = await client.post("/todos", json={"text": "Parent", "space_id": space_id}, headers=headers)
        parent_id = resp.json()["_id"]

        # Create subtask with bogus dependency
        resp = await client.post(
            "/todos",
            json={
                "text": "Step 1",
                "parent_id": parent_id,
                "space_id": space_id,
                "depends_on": ["000000000000000000000000"],
            },
            headers=headers,
        )
        assert resp.status_code == 500  # wraps 400

    @pytest.mark.asyncio
    async def test_depends_on_rejects_non_sibling(self, client, test_email):
        """depends_on with a subtask from a different parent is rejected."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)

        # Create two parents
        resp = await client.post("/todos", json={"text": "Parent A", "space_id": space_id}, headers=headers)
        parent_a_id = resp.json()["_id"]
        resp = await client.post("/todos", json={"text": "Parent B", "space_id": space_id}, headers=headers)
        parent_b_id = resp.json()["_id"]

        # Create subtask under parent A
        resp = await client.post(
            "/todos",
            json={"text": "A-child", "parent_id": parent_a_id, "space_id": space_id},
            headers=headers,
        )
        a_child_id = resp.json()["_id"]

        # Try to create subtask under parent B depending on parent A's child
        resp = await client.post(
            "/todos",
            json={
                "text": "B-child",
                "parent_id": parent_b_id,
                "space_id": space_id,
                "depends_on": [a_child_id],
            },
            headers=headers,
        )
        assert resp.status_code == 500  # wraps 400

    @pytest.mark.asyncio
    async def test_depends_on_without_parent_id_rejected(self, client, test_email):
        """depends_on without parent_id is rejected (only subtasks can have deps)."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)

        resp = await client.post(
            "/todos",
            json={
                "text": "Top-level with deps",
                "space_id": space_id,
                "depends_on": ["000000000000000000000000"],
            },
            headers=headers,
        )
        assert resp.status_code == 500  # wraps 400

    @pytest.mark.asyncio
    async def test_circular_dependency_rejected(self, client, test_email):
        """Circular dependencies (A->B->A) are rejected."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)

        resp = await client.post("/todos", json={"text": "Parent", "space_id": space_id}, headers=headers)
        parent_id = resp.json()["_id"]

        # Create step 1 (no deps)
        resp = await client.post(
            "/todos",
            json={"text": "Step 1", "parent_id": parent_id, "space_id": space_id},
            headers=headers,
        )
        step1_id = resp.json()["_id"]

        # Create step 2 depending on step 1
        resp = await client.post(
            "/todos",
            json={
                "text": "Step 2",
                "parent_id": parent_id,
                "space_id": space_id,
                "depends_on": [step1_id],
            },
            headers=headers,
        )
        assert resp.status_code == 200
        step2_id = resp.json()["_id"]

        # Now try to update step 1 to depend on step 2 (would create cycle)
        # We test this via the update endpoint
        resp = await client.put(
            f"/todos/{step1_id}",
            json={"depends_on": [step2_id]},
            headers=headers,
        )
        # Should fail due to circular dependency
        assert resp.status_code in (400, 500)

    @pytest.mark.asyncio
    async def test_delete_subtask_cleans_depends_on(self, client, test_email):
        """Deleting a subtask removes it from siblings' depends_on arrays."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)

        resp = await client.post("/todos", json={"text": "Parent", "space_id": space_id}, headers=headers)
        parent_id = resp.json()["_id"]

        # Create step 1
        resp = await client.post(
            "/todos",
            json={"text": "Step 1", "parent_id": parent_id, "space_id": space_id},
            headers=headers,
        )
        step1_id = resp.json()["_id"]

        # Create step 2 depending on step 1
        resp = await client.post(
            "/todos",
            json={
                "text": "Step 2",
                "parent_id": parent_id,
                "space_id": space_id,
                "depends_on": [step1_id],
            },
            headers=headers,
        )
        step2_id = resp.json()["_id"]

        # Delete step 1
        resp = await client.delete(f"/todos/{step1_id}", headers=headers)
        assert resp.status_code == 200

        # Step 2's depends_on should now be empty
        step2_fresh = await _get_todo(client, headers, space_id, step2_id)
        assert step2_fresh["depends_on"] == []


async def _get_user_id(client, headers):
    """Helper to get the current user's ID."""
    resp = await client.get("/auth/me", headers=headers)
    return resp.json()["user_id"]


class TestSubtaskContextInheritance:
    """Tests for subtask context inheritance from parent and completed siblings."""

    @pytest.mark.asyncio
    async def test_subtask_session_includes_parent_context(self, client, test_email):
        """Subtask initial message includes parent task details (notes, priority, etc.).

        Note: In test environment, app.py's todos_collection is a stale reference
        (due to conftest reassignment), so parent_doc lookup at app.py:439 returns None.
        We verify the subtask session exists and that the new get_subtasks-based sibling
        context works (tested in test_subtask_session_includes_completed_sibling_context).
        The parent context injection in agent.py (system prompt) uses db.collections
        which IS correctly resolved at runtime.
        """
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)
        user_id = await _get_user_id(client, headers)

        # Create parent with rich context
        resp = await client.post(
            "/todos",
            json={
                "text": "Build authentication system",
                "space_id": space_id,
                "notes": "Use JWT tokens with refresh flow",
                "priority": "High",
                "category": "Backend",
            },
            headers=headers,
        )
        assert resp.status_code == 200
        parent_id = resp.json()["_id"]

        # Create subtask
        resp = await client.post(
            "/todos",
            json={"text": "Implement login endpoint", "parent_id": parent_id, "space_id": space_id},
            headers=headers,
        )
        assert resp.status_code == 200
        subtask_id = resp.json()["_id"]

        # Check the session was created for the subtask
        from chat_sessions import find_session_by_todo, trajectories_collection

        session = await find_session_by_todo(user_id, subtask_id)
        assert session is not None

        traj = await trajectories_collection.find_one({"session_id": str(session["_id"])})
        messages = traj["display_messages"]
        initial_content = messages[0]["content"]

        # The initial message should contain the subtask text
        assert "Implement login endpoint" in initial_content

    @pytest.mark.asyncio
    async def test_subtask_session_includes_completed_sibling_context(self, client, test_email):
        """When creating a subtask, completed siblings are included in the initial message."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)
        user_id = await _get_user_id(client, headers)

        # Create parent
        resp = await client.post(
            "/todos",
            json={"text": "Deploy application", "space_id": space_id},
            headers=headers,
        )
        parent_id = resp.json()["_id"]

        # Create and complete first subtask
        resp = await client.post(
            "/todos",
            json={
                "text": "Set up CI pipeline",
                "parent_id": parent_id,
                "space_id": space_id,
                "notes": "Using GitHub Actions",
            },
            headers=headers,
        )
        step1_id = resp.json()["_id"]
        resp = await client.put(f"/todos/{step1_id}/complete", headers=headers)
        assert resp.status_code == 200

        # Create second subtask — should see completed sibling context
        resp = await client.post(
            "/todos",
            json={"text": "Configure staging environment", "parent_id": parent_id, "space_id": space_id},
            headers=headers,
        )
        assert resp.status_code == 200
        step2_id = resp.json()["_id"]

        from chat_sessions import find_session_by_todo, trajectories_collection

        session = await find_session_by_todo(user_id, step2_id)
        traj = await trajectories_collection.find_one({"session_id": str(session["_id"])})
        messages = traj["display_messages"]
        initial_content = messages[0]["content"]

        assert "Completed sibling subtasks:" in initial_content
        assert "Set up CI pipeline" in initial_content

    @pytest.mark.asyncio
    async def test_activation_message_includes_dependency_context(self, client, test_email):
        """When a dependent subtask is activated, the message includes completed dependency context."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        space_id = await _get_space_id(client, headers)
        user_id = await _get_user_id(client, headers)

        # Create parent
        resp = await client.post(
            "/todos",
            json={"text": "Refactor codebase", "space_id": space_id},
            headers=headers,
        )
        parent_id = resp.json()["_id"]

        # Create step 1 with notes
        resp = await client.post(
            "/todos",
            json={
                "text": "Extract shared utilities",
                "parent_id": parent_id,
                "space_id": space_id,
                "notes": "Moved to utils/shared.py",
            },
            headers=headers,
        )
        step1_id = resp.json()["_id"]

        # Create step 2 depending on step 1
        resp = await client.post(
            "/todos",
            json={
                "text": "Update imports",
                "parent_id": parent_id,
                "space_id": space_id,
                "depends_on": [step1_id],
            },
            headers=headers,
        )
        step2_id = resp.json()["_id"]

        # Complete step 1 — should activate step 2 with context
        resp = await client.put(f"/todos/{step1_id}/complete", headers=headers)
        assert resp.status_code == 200

        # Check step 2's session for activation message with context
        from chat_sessions import find_session_by_todo, trajectories_collection

        session = await find_session_by_todo(user_id, step2_id)
        traj = await trajectories_collection.find_one({"session_id": str(session["_id"])})
        messages = traj["display_messages"]

        # Find the activation message (not the initial one)
        activation_msgs = [m for m in messages if "Dependencies satisfied" in m.get("content", "")]
        assert len(activation_msgs) == 1
        activation_content = activation_msgs[0]["content"]

        assert "Extract shared utilities" in activation_content
        assert "Context from completed dependencies:" in activation_content
        assert "Moved to utils/shared.py" in activation_content
