#!/usr/bin/env python3
"""
Comprehensive tests for the Python backend agent system.
Tests all tools, streaming functionality, and edge cases.
"""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from agent.agent import AGENT_SYSTEM_PROMPT, format_sse_message, stream_agent_response
from agent.schemas import (
    OPENAI_TOOL_SCHEMAS,
    JournalAddRequest,
    SearchRequest,
    TaskAddRequest,
    TaskListRequest,
    TaskUpdateRequest,
    WeatherAlertsRequest,
    WeatherCurrentRequest,
    WeatherForecastRequest,
)
from agent.tools import (
    AVAILABLE_TOOLS,
    add_journal_entry,
    add_task,
    get_current_weather,
    get_weather_alerts,
    get_weather_forecast,
    list_tasks,
    search_content,
    update_task,
)

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
    async def test_get_weather_alerts(self):
        """Test weather alerts (mock implementation)."""
        request = WeatherAlertsRequest(location="TestCity")
        result = await get_weather_alerts(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["location"] == "TestCity"
        assert "No active weather alerts" in result["alerts"][0]

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
    @patch("agent.tools.db_create_journal_entry")
    async def test_add_journal_entry(self, mock_create_journal):
        """Test journal entry creation."""
        # Mock JournalEntry object that create_journal_entry returns
        mock_entry = MagicMock()
        mock_entry.id = "journal_123"
        mock_entry.text = "Test journal entry"
        mock_entry.date = "2024-08-30"
        mock_entry.space_id = "test_space"
        mock_entry.user_id = "test_user"

        mock_create_journal.return_value = mock_entry

        request = JournalAddRequest(content="Test journal entry", date="2024-08-30")
        result = await add_journal_entry(request, "test_user", "test_space")

        assert result["ok"] is True
        assert result["id"] == "journal_123"
        assert result["journal"]["content"] == "Test journal entry"
        assert result["journal"]["date"] == "2024-08-30"

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
        assert "IMMEDIATELY call" in AGENT_SYSTEM_PROMPT

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
            "search_content",
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
