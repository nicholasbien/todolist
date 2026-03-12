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
    async def test_pending_sessions_include_recent_messages(self, client, user_id, space_id):
        """Pending sessions should include recent_messages with all user messages since last assistant reply."""
        session_id = await create_session(user_id, space_id, "Preview test", todo_id="todo_preview")
        await append_message(session_id, user_id, "user", "Can you help me with this?")

        sessions = await get_pending_sessions(user_id, space_id)
        assert len(sessions) >= 1
        session = next(s for s in sessions if s["_id"] == session_id)
        assert session.get("recent_messages") == ["Can you help me with this?"]

    @pytest.mark.asyncio
    async def test_pending_sessions_recent_messages_multiple(self, client, user_id, space_id):
        """recent_messages should include all user messages since last assistant reply."""
        session_id = await create_session(user_id, space_id, "Multi test", todo_id="todo_multi")
        await append_message(session_id, user_id, "user", "First question")
        await append_message(session_id, user_id, "assistant", "Answer", agent_id="claude")
        await append_message(session_id, user_id, "user", "Follow-up 1")
        await append_message(session_id, user_id, "user", "Follow-up 2")

        sessions = await get_pending_sessions(user_id, space_id, agent_id="claude")
        session = next(s for s in sessions if s["_id"] == session_id)
        assert session.get("recent_messages") == ["Follow-up 1", "Follow-up 2"]

    @pytest.mark.asyncio
    async def test_pending_sessions_recent_messages_new_session(self, client, user_id, space_id):
        """For new sessions with no assistant reply, all messages should be in recent_messages."""
        session_id = await create_session(user_id, space_id, "New multi test", todo_id="todo_new_multi")
        await append_message(session_id, user_id, "user", "Message 1")
        await append_message(session_id, user_id, "user", "Message 2")

        sessions = await get_pending_sessions(user_id, space_id)
        session = next(s for s in sessions if s["_id"] == session_id)
        assert session.get("recent_messages") == ["Message 1", "Message 2"]

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


class TestInterimFlag:
    """Tests for the interim flag on append_message."""

    @pytest.mark.asyncio
    async def test_interim_true_does_not_clear_needs_agent_response(self, client, user_id, space_id):
        """An interim assistant message should NOT clear needs_agent_response."""
        from chat_sessions import sessions_collection

        session_id = await create_session(user_id, space_id, "Interim test", todo_id="todo_interim1")
        await append_message(session_id, user_id, "user", "Help me")

        # Verify needs_agent_response is True after user message
        from bson import ObjectId

        doc = await sessions_collection.find_one({"_id": ObjectId(session_id)})
        assert doc["needs_agent_response"] is True

        # Post interim assistant message
        await append_message(
            session_id,
            user_id,
            "assistant",
            "Working on this...",
            agent_id="claude",
            interim=True,
        )

        doc = await sessions_collection.find_one({"_id": ObjectId(session_id)})
        assert doc["needs_agent_response"] is True

    @pytest.mark.asyncio
    async def test_interim_false_clears_needs_agent_response(self, client, user_id, space_id):
        """A non-interim (default) assistant message SHOULD clear needs_agent_response."""
        from chat_sessions import sessions_collection

        session_id = await create_session(user_id, space_id, "Non-interim test", todo_id="todo_interim2")
        await append_message(session_id, user_id, "user", "Help me")

        from bson import ObjectId

        doc = await sessions_collection.find_one({"_id": ObjectId(session_id)})
        assert doc["needs_agent_response"] is True

        # Post non-interim assistant message (default)
        await append_message(session_id, user_id, "assistant", "Here is the answer", agent_id="claude")

        doc = await sessions_collection.find_one({"_id": ObjectId(session_id)})
        assert doc["needs_agent_response"] is False

    @pytest.mark.asyncio
    async def test_interim_true_still_sets_unread_and_agent_id(self, client, user_id, space_id):
        """An interim message should still set has_unread_reply and agent_id."""
        from chat_sessions import sessions_collection

        session_id = await create_session(user_id, space_id, "Interim flags test", todo_id="todo_interim3")
        await append_message(session_id, user_id, "user", "Help me")

        await append_message(
            session_id,
            user_id,
            "assistant",
            "Working on this...",
            agent_id="test-agent",
            interim=True,
        )

        from bson import ObjectId

        doc = await sessions_collection.find_one({"_id": ObjectId(session_id)})
        assert doc["has_unread_reply"] is True
        assert doc["agent_id"] == "test-agent"
