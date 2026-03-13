"""Tests for agent response flag tracking in chat sessions."""

import pytest
from datetime import datetime
from unittest.mock import Mock, patch, AsyncMock
from bson import ObjectId

from chat_sessions import append_message, get_pending_sessions


@pytest.mark.asyncio
async def test_append_message_user_sets_needs_agent_response():
    """When user posts, needs_agent_response should be True."""
    mock_coll = AsyncMock()
    mock_traj_coll = AsyncMock()
    
    with patch('chat_sessions.sessions_collection', mock_coll), \
         patch('chat_sessions.trajectories_collection', mock_traj_coll):
        
        result = await append_message(
            session_id="test_session",
            user_id="user123",
            role="user",
            content="Hello",
        )
        
        # Check that sessions collection was updated with needs_agent_response=True
        call_args = mock_coll.update_one.call_args
        assert call_args[0][1]["$set"]["needs_agent_response"] is True


@pytest.mark.asyncio
async def test_append_message_assistant_resets_needs_agent_response():
    """When assistant posts, needs_agent_response should be False."""
    mock_coll = AsyncMock()
    mock_traj_coll = AsyncMock()
    
    with patch('chat_sessions.sessions_collection', mock_coll), \
         patch('chat_sessions.trajectories_collection', mock_traj_coll):
        
        result = await append_message(
            session_id="test_session",
            user_id="user123",
            role="assistant",
            content="Hello back",
            interim=False,
        )
        
        # Check that sessions collection was updated with needs_agent_response=False
        call_args = mock_coll.update_one.call_args
        assert call_args[0][1]["$set"]["needs_agent_response"] is False
        assert call_args[0][1]["$set"]["has_unread_reply"] is True


@pytest.mark.asyncio
async def test_append_message_assistant_interim_does_not_reset():
    """When assistant posts interim update, needs_agent_response should NOT change."""
    mock_coll = AsyncMock()
    mock_traj_coll = AsyncMock()
    
    with patch('chat_sessions.sessions_collection', mock_coll), \
         patch('chat_sessions.trajectories_collection', mock_traj_coll):
        
        result = await append_message(
            session_id="test_session",
            user_id="user123",
            role="assistant",
            content="Working on this...",
            interim=True,  # Progress update
        )
        
        # Check that needs_agent_response is NOT in the update
        call_args = mock_coll.update_one.call_args
        update_fields = call_args[0][1]["$set"]
        assert "needs_agent_response" not in update_fields or update_fields.get("needs_agent_response") is None


@pytest.mark.asyncio
async def test_append_message_sets_agent_id():
    """When assistant posts with agent_id, it should be set on the session."""
    mock_coll = AsyncMock()
    mock_traj_coll = AsyncMock()
    
    with patch('chat_sessions.sessions_collection', mock_coll), \
         patch('chat_sessions.trajectories_collection', mock_traj_coll):
        
        result = await append_message(
            session_id="test_session",
            user_id="user123",
            role="assistant",
            content="Hello",
            agent_id="openclaw",
        )
        
        # Check that agent_id was set
        call_args = mock_coll.update_one.call_args
        assert call_args[0][1]["$set"]["agent_id"] == "openclaw"


@pytest.mark.asyncio
async def test_get_pending_sessions_excludes_answered_sessions():
    """Sessions with needs_agent_response=False should not appear in pending."""
    mock_cursor = AsyncMock()
    mock_cursor.to_list = AsyncMock(return_value=[])
    
    mock_coll = Mock()
    mock_coll.find.return_value = mock_cursor
    
    with patch('chat_sessions.sessions_collection', mock_coll), \
         patch('chat_sessions.trajectories_collection', Mock()):
        
        result = await get_pending_sessions("user123", agent_id="openclaw")
        
        # Check the query includes needs_agent_response=True
        query = mock_coll.find.call_args[0][0]
        assert query["needs_agent_response"] is True
