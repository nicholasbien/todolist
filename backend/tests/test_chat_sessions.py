"""Tests for chat session timestamp tracking and pending session enrichment."""

from datetime import datetime

import pytest
from chat_sessions import append_message, create_session, get_pending_sessions


@pytest.fixture
def user_id():
    return "test_user_sessions"


@pytest.fixture
def space_id():
    return "test_space_sessions"


class TestSessionTimestamps:
    """Tests for last_user_message_at / last_agent_message_at tracking."""

    @pytest.mark.asyncio
    async def test_create_session_sets_last_user_message_at(self, client, user_id, space_id):
        """Creating a todo-linked session initializes last_user_message_at."""
        import chat_sessions

        session_id = await create_session(user_id, space_id, "Test task", todo_id="todo_123")
        from bson import ObjectId

        doc = await chat_sessions.sessions_collection.find_one({"_id": ObjectId(session_id)})
        assert doc is not None
        assert "last_user_message_at" in doc
        assert isinstance(doc["last_user_message_at"], datetime)

    @pytest.mark.asyncio
    async def test_create_session_without_todo_no_timestamp(self, client, user_id, space_id):
        """Non-todo sessions don't get last_user_message_at at creation."""
        import chat_sessions

        session_id = await create_session(user_id, space_id, "Regular session")
        from bson import ObjectId

        doc = await chat_sessions.sessions_collection.find_one({"_id": ObjectId(session_id)})
        assert doc is not None
        assert "last_user_message_at" not in doc

    @pytest.mark.asyncio
    async def test_append_user_message_sets_timestamp(self, client, user_id, space_id):
        """User messages update last_user_message_at."""
        import chat_sessions

        session_id = await create_session(user_id, space_id, "Test", todo_id="todo_456")
        await append_message(session_id, user_id, "user", "Hello agent")

        from bson import ObjectId

        doc = await chat_sessions.sessions_collection.find_one({"_id": ObjectId(session_id)})
        assert "last_user_message_at" in doc

    @pytest.mark.asyncio
    async def test_append_assistant_message_sets_timestamp(self, client, user_id, space_id):
        """Assistant messages update last_agent_message_at."""
        import chat_sessions

        session_id = await create_session(user_id, space_id, "Test", todo_id="todo_789")
        await append_message(session_id, user_id, "user", "Hello")
        await append_message(session_id, user_id, "assistant", "Hi there!", agent_id="claude")

        from bson import ObjectId

        doc = await chat_sessions.sessions_collection.find_one({"_id": ObjectId(session_id)})
        assert "last_agent_message_at" in doc
        assert isinstance(doc["last_agent_message_at"], datetime)


class TestPendingSessionEnrichment:
    """Tests for enriched pending session responses."""

    @pytest.mark.asyncio
    async def test_pending_sessions_include_message_count(self, client, user_id, space_id):
        """Pending sessions should include message_count."""
        session_id = await create_session(user_id, space_id, "Count test", todo_id="todo_count")
        await append_message(session_id, user_id, "user", "First message")
        await append_message(session_id, user_id, "assistant", "Reply", agent_id="claude")
        await append_message(session_id, user_id, "user", "Follow-up")

        sessions = await get_pending_sessions(user_id, space_id, agent_id="claude")
        assert len(sessions) >= 1
        session = next(s for s in sessions if s["_id"] == session_id)
        assert session["message_count"] == 3

    @pytest.mark.asyncio
    async def test_pending_sessions_include_last_user_message(self, client, user_id, space_id):
        """Pending sessions should include last_user_message preview."""
        session_id = await create_session(user_id, space_id, "Preview test", todo_id="todo_preview")
        await append_message(session_id, user_id, "user", "Can you help me with this?")

        sessions = await get_pending_sessions(user_id, space_id)
        assert len(sessions) >= 1
        session = next(s for s in sessions if s["_id"] == session_id)
        assert session.get("last_user_message") == "Can you help me with this?"

    @pytest.mark.asyncio
    async def test_pending_sessions_is_followup_flag(self, client, user_id, space_id):
        """is_followup should be True when user messages after agent reply."""
        session_id = await create_session(user_id, space_id, "Followup test", todo_id="todo_followup")
        await append_message(session_id, user_id, "user", "Initial request")
        await append_message(session_id, user_id, "assistant", "Here's my response", agent_id="claude")
        await append_message(session_id, user_id, "user", "Thanks, one more thing")

        sessions = await get_pending_sessions(user_id, space_id, agent_id="claude")
        session = next(s for s in sessions if s["_id"] == session_id)
        assert session["is_followup"] is True

    @pytest.mark.asyncio
    async def test_pending_sessions_not_followup_for_new(self, client, user_id, space_id):
        """is_followup should be False for brand new sessions."""
        session_id = await create_session(user_id, space_id, "New test", todo_id="todo_new")
        await append_message(session_id, user_id, "user", "Brand new request")

        sessions = await get_pending_sessions(user_id, space_id)
        session = next(s for s in sessions if s["_id"] == session_id)
        assert session["is_followup"] is False

    @pytest.mark.asyncio
    async def test_pending_sessions_include_timestamps(self, client, user_id, space_id):
        """Pending sessions should include the timestamp fields."""
        session_id = await create_session(user_id, space_id, "TS test", todo_id="todo_ts")
        await append_message(session_id, user_id, "user", "Hello")
        await append_message(session_id, user_id, "assistant", "Hi", agent_id="claude")
        await append_message(session_id, user_id, "user", "Follow-up")

        sessions = await get_pending_sessions(user_id, space_id, agent_id="claude")
        session = next(s for s in sessions if s["_id"] == session_id)
        assert "last_user_message_at" in session
        assert "last_agent_message_at" in session
