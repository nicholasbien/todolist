#!/usr/bin/env python3
"""
Comprehensive tests for the Python backend agent system.
Tests all tools, streaming functionality, and edge cases.
"""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from agent.agent import AGENT_SYSTEM_PROMPT, format_sse_message, stream_agent_response
from agent.schemas import (
    OPENAI_TOOL_SCHEMAS,
    BookRecommendationRequest,
    InspirationalQuoteRequest,
    JournalAddRequest,
    JournalReadRequest,
    SearchRequest,
    TaskAddRequest,
    TaskListRequest,
    TaskUpdateRequest,
    WeatherCurrentRequest,
    WeatherForecastRequest,
)
from agent.tools import (
    AVAILABLE_TOOLS,
    add_journal_entry,
    add_task,
    get_book_recommendations,
    get_current_weather,
    get_inspirational_quotes,
    get_weather_forecast,
    list_tasks,
    read_journal_entry,
    search_content,
    update_task,
)

try:  # pragma: no cover
    from agent.tools import get_weather_alerts  # type: ignore[attr-defined]
except Exception:  # pragma: no cover

    async def get_weather_alerts(request, user_id, space_id=None):
        return {"ok": True, "location": request.location, "alerts": ["No active weather alerts"]}


from .conftest import get_token


class TestAgentToolsUnit:
    """Unit tests for individual agent tools."""

    @pytest.mark.asyncio
    async def test_get_current_weather_known_location(self):
        """Test weather for known location (New York)."""
        request = WeatherCurrentRequest(location="New York")
        result = await get_current_weather(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["weather"]["location"] == "New York, NY"
        assert result["weather"]["temperature"] == 72
        assert result["weather"]["description"] == "Partly cloudy"
        assert "°F" in result["weather"]["temperature_display"]
        assert "mph" in result["weather"]["wind_speed_display"]

    @pytest.mark.asyncio
    async def test_get_current_weather_unknown_location(self):
        """Test weather for unknown location (should generate random data)."""
        request = WeatherCurrentRequest(location="UnknownCity")
        result = await get_current_weather(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["weather"]["location"] == "UnknownCity"
        assert 41 <= result["weather"]["temperature"] <= 95  # Random range in °F
        assert "°F" in result["weather"]["temperature_display"]
        assert "mph" in result["weather"]["wind_speed_display"]
        assert result["weather"]["description"] in ["Clear", "Partly cloudy", "Cloudy", "Light rain"]

    @pytest.mark.asyncio
    async def test_get_current_weather_metric_units(self):
        """Test weather with metric units."""
        request = WeatherCurrentRequest(location="New York", units="metric")
        result = await get_current_weather(request, "test_user", "test_space")

        assert result["ok"] is True
        # 22°C should remain 22°C
        assert result["weather"]["temperature"] == 22
        assert "°C" in result["weather"]["temperature_display"]
        assert "km/h" in result["weather"]["wind_speed_display"]

    @pytest.mark.asyncio
    async def test_get_weather_forecast(self):
        """Test weather forecast generation."""
        request = WeatherForecastRequest(location="London", days=3)
        result = await get_weather_forecast(request, "test_user", "test_space")

        assert result["ok"] is True
        assert len(result["forecast"]["forecast"]) == 3
        assert result["forecast"]["location"] == "London, UK"

        # Check first day matches current weather
        first_day = result["forecast"]["forecast"][0]
        assert first_day["description"] == "Light rain"  # London's mock description

    @pytest.mark.asyncio
    @patch("agent.tools.httpx.AsyncClient.get", new_callable=AsyncMock)
    async def test_get_inspirational_quotes_api_success(self, mock_get):
        """Test inspirational quotes retrieval with successful API call."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"affirmation": "You are capable"}
        mock_get.return_value = mock_response

        request = InspirationalQuoteRequest(goal="self-care", limit=1)
        result = await get_inspirational_quotes(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["quotes"] == ["You are capable"]

    @pytest.mark.asyncio
    @patch("agent.tools.httpx.AsyncClient.get", side_effect=httpx.RequestError("fail"))
    async def test_get_inspirational_quotes_fallback(self, mock_get):
        """Test inspirational quotes fallback when API call fails."""
        request = InspirationalQuoteRequest(goal="resilience", limit=2)
        result = await get_inspirational_quotes(request, "test_user", "test_space")

        assert result["ok"] is True
        assert len(result["quotes"]) == 2

    @pytest.mark.asyncio
    @patch("agent.tools.db_create_todo", new_callable=AsyncMock)
    async def test_add_task(self, mock_create_todo):
        """Test task creation."""
        # Mock Todo object that db_create_todo returns
        mock_todo = MagicMock()
        mock_todo.dict.return_value = {
            "_id": "test_id_123",
            "text": "Test task",
            "category": "Work",
            "priority": "high",
            "completed": False,
            "dateAdded": "2024-08-30T10:00:00",
            "space_id": "test_space",
            "user_id": "test_user",
        }
        mock_create_todo.return_value = mock_todo

        request = TaskAddRequest(text="Test task", category="Work", priority="high")
        result = await add_task(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["id"] == "test_id_123"
        assert result["task"]["text"] == "Test task"
        assert result["task"]["category"] == "Work"
        assert result["task"]["priority"] == "high"

    @pytest.mark.asyncio
    @patch("agent.tools.get_todos")
    async def test_list_tasks_with_todo_objects(self, mock_get_todos):
        """Test listing tasks with Pydantic Todo objects."""
        # Mock Todo objects with dict method
        mock_todo = MagicMock()
        mock_todo.dict.return_value = {
            "_id": "task_123",
            "text": "Mock task",
            "category": "Test",
            "priority": "med",
            "completed": False,
            "dateAdded": "2024-08-30T10:00:00",
        }
        mock_get_todos.return_value = [mock_todo]

        request = TaskListRequest()
        result = await list_tasks(request, "test_user", "test_space")

        assert result["ok"] is True
        assert len(result["tasks"]) == 1
        assert result["tasks"][0]["text"] == "Mock task"
        assert result["tasks"][0]["_id"] == "task_123"

    @pytest.mark.asyncio
    @patch("agent.tools.get_todos")
    async def test_list_tasks_completion_filter(self, mock_get_todos):
        """Test listing tasks with completion status filter."""
        # Mock mixed completion status
        mock_todos = []
        for i, completed in enumerate([True, False, True]):
            mock_todo = MagicMock()
            mock_todo.dict.return_value = {"_id": f"task_{i}", "text": f"Task {i}", "completed": completed}
            mock_todos.append(mock_todo)

        mock_get_todos.return_value = mock_todos

        # Test completed tasks only
        request = TaskListRequest(completed=True)
        result = await list_tasks(request, "test_user", "test_space")

        assert result["ok"] is True
        assert len(result["tasks"]) == 2  # Only completed tasks
        assert all(task["completed"] for task in result["tasks"])

    @pytest.mark.asyncio
    @patch("agent.tools.update_todo_fields", new_callable=AsyncMock)
    @patch("agent.tools.collections")
    async def test_update_task(self, mock_collections, mock_update_todo_fields):
        """Test task updates."""
        # Mock successful update
        mock_update_todo_fields.return_value = None  # No exception means success

        # Use a proper ObjectId-formatted string
        task_id = "507f1f77bcf86cd799439011"
        mock_updated_task = {
            "_id": task_id,
            "text": "Updated task",
            "priority": "high",
            "completed": True,
            "dateCompleted": "2024-08-30T10:00:00",
        }

        # Mock collections.todos.find_one
        mock_todos = AsyncMock()
        mock_todos.find_one = AsyncMock(return_value=mock_updated_task)
        mock_collections.todos = mock_todos

        request = TaskUpdateRequest(id=task_id, completed=True, priority="high")
        result = await update_task(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["task"]["completed"] is True
        assert result["task"]["priority"] == "high"

    @pytest.mark.asyncio
    @patch("agent.tools.collections")
    @patch("agent.tools.db_create_journal_entry")
    async def test_add_journal_entry(self, mock_create_journal, mock_collections):
        """Test journal entry creation when no existing entry exists."""
        # Mock JournalEntry object that create_journal_entry returns
        mock_entry = MagicMock()
        mock_entry.id = "journal_123"
        mock_entry.text = "Test journal entry"
        mock_entry.date = "2024-08-30"
        mock_entry.space_id = "test_space"
        mock_entry.user_id = "test_user"

        mock_create_journal.return_value = mock_entry

        # collections.journals.find_one should return None (no existing entry)
        mock_collections.journals.find_one = AsyncMock(return_value=None)

        request = JournalAddRequest(content="Test journal entry", date="2024-08-30")
        result = await add_journal_entry(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["id"] == "journal_123"
        assert result["journal"]["content"] == "Test journal entry"
        assert result["journal"]["date"] == "2024-08-30"

    @pytest.mark.asyncio
    @patch("agent.tools.collections")
    @patch("agent.tools.db_create_journal_entry")
    async def test_add_journal_entry_appends(self, mock_create_journal, mock_collections):
        """Test journal entry appends to existing content."""
        existing = {"text": "Existing"}
        mock_collections.journals.find_one = AsyncMock(return_value=existing)

        mock_entry = MagicMock()
        mock_entry.id = "journal_123"
        mock_entry.text = "Existing\nNew"  # expected combined text
        mock_entry.date = "2024-08-30"
        mock_entry.space_id = "test_space"
        mock_entry.user_id = "test_user"
        mock_create_journal.return_value = mock_entry

        request = JournalAddRequest(content="New", date="2024-08-30")
        result = await add_journal_entry(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["journal"]["content"] == "Existing\nNew"

    @pytest.mark.asyncio
    @patch("agent.tools.get_todos", new_callable=AsyncMock)
    @patch("agent.tools.collections")
    async def test_search_content(self, mock_collections, mock_get_todos):
        """Test content search across tasks and journals."""
        # Mock tasks
        mock_todo = MagicMock()
        mock_todo.dict.return_value = {"_id": "task_123", "text": "Important meeting notes", "category": "Work"}
        mock_get_todos.return_value = [mock_todo]

        # Mock journals - mock the entire collections object
        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(
            return_value=[{"_id": "journal_123", "content": "Met with team about important project"}]
        )
        mock_collections.journals.find.return_value = mock_cursor

        request = SearchRequest(query="important", limit=5)
        result = await search_content(request, "test_user", "test_space")

        assert result["ok"] is True
        assert len(result["results"]) == 2  # One task, one journal

        # Check task result
        task_result = next(r for r in result["results"] if r["type"] == "task")
        assert task_result["snippet"] == "Important meeting notes"

        # Check journal result
        journal_result = next(r for r in result["results"] if r["type"] == "journal")
        assert "important project" in journal_result["snippet"]

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient")
    async def test_get_book_recommendations_success(self, mock_client_class):
        """Test successful book recommendations."""
        # Mock the API response from Search API
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "docs": [
                {"title": "Test Book 1", "author_name": ["Author 1"], "first_publish_year": 2020},
                {"title": "Test Book 2", "author_name": ["Author 2"], "first_publish_year": 2021},
            ]
        }
        mock_response.raise_for_status.return_value = None

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client_class.return_value.__aenter__.return_value = mock_client

        # Test the function
        request = BookRecommendationRequest(subject="productivity", limit=2)
        result = await get_book_recommendations(request, "user123")

        # Verify results
        assert result["ok"] is True
        assert len(result["books"]) == 2
        assert result["books"][0]["title"] == "Test Book 1"
        assert result["books"][0]["author"] == "Author 1"
        assert result["books"][0]["year"] == 2020

        # Verify API call
        mock_client.get.assert_called_once_with(
            "https://openlibrary.org/search.json", params={"q": "productivity", "limit": 2}
        )

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient")
    async def test_get_book_recommendations_api_error(self, mock_client_class):
        """Test book recommendations API error handling."""
        mock_client = AsyncMock()
        mock_client.get.side_effect = httpx.RequestError("Network error")
        mock_client_class.return_value.__aenter__.return_value = mock_client

        request = BookRecommendationRequest(subject="productivity")
        result = await get_book_recommendations(request, "user123")

        assert result["ok"] is False
        assert "Failed to get recommendations" in result["error"]

    @pytest.mark.asyncio
    @patch("agent.tools.collections")
    async def test_read_journal_entry_specific_date(self, mock_collections):
        """Test reading journal entry for specific date."""
        # Mock MongoDB response
        mock_journal = {
            "_id": "journal123",
            "content": "Today was a productive day",
            "date": "2025-08-31",
            "space_id": "space123",
        }
        mock_collections.journals.find_one = AsyncMock(return_value=mock_journal)

        request = JournalReadRequest(date="2025-08-31")
        result = await read_journal_entry(request, "6843a5933e5a5d8cf5b169f8", "space123")

        assert result["ok"] is True
        assert result["entry"]["content"] == "Today was a productive day"
        assert result["entry"]["date"] == "2025-08-31"
        assert result["entry"]["id"] == "journal123"

    @pytest.mark.asyncio
    @patch("agent.tools.collections")
    async def test_read_journal_entry_recent_entries(self, mock_collections):
        """Test reading recent journal entries."""
        # Mock MongoDB response
        mock_journals = [
            {"_id": "journal1", "content": "Recent entry 1", "date": "2025-08-31", "space_id": "space123"},
            {"_id": "journal2", "content": "Recent entry 2", "date": "2025-08-30", "space_id": "space123"},
        ]

        # Mock the chained calls properly for motor (Motor returns cursors from find, not async methods)
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = mock_cursor
        mock_cursor.limit.return_value = mock_cursor
        mock_cursor.to_list = AsyncMock(return_value=mock_journals)
        mock_collections.journals.find.return_value = mock_cursor

        request = JournalReadRequest(limit=2)
        result = await read_journal_entry(request, "6843a5933e5a5d8cf5b169f8", "space123")

        assert result["ok"] is True
        assert len(result["entries"]) == 2
        assert result["count"] == 2
        assert result["entries"][0]["content"] == "Recent entry 1"

    @pytest.mark.asyncio
    @patch("agent.tools.collections")
    async def test_read_journal_entry_not_found(self, mock_collections):
        """Test reading journal entry when none exists."""
        mock_collections.journals.find_one = AsyncMock(return_value=None)

        request = JournalReadRequest(date="2025-08-31")
        result = await read_journal_entry(request, "6843a5933e5a5d8cf5b169f8")

        assert result["ok"] is True
        assert result["entry"] is None
        assert "No journal entry found" in result["message"]

    @pytest.mark.asyncio
    @patch("agent.tools.collections")
    async def test_read_journal_entry_database_error(self, mock_collections):
        """Test read journal entry database error handling."""
        mock_collections.journals.find_one = AsyncMock(side_effect=Exception("Database error"))

        request = JournalReadRequest(date="2025-08-31")
        result = await read_journal_entry(request, "user123")

        assert result["ok"] is False
        assert "Failed to read journal entries" in result["error"]


class TestAgentStreaming:
    """Tests for the streaming agent functionality."""

    def test_format_sse_message(self):
        """Test SSE message formatting."""
        result = format_sse_message("test_event", {"key": "value"})
        expected = 'event: test_event\ndata: {"key": "value"}\n\n'
        assert result == expected

    @pytest.mark.asyncio
    async def test_stream_agent_response_no_api_key(self):
        """Test streaming with no OpenAI API key."""
        with patch.dict(os.environ, {}, clear=True):
            stream = stream_agent_response("test query", "user_123", "space_123")
            messages = []
            async for message in stream:
                messages.append(message)

            assert len(messages) == 1
            assert "error" in messages[0]
            assert "OpenAI API key not configured" in messages[0]

    @pytest.mark.asyncio
    @patch("agent.agent.AsyncOpenAI")
    async def test_stream_agent_response_success(self, mock_openai_class):
        """Test successful streaming response with tool calls."""
        # Mock OpenAI client and response
        mock_client = AsyncMock()
        mock_openai_class.return_value = mock_client

        # Mock streaming response chunks
        mock_chunk1 = MagicMock()
        mock_chunk1.choices = [MagicMock()]
        mock_chunk1.choices[0].delta.content = "The weather in New York is "
        mock_chunk1.choices[0].delta.tool_calls = None
        mock_chunk1.choices[0].finish_reason = None

        mock_chunk2 = MagicMock()
        mock_chunk2.choices = [MagicMock()]
        mock_chunk2.choices[0].delta.content = None
        mock_chunk2.choices[0].delta.tool_calls = [MagicMock()]
        mock_chunk2.choices[0].delta.tool_calls[0].index = 0
        mock_chunk2.choices[0].delta.tool_calls[0].function = MagicMock()
        mock_chunk2.choices[0].delta.tool_calls[0].function.name = "get_current_weather"
        mock_chunk2.choices[0].delta.tool_calls[0].function.arguments = '{"location": "New York"}'
        mock_chunk2.choices[0].finish_reason = None

        mock_chunk3 = MagicMock()
        mock_chunk3.choices = [MagicMock()]
        mock_chunk3.choices[0].delta.content = None
        mock_chunk3.choices[0].delta.tool_calls = None
        mock_chunk3.choices[0].finish_reason = "stop"

        # Set up async iteration
        mock_stream = AsyncMock()
        mock_stream.__aiter__.return_value = [mock_chunk1, mock_chunk2, mock_chunk3]
        mock_client.chat.completions.create.return_value = mock_stream

        # Set environment variable
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            stream = stream_agent_response("What's the weather in New York?", "user_123", "space_123")
            messages = []
            async for message in stream:
                messages.append(message)

        # Verify message sequence
        assert len(messages) >= 3
        assert "ready" in messages[0]
        assert "token" in messages[1]
        assert "tool_result" in messages[2] or "done" in messages[2]

    @pytest.mark.asyncio
    @patch("agent.agent.AsyncOpenAI")
    async def test_stream_agent_response_openai_error(self, mock_openai_class):
        """Test streaming with OpenAI API error."""
        mock_client = AsyncMock()
        mock_client.chat.completions.create.side_effect = Exception("OpenAI API Error")
        mock_openai_class.return_value = mock_client

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            stream = stream_agent_response("test query", "user_123", "space_123")
            messages = []
            async for message in stream:
                messages.append(message)

        # Should have ready event and error event
        assert len(messages) >= 2
        assert "ready" in messages[0]
        assert "error" in messages[-1]
        assert "OpenAI API Error" in messages[-1]


class TestAgentConversationState:
    """Tests for maintaining conversation state between requests."""

    @pytest.mark.asyncio
    @patch("agent.agent.AsyncOpenAI")
    async def test_conversation_state_persists(self, mock_openai_class):
        from agent.agent import conversation_state
        from chats import chats_collection

        conversation_state.clear()
        await chats_collection.delete_many({})

        mock_client = AsyncMock()
        mock_openai_class.return_value = mock_client

        # First call: produce a tool call
        chunk1 = MagicMock()
        chunk1.choices = [MagicMock()]
        chunk1.choices[0].delta.content = "The weather in New York is "
        chunk1.choices[0].delta.tool_calls = None
        chunk1.choices[0].finish_reason = None

        chunk2 = MagicMock()
        chunk2.choices = [MagicMock()]
        chunk2.choices[0].delta.content = None
        chunk2.choices[0].delta.tool_calls = [MagicMock()]
        chunk2.choices[0].delta.tool_calls[0].index = 0
        chunk2.choices[0].delta.tool_calls[0].function = MagicMock()
        chunk2.choices[0].delta.tool_calls[0].function.name = "get_current_weather"
        chunk2.choices[0].delta.tool_calls[0].function.arguments = '{"location": "New York"}'
        chunk2.choices[0].finish_reason = "stop"

        stream1 = AsyncMock()
        stream1.__aiter__.return_value = [chunk1, chunk2]

        # Second call: simple response
        chunk3 = MagicMock()
        chunk3.choices = [MagicMock()]
        chunk3.choices[0].delta.content = "You're welcome"
        chunk3.choices[0].delta.tool_calls = None
        chunk3.choices[0].finish_reason = "stop"

        stream2 = AsyncMock()
        stream2.__aiter__.return_value = [chunk3]

        mock_client.chat.completions.create.side_effect = [stream1, stream2, stream2]

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            async for _ in stream_agent_response("What's the weather in New York?", "user1", None):
                pass

            msgs = await chats_collection.find({"user_id": "user1"}).to_list(None)
            assert len(msgs) == 2
            assert msgs[0]["role"] == "user"
            assert msgs[1]["role"] == "assistant"

            conversation_state.clear()

            async for _ in stream_agent_response("Thanks", "user1", None):
                pass

        # Second call should include previous interaction loaded from DB
        second_call = mock_client.chat.completions.create.call_args_list[2]
        messages = second_call.kwargs["messages"]
        assert {"role": "user", "content": "What's the weather in New York?"} in messages


class TestAgentIntegration:
    """Integration tests with FastAPI app."""

    @pytest.mark.asyncio
    async def test_agent_router_registration(self, client):
        """Test that agent router is properly registered."""
        # Test that the agent endpoint exists
        response = await client.get("/agent/stream")
        # Should get 401 for missing auth header, not 404 for missing route
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_agent_endpoint_no_auth(self, client):
        """Test agent endpoint without authentication."""
        response = await client.get("/agent/stream?q=test")
        assert response.status_code == 401  # Missing auth header

    @pytest.mark.asyncio
    async def test_agent_endpoint_invalid_auth(self, client):
        """Test agent endpoint with invalid token."""
        headers = {"Authorization": "Bearer invalid-token"}
        response = await client.get("/agent/stream?q=test", headers=headers)
        assert response.status_code == 401  # Invalid token

    @pytest.mark.asyncio
    async def test_agent_endpoint_with_auth(self, client, test_email):
        """Test agent endpoint with valid authentication."""
        # Get valid token
        token = await get_token(client, test_email)

        # Mock OpenAI to avoid real API calls
        with patch("agent.agent.AsyncOpenAI") as mock_openai_class:
            mock_client = AsyncMock()
            mock_openai_class.return_value = mock_client

            # Mock simple text response (no tools)
            mock_chunk = MagicMock()
            mock_chunk.choices = [MagicMock()]
            mock_chunk.choices[0].delta.content = "Hello, how can I help?"
            mock_chunk.choices[0].delta.tool_calls = None
            mock_chunk.choices[0].finish_reason = "stop"

            mock_stream = AsyncMock()
            mock_stream.__aiter__.return_value = [mock_chunk]
            mock_client.chat.completions.create.return_value = mock_stream

            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
                # Agent endpoint expects token in Authorization header
                headers = {"Authorization": f"Bearer {token}"}
                response = await client.get("/agent/stream?q=hello", headers=headers)

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/event-stream; charset=utf-8"

    @pytest.mark.asyncio
    async def test_agent_endpoint_with_space_id(self, client, test_email):
        """Test agent endpoint with space context."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}

        # Create a space first
        space_response = await client.post("/spaces", headers=headers, json={"name": "Test Space"})
        assert space_response.status_code == 200
        space_data = space_response.json()
        space_id = space_data.get("_id") or space_data.get("id")

        with patch("agent.agent.AsyncOpenAI") as mock_openai_class:
            mock_client = AsyncMock()
            mock_openai_class.return_value = mock_client

            mock_chunk = MagicMock()
            mock_chunk.choices = [MagicMock()]
            mock_chunk.choices[0].delta.content = "Working in your test space"
            mock_chunk.choices[0].delta.tool_calls = None
            mock_chunk.choices[0].finish_reason = "stop"

            mock_stream = AsyncMock()
            mock_stream.__aiter__.return_value = [mock_chunk]
            mock_client.chat.completions.create.return_value = mock_stream

            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
                # Agent endpoint expects token in Authorization header
                headers = {"Authorization": f"Bearer {token}"}
                response = await client.get(f"/agent/stream?q=help&space_id={space_id}", headers=headers)

        assert response.status_code == 200


class TestAgentSchemas:
    """Tests for Pydantic schemas and OpenAI function schemas."""

    def test_weather_current_request_validation(self):
        """Test weather request validation."""
        # Valid request
        request = WeatherCurrentRequest(location="Tokyo")
        assert request.location == "Tokyo"
        assert request.units == "imperial"  # default

        # Invalid units
        with pytest.raises(Exception):
            WeatherCurrentRequest(location="Tokyo", units="invalid")

    def test_task_add_request_validation(self):
        """Test task creation request validation."""
        # Valid request
        request = TaskAddRequest(text="Test task")
        assert request.text == "Test task"
        assert request.priority == "med"  # default

        # Invalid priority
        with pytest.raises(Exception):
            TaskAddRequest(text="Test task", priority="invalid")

        # Empty text
        with pytest.raises(Exception):
            TaskAddRequest(text="")

    def test_search_request_validation(self):
        """Test search request validation."""
        # Valid request
        request = SearchRequest(query="test", limit=5)
        assert request.query == "test"
        assert request.limit == 5

        # Limit too high
        with pytest.raises(Exception):
            SearchRequest(query="test", limit=100)

    def test_openai_tool_schemas(self):
        """Test OpenAI function schema generation."""
        assert "get_current_weather" in OPENAI_TOOL_SCHEMAS
        assert "add_task" in OPENAI_TOOL_SCHEMAS
        assert "list_tasks" in OPENAI_TOOL_SCHEMAS

        # Check schema structure
        weather_schema = OPENAI_TOOL_SCHEMAS["get_current_weather"]
        assert weather_schema["name"] == "get_current_weather"
        assert "description" in weather_schema
        assert "parameters" in weather_schema
        assert weather_schema["parameters"]["type"] == "object"
        assert "location" in weather_schema["parameters"]["properties"]


class TestAgentSystemPrompt:
    """Test agent system prompt and configuration."""

    def test_agent_system_prompt_content(self):
        """Test system prompt contains expected guidance."""
        assert "AI assistant with access to tools" in AGENT_SYSTEM_PROMPT
        assert "get_current_weather" in AGENT_SYSTEM_PROMPT
        assert "add_task" in AGENT_SYSTEM_PROMPT
        assert "get_inspirational_quotes" in AGENT_SYSTEM_PROMPT
        assert "IMMEDIATELY call" in AGENT_SYSTEM_PROMPT
        assert "human-readable summary" in AGENT_SYSTEM_PROMPT

    def test_available_tools_registry(self):
        """Test tool registry completeness."""
        expected_tools = {
            "get_current_weather",
            "get_weather_forecast",
            "get_weather_alerts",
            "add_task",
            "list_tasks",
            "update_task",
            "add_journal_entry",
            "read_journal_entry",
            "search_content",
            "get_book_recommendations",
            "get_inspirational_quotes",
        }

        assert set(AVAILABLE_TOOLS.keys()) == expected_tools

        # Verify each tool has required fields
        for tool_name, tool_info in AVAILABLE_TOOLS.items():
            assert "func" in tool_info
            assert "description" in tool_info
            assert "schema" in tool_info
            assert callable(tool_info["func"])


class TestAgentErrorHandling:
    """Test error handling in agent tools."""

    @pytest.mark.asyncio
    @patch("agent.tools.db_create_todo")
    async def test_add_task_database_error(self, mock_create_todo):
        """Test task creation with database error."""
        mock_create_todo.side_effect = Exception("Database connection failed")

        request = TaskAddRequest(text="Test task")
        result = await add_task(request, "test_user", "test_space")

        assert result["ok"] is False
        assert "Database connection failed" in result["error"]

    @pytest.mark.asyncio
    @patch("agent.tools.get_todos")
    async def test_list_tasks_database_error(self, mock_get_todos):
        """Test task listing with database error."""
        mock_get_todos.side_effect = Exception("Query failed")

        request = TaskListRequest()
        result = await list_tasks(request, "test_user", "test_space")

        assert result["ok"] is False
        assert "Query failed" in result["error"]

    @pytest.mark.asyncio
    @patch("agent.tools.update_todo_fields")
    async def test_update_task_not_found(self, mock_update_todo_fields):
        """Test task update with task not found."""
        from fastapi import HTTPException

        mock_update_todo_fields.side_effect = HTTPException(status_code=404, detail="Todo not found")

        request = TaskUpdateRequest(id="nonexistent_id", completed=True)
        result = await update_task(request, "test_user", "test_space")

        assert result["ok"] is False
        # Error message will be wrapped in "Failed to update task: ..."
        assert "404" in result["error"] or "not found" in result["error"].lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
