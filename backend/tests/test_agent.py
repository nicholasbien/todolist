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
    MAX_TASK_TITLE_LENGTH,
    _prepare_task_title_and_notes,
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

from .conftest import get_token


class TestAgentToolsUnit:
    """Unit tests for individual agent tools."""

    @pytest.mark.asyncio
    @patch("agent.tools.httpx.AsyncClient")
    async def test_get_current_weather_known_location(self, mock_client_class):
        """Test weather for known location via OpenWeatherMap API."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "name": "New York",
            "sys": {"country": "US"},
            "main": {"temp": 72, "humidity": 65},
            "weather": [{"description": "partly cloudy", "main": "Clouds"}],
            "wind": {"speed": 8},
        }
        mock_response.raise_for_status.return_value = None
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client_class.return_value.__aenter__.return_value = mock_client

        with patch.dict(os.environ, {"OPENWEATHER_API_KEY": "test-key"}):
            request = WeatherCurrentRequest(location="New York")
            result = await get_current_weather(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["weather"]["location"] == "New York, US"
        assert result["weather"]["temperature"] == 72
        assert "°F" in result["weather"]["temperature_display"]
        assert "mph" in result["weather"]["wind_speed_display"]

    @pytest.mark.asyncio
    async def test_get_current_weather_no_api_key(self):
        """Test weather returns error when API key is not configured."""
        with patch.dict(os.environ, {}, clear=True):
            request = WeatherCurrentRequest(location="UnknownCity")
            result = await get_current_weather(request, "test_user", "test_space")

        assert result["ok"] is False
        assert "not configured" in result["error"]

    @pytest.mark.asyncio
    @patch("agent.tools.httpx.AsyncClient")
    async def test_get_current_weather_metric_units(self, mock_client_class):
        """Test weather with metric units."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "name": "New York",
            "sys": {"country": "US"},
            "main": {"temp": 22, "humidity": 65},
            "weather": [{"description": "partly cloudy", "main": "Clouds"}],
            "wind": {"speed": 3},
        }
        mock_response.raise_for_status.return_value = None
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client_class.return_value.__aenter__.return_value = mock_client

        with patch.dict(os.environ, {"OPENWEATHER_API_KEY": "test-key"}):
            request = WeatherCurrentRequest(location="New York", units="metric")
            result = await get_current_weather(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["weather"]["temperature"] == 22
        assert "°C" in result["weather"]["temperature_display"]
        assert "m/s" in result["weather"]["wind_speed_display"]

    @pytest.mark.asyncio
    @patch("agent.tools.httpx.AsyncClient")
    async def test_get_weather_forecast(self, mock_client_class):
        """Test weather forecast from OpenWeatherMap API."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "city": {"name": "London", "country": "GB"},
            "list": [
                {
                    "dt": 1700000000,
                    "main": {"temp": 50, "humidity": 80},
                    "weather": [{"description": "light rain", "main": "Rain"}],
                    "wind": {"speed": 12},
                },
                {
                    "dt": 1700100000,
                    "main": {"temp": 52, "humidity": 75},
                    "weather": [{"description": "cloudy", "main": "Clouds"}],
                    "wind": {"speed": 10},
                },
                {
                    "dt": 1700200000,
                    "main": {"temp": 48, "humidity": 85},
                    "weather": [{"description": "drizzle", "main": "Drizzle"}],
                    "wind": {"speed": 8},
                },
            ],
        }
        mock_response.raise_for_status.return_value = None
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client_class.return_value.__aenter__.return_value = mock_client

        with patch.dict(os.environ, {"OPENWEATHER_API_KEY": "test-key"}):
            request = WeatherForecastRequest(location="London", days=3)
            result = await get_weather_forecast(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["forecast"]["location"] == "London, GB"
        assert len(result["forecast"]["forecast"]) == 3

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
    async def test_get_inspirational_quotes_api_failure(self, mock_get):
        """Test inspirational quotes returns error when API call fails."""
        request = InspirationalQuoteRequest(goal="resilience", limit=2)
        result = await get_inspirational_quotes(request, "test_user", "test_space")

        assert result["ok"] is False
        assert "Unable to fetch quotes" in result["error"]

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
            "notes": None,
        }
        mock_create_todo.return_value = mock_todo

        request = TaskAddRequest(text="Test task", category="Work", priority="high")
        result = await add_task(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["id"] == "test_id_123"
        assert result["task"]["text"] == "Test task"
        assert result["task"]["category"] == "Work"
        assert result["task"]["priority"] == "high"
        assert result["task"]["notes"] is None

    @pytest.mark.asyncio
    @patch("agent.tools.db_create_todo", new_callable=AsyncMock)
    async def test_add_task_long_text_moves_details_to_notes(self, mock_create_todo):
        """Ensure long task descriptions are shortened with details captured in notes."""

        long_text = (
            "Prepare quarterly strategy update for leadership including roadmap, dependencies, key metrics, "
            "and hiring needs overview."
        )

        expected_title, expected_notes = _prepare_task_title_and_notes(long_text, None)

        mock_todo = MagicMock()
        mock_todo.dict.return_value = {
            "_id": "long_task_id",
            "text": expected_title,
            "category": "General",
            "priority": "Medium",
            "completed": False,
            "dateAdded": "2024-08-30T10:00:00",
            "space_id": "test_space",
            "user_id": "test_user",
            "notes": expected_notes,
        }
        mock_create_todo.return_value = mock_todo

        request = TaskAddRequest(text=long_text, category="General")
        result = await add_task(request, "test_user", "test_space")

        called_todo = mock_create_todo.await_args[0][0]
        assert called_todo.text == expected_title
        assert called_todo.notes == expected_notes
        assert len(expected_title) <= MAX_TASK_TITLE_LENGTH + 1  # Allow for ellipsis

        assert result["ok"] is True
        assert result["task"]["text"] == expected_title
        assert result["task"]["notes"] == expected_notes

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
            return_value=[{"_id": "journal_123", "text": "Met with team about important project"}]
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
        """Test successful book recommendations via Subject API."""
        # Mock the Subject API response format
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "works": [
                {"title": "Test Book 1", "authors": [{"name": "Author 1"}], "first_publish_year": 2020},
                {"title": "Test Book 2", "authors": [{"name": "Author 2"}], "first_publish_year": 2021},
            ]
        }
        mock_response.raise_for_status.return_value = None

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client_class.return_value.__aenter__.return_value = mock_client

        # subject param uses the Subject API
        request = BookRecommendationRequest(subject="productivity", limit=2)
        result = await get_book_recommendations(request, "user123")

        # Verify results
        assert result["ok"] is True
        assert len(result["books"]) == 2
        assert result["books"][0]["title"] == "Test Book 1"
        assert result["books"][0]["author_name"] == ["Author 1"]
        assert result["books"][0]["year"] == 2020
        assert result["api_used"] == "subject"

        # Verify Subject API was called
        mock_client.get.assert_called_once_with(
            "https://openlibrary.org/subjects/productivity.json", params={"limit": 2}
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
        # Mock MongoDB response (DB uses 'text' field, not 'content')
        mock_journal = {
            "_id": "journal123",
            "text": "Today was a productive day",
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
            {"_id": "journal1", "text": "Recent entry 1", "date": "2025-08-31", "space_id": "space123"},
            {"_id": "journal2", "text": "Recent entry 2", "date": "2025-08-30", "space_id": "space123"},
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
    @patch("agent.agent.save_chat_message", new_callable=AsyncMock)
    @patch("agent.agent.get_chat_history", new_callable=AsyncMock, return_value=[])
    @patch("categories.get_categories", new_callable=AsyncMock, return_value=["General"])
    @patch("agent.agent.connect_to_mcp_server", new_callable=AsyncMock, return_value=None)
    @patch("agent.agent.AsyncOpenAI")
    async def test_stream_agent_response_success(
        self, mock_openai_class, _mock_mcp, _mock_cats, _mock_history, _mock_save
    ):
        """Test successful streaming response with text output."""
        mock_client = AsyncMock()
        mock_openai_class.return_value = mock_client

        # Mock Responses API streaming events
        text_event = MagicMock()
        text_event.type = "response.output_text.delta"
        text_event.delta = "Hello world"

        completed_event = MagicMock()
        completed_event.type = "response.completed"
        completed_event.response.usage.input_tokens = 10
        completed_event.response.usage.output_tokens = 5
        completed_event.response.usage.total_tokens = 15

        mock_stream = AsyncMock()
        mock_stream.__aiter__.return_value = [text_event, completed_event]
        mock_client.responses.create = AsyncMock(return_value=mock_stream)

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            stream = stream_agent_response("Hello", "user_123", "space_123")
            messages = []
            async for message in stream:
                messages.append(message)

        # Should have ready, token, and done events
        assert len(messages) >= 3
        assert "ready" in messages[0]
        assert "token" in messages[1]
        assert "done" in messages[-1]

    @pytest.mark.asyncio
    @patch("agent.agent.get_chat_history", new_callable=AsyncMock, return_value=[])
    @patch("categories.get_categories", new_callable=AsyncMock, return_value=["General"])
    @patch("agent.agent.connect_to_mcp_server", new_callable=AsyncMock, return_value=None)
    @patch("agent.agent.AsyncOpenAI")
    async def test_stream_agent_response_openai_error(self, mock_openai_class, _mock_mcp, _mock_cats, _mock_history):
        """Test streaming with OpenAI API error."""
        mock_client = AsyncMock()
        mock_client.responses.create = AsyncMock(side_effect=Exception("OpenAI API Error"))
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

            # Mock Responses API streaming events
            text_event = MagicMock()
            text_event.type = "response.output_text.delta"
            text_event.delta = "Hello, how can I help?"

            completed_event = MagicMock()
            completed_event.type = "response.completed"
            completed_event.response.usage.input_tokens = 10
            completed_event.response.usage.output_tokens = 5
            completed_event.response.usage.total_tokens = 15

            mock_stream = AsyncMock()
            mock_stream.__aiter__.return_value = [text_event, completed_event]
            mock_client.responses.create = AsyncMock(return_value=mock_stream)

            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
                # Agent endpoint expects token in Authorization header
                headers = {"Authorization": f"Bearer {token}"}
                response = await client.get("/agent/stream?q=hello", headers=headers)

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/event-stream; charset=utf-8"

    @pytest.mark.asyncio
    async def test_agent_endpoint_with_query_param_token(self, client, test_email):
        """Test agent endpoint with token in query parameter (for EventSource/Capacitor compatibility)."""
        # Get valid token
        token = await get_token(client, test_email)

        # Mock OpenAI to avoid real API calls
        with patch("agent.agent.AsyncOpenAI") as mock_openai_class:
            mock_client = AsyncMock()
            mock_openai_class.return_value = mock_client

            # Mock Responses API streaming events
            text_event = MagicMock()
            text_event.type = "response.output_text.delta"
            text_event.delta = "Hello, how can I help?"

            completed_event = MagicMock()
            completed_event.type = "response.completed"
            completed_event.response.usage.input_tokens = 10
            completed_event.response.usage.output_tokens = 5
            completed_event.response.usage.total_tokens = 15

            mock_stream = AsyncMock()
            mock_stream.__aiter__.return_value = [text_event, completed_event]
            mock_client.responses.create = AsyncMock(return_value=mock_stream)

            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
                # EventSource can't set custom headers, so token must be in query param
                response = await client.get(f"/agent/stream?q=hello&token={token}")

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

            text_event = MagicMock()
            text_event.type = "response.output_text.delta"
            text_event.delta = "Working in your test space"

            completed_event = MagicMock()
            completed_event.type = "response.completed"
            completed_event.response.usage.input_tokens = 10
            completed_event.response.usage.output_tokens = 5
            completed_event.response.usage.total_tokens = 15

            mock_stream = AsyncMock()
            mock_stream.__aiter__.return_value = [text_event, completed_event]
            mock_client.responses.create = AsyncMock(return_value=mock_stream)

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
        # Valid request (category is now required)
        request = TaskAddRequest(text="Test task", category="General")
        assert request.text == "Test task"
        assert request.priority == "medium"  # default

        # Invalid priority
        with pytest.raises(Exception):
            TaskAddRequest(text="Test task", category="General", priority="invalid")

        # Empty text
        with pytest.raises(Exception):
            TaskAddRequest(text="", category="General")

        # Missing category
        with pytest.raises(Exception):
            TaskAddRequest(text="Test task")

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
        assert "Always use tools when they can help" in AGENT_SYSTEM_PROMPT
        assert "concise, well-formatted summary" in AGENT_SYSTEM_PROMPT

    def test_available_tools_registry(self):
        """Test tool registry completeness."""
        expected_tools = {
            "get_current_weather",
            "get_weather_forecast",
            "add_task",
            "list_tasks",
            "update_task",
            "add_journal_entry",
            "read_journal_entry",
            "search_content",
            "get_book_recommendations",
            "get_inspirational_quotes",
            "web_search",
            "send_email_to_user",
            "web_scraping",
        }

        assert set(AVAILABLE_TOOLS.keys()) == expected_tools

        # Verify each tool has required fields
        for tool_name, tool_info in AVAILABLE_TOOLS.items():
            assert "func" in tool_info
            assert "description" in tool_info
            assert "schema" in tool_info
            assert callable(tool_info["func"])

    @pytest.mark.asyncio
    @patch("categories.get_categories", new_callable=AsyncMock)
    @patch("db.collections")
    async def test_agent_context_includes_date_space_categories(self, mock_collections, mock_get_categories):
        """Test that agent context includes current date, space name, and categories."""
        from datetime import datetime

        # Mock space lookup
        mock_space_doc = {"_id": "space123", "name": "Work"}
        mock_collections.spaces.find_one = AsyncMock(return_value=mock_space_doc)

        # Mock categories
        mock_get_categories.return_value = ["Work", "Personal", "Health"]

        # Mock OpenAI to capture the developer instructions
        captured_instructions = None

        async def mock_create(**kwargs):
            nonlocal captured_instructions
            # Capture the instructions parameter
            captured_instructions = kwargs.get("instructions")

            # Return a mock stream
            mock_event = MagicMock()
            mock_event.type = "response.output_text.done"
            mock_stream = AsyncMock()
            mock_stream.__aiter__.return_value = [mock_event]
            return mock_stream

        with patch("agent.agent.AsyncOpenAI") as mock_openai_class:
            mock_client = AsyncMock()
            mock_client.responses.create = mock_create
            mock_openai_class.return_value = mock_client

            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
                stream = stream_agent_response("test query", "user123", "space123")
                async for _ in stream:
                    pass

        # Verify instructions were captured
        assert captured_instructions is not None

        # Verify date is included
        current_date = datetime.now().strftime("%A, %B %d, %Y")
        assert f"Today's date: {current_date}" in captured_instructions

        # Verify space context is included (defaults to "Default" when no space_id lookup succeeds)
        assert 'in their "Default" space' in captured_instructions or 'in their "Work" space' in captured_instructions

        # Verify categories are included
        assert "Work, Personal, Health" in captured_instructions
        assert 'choose a category from this list, or use "General"' in captured_instructions


class TestAgentErrorHandling:
    """Test error handling in agent tools."""

    @pytest.mark.asyncio
    @patch("agent.tools.db_create_todo")
    async def test_add_task_database_error(self, mock_create_todo):
        """Test task creation with database error."""
        mock_create_todo.side_effect = Exception("Database connection failed")

        request = TaskAddRequest(text="Test task", category="General")
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
