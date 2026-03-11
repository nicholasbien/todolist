"""Tests for the proactive briefings module."""

from datetime import datetime, timedelta

import pytest


@pytest.fixture
def user_id():
    return "test_user_briefings"


@pytest.fixture
def space_id():
    return "test_space_briefings"


class TestBriefingPreferences:
    """Tests for briefing preference management."""

    @pytest.mark.asyncio
    async def test_get_default_preferences(self, client, user_id):
        """Default preferences should be returned for unknown users."""
        from briefings import get_briefing_preferences

        prefs = await get_briefing_preferences(user_id)
        assert prefs["briefing_enabled"] is False
        assert prefs["briefing_hour"] == 8
        assert prefs["briefing_minute"] == 0
        assert prefs["stale_task_days"] == 3

    @pytest.mark.asyncio
    async def test_update_preferences(self, client, user_id):
        """Updating preferences should persist and return new values."""
        from briefings import get_briefing_preferences, update_briefing_preferences
        from db import db

        # Create the user document first
        await db.users.insert_one(
            {
                "_id": __import__("bson").ObjectId(b"briefuser001"),
                "email": "briefing@test.com",
                "first_name": "Test",
                "is_verified": True,
            }
        )
        uid = str(__import__("bson").ObjectId(b"briefuser001"))

        prefs = await update_briefing_preferences(
            uid,
            briefing_enabled=True,
            briefing_hour=9,
            briefing_minute=30,
            stale_task_days=5,
            timezone="America/Chicago",
        )

        assert prefs["briefing_enabled"] is True
        assert prefs["briefing_hour"] == 9
        assert prefs["briefing_minute"] == 30
        assert prefs["stale_task_days"] == 5

        # Verify persistence
        fetched = await get_briefing_preferences(uid)
        assert fetched["briefing_enabled"] is True
        assert fetched["briefing_hour"] == 9


class TestBriefingGeneration:
    """Tests for briefing content generation."""

    @pytest.mark.asyncio
    async def test_fallback_briefing(self, client):
        """Fallback briefing should render without OpenAI."""
        from briefings import _fallback_briefing

        tasks = [
            {"text": "Buy groceries", "priority": "High", "dateAdded": "2026-03-01"},
            {"text": "Write report", "priority": "Medium", "dateAdded": "2026-03-05"},
        ]
        completions = [
            {"text": "Clean house", "dateCompleted": "2026-03-10"},
        ]

        result = _fallback_briefing(tasks, completions, "Nick")
        assert "Nick" in result
        assert "2" in result  # 2 open tasks
        assert "Buy groceries" in result  # High priority task
        assert "1" in result  # 1 completion

    @pytest.mark.asyncio
    async def test_fallback_briefing_no_name(self, client):
        """Fallback briefing should work without a user name."""
        from briefings import _fallback_briefing

        result = _fallback_briefing([], [], "")
        assert "Good morning" in result
        assert "0" in result  # 0 open tasks

    @pytest.mark.asyncio
    async def test_build_briefing_prompt(self, client):
        """The prompt builder should include task info."""
        from briefings import _build_briefing_prompt

        tasks = [
            {
                "text": "Deploy v2",
                "priority": "High",
                "category": "Work",
                "dueDate": "2026-03-12",
                "dateAdded": "2026-03-01T00:00:00",
            },
        ]
        prompt = _build_briefing_prompt(tasks, [], [], "Alice")
        assert "Deploy v2" in prompt
        assert "Alice" in prompt
        assert "High" in prompt
        assert "Work" in prompt


