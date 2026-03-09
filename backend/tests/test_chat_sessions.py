"""Tests for pending session enrichment."""

import pytest
from chat_sessions import append_message, create_session, get_pending_sessions


@pytest.fixture
def user_id():
    return "test_user_sessions"


@pytest.fixture
def space_id():
    return "test_space_sessions"


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
    async def test_pending_sessions_is_followup_when_agent_claimed(self, client, user_id, space_id):
        """is_followup should be True when agent_id is set (agent previously claimed session)."""
        session_id = await create_session(user_id, space_id, "Followup test", todo_id="todo_followup")
        await append_message(session_id, user_id, "user", "Initial request")
        await append_message(session_id, user_id, "assistant", "Here's my response", agent_id="claude")
        await append_message(session_id, user_id, "user", "Thanks, one more thing")

        sessions = await get_pending_sessions(user_id, space_id, agent_id="claude")
        session = next(s for s in sessions if s["_id"] == session_id)
        assert session["is_followup"] is True

    @pytest.mark.asyncio
    async def test_pending_sessions_not_followup_for_unclaimed(self, client, user_id, space_id):
        """is_followup should be False for unclaimed sessions (no agent_id)."""
        session_id = await create_session(user_id, space_id, "New test", todo_id="todo_new")
        await append_message(session_id, user_id, "user", "Brand new request")

        sessions = await get_pending_sessions(user_id, space_id)
        session = next(s for s in sessions if s["_id"] == session_id)
        assert session["is_followup"] is False