class TestStaleTaskDetection:
    """Tests for stale task identification."""

    @pytest.mark.asyncio
    async def test_get_stale_tasks(self, client, user_id, space_id):
        """Tasks older than stale_days should be returned."""
        from briefings import _get_stale_tasks
        from db import db

        old_date = (datetime.utcnow() - timedelta(days=10)).isoformat()
        new_date = datetime.utcnow().isoformat()

        # Insert an old task (should be stale)
        await db.todos.insert_one(
            {
                "user_id": user_id,
                "space_id": space_id,
                "text": "Old stale task",
                "completed": False,
                "dateAdded": old_date,
            }
        )

        # Insert a new task (should NOT be stale)
        await db.todos.insert_one(
            {
                "user_id": user_id,
                "space_id": space_id,
                "text": "New task",
                "completed": False,
                "dateAdded": new_date,
            }
        )

        stale = await _get_stale_tasks(user_id, stale_days=3, space_id=space_id)
        stale_texts = [t["text"] for t in stale]
        assert "Old stale task" in stale_texts
        assert "New task" not in stale_texts

    @pytest.mark.asyncio
    async def test_completed_tasks_not_stale(self, client, user_id, space_id):
        """Completed tasks should never be returned as stale."""
        from briefings import _get_stale_tasks
        from db import db

        old_date = (datetime.utcnow() - timedelta(days=10)).isoformat()
        await db.todos.insert_one(
            {
                "user_id": user_id,
                "space_id": space_id,
                "text": "Done old task",
                "completed": True,
                "dateAdded": old_date,
            }
        )

        stale = await _get_stale_tasks(user_id, stale_days=3, space_id=space_id)
        stale_texts = [t["text"] for t in stale]
        assert "Done old task" not in stale_texts

    @pytest.mark.asyncio
    async def test_subtasks_excluded_from_stale(self, client, user_id, space_id):
        """Subtasks (tasks with parent_id) should not appear in stale results."""
        from briefings import _get_stale_tasks
        from db import db

        old_date = (datetime.utcnow() - timedelta(days=10)).isoformat()
        await db.todos.insert_one(
            {
                "user_id": user_id,
                "space_id": space_id,
                "text": "Stale subtask",
                "completed": False,
                "dateAdded": old_date,
                "parent_id": "some_parent",
            }
        )

        stale = await _get_stale_tasks(user_id, stale_days=3, space_id=space_id)
        stale_texts = [t["text"] for t in stale]
        assert "Stale subtask" not in stale_texts


class TestNudgeGeneration:
    """Tests for stale task nudge messages."""

    def test_nudge_includes_task_text(self):
        from briefings import generate_stale_task_nudge

        task = {"text": "Fix the bug", "dateAdded": "2026-03-01T00:00:00+00:00"}
        nudge = generate_stale_task_nudge(task)
        assert "Fix the bug" in nudge
        assert "days" in nudge

    def test_nudge_overdue_mention(self):
        from briefings import generate_stale_task_nudge

        task = {
            "text": "Overdue task",
            "dateAdded": "2026-02-01T00:00:00+00:00",
            "dueDate": "2026-02-15",
        }
        nudge = generate_stale_task_nudge(task)
        assert "overdue" in nudge.lower()


class TestBriefingOrchestration:
    """Tests for posting briefings and nudges to sessions."""

    @pytest.mark.asyncio
    async def test_post_morning_briefing_creates_session(self, client, space_id):
        """post_morning_briefing should create a session with a briefing message."""
        from briefings import post_morning_briefing
        from chat_sessions import sessions_collection, trajectories_collection
        from db import db

        # Create user
        result = await db.users.insert_one(
            {
                "_id": __import__("bson").ObjectId(b"briefuser002"),
                "email": "morning@test.com",
                "first_name": "Morning",
                "is_verified": True,
            }
        )
        uid = str(result.inserted_id)

        session_id = await post_morning_briefing(uid, space_id)
        assert session_id is not None

        # Verify session was created
        from bson import ObjectId

        session = await sessions_collection.find_one({"_id": ObjectId(session_id)})
        assert session is not None
        assert "Morning Briefing" in session["title"]
        assert session["agent_id"] == "briefing-agent"

        # Verify message was posted
        traj = await trajectories_collection.find_one({"session_id": session_id})
        assert traj is not None
        assert len(traj["display_messages"]) >= 1
        assert traj["display_messages"][0]["role"] == "assistant"

    @pytest.mark.asyncio
    async def test_post_stale_nudges(self, client, space_id):
        """post_stale_task_nudges should post nudges for stale tasks."""
        from briefings import post_stale_task_nudges
        from chat_sessions import sessions_collection
        from db import db

        uid = "nudge_test_user"
        old_date = (datetime.utcnow() - timedelta(days=10)).isoformat()

        # Insert a stale task
        task_result = await db.todos.insert_one(
            {
                "user_id": uid,
                "space_id": space_id,
                "text": "Stale for nudge",
                "completed": False,
                "dateAdded": old_date,
            }
        )
        task_id = str(task_result.inserted_id)

        nudged = await post_stale_task_nudges(uid, stale_days=3, space_id=space_id)
        assert len(nudged) >= 1

        # Verify session was created for the task
        session = await sessions_collection.find_one({"todo_id": task_id})
        assert session is not None
        assert session["agent_id"] == "briefing-agent"
