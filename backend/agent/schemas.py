"""
Pydantic schemas for agent tool validation and OpenAI function calling.
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class WeatherCurrentRequest(BaseModel):
    location: str = Field(..., description="City name (e.g., 'Tokyo', 'New York')")
    units: Literal["metric", "imperial", "kelvin"] = Field(default="imperial", description="Temperature units")


class WeatherForecastRequest(BaseModel):
    location: str = Field(..., description="City name")
    days: int = Field(default=3, ge=1, le=5, description="Number of forecast days (1-5)")
    units: Literal["metric", "imperial", "kelvin"] = Field(default="imperial", description="Temperature units")


class WeatherAlertsRequest(BaseModel):
    location: str = Field(..., description="City name or coordinates")


class TaskAddRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Task description")
    category: Optional[str] = Field(None, description="Task category (optional)")
    priority: Literal["low", "med", "high"] = Field(default="med", description="Task priority")


class TaskUpdateRequest(BaseModel):
    id: str = Field(..., min_length=1, description="Task ID to update")
    completed: Optional[bool] = Field(None, description="Mark as completed/incomplete")
    text: Optional[str] = Field(None, description="New task text (optional)")
    priority: Optional[Literal["low", "med", "high"]] = Field(None, description="New priority (optional)")


class TaskListRequest(BaseModel):
    completed: Optional[bool] = Field(None, description="Filter by completion status (optional)")


class JournalAddRequest(BaseModel):
    content: str = Field(..., min_length=1, description="Journal entry content")
    date: Optional[str] = Field(None, description="Date in YYYY-MM-DD format (optional, defaults to today)")


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query")
    types: Optional[List[Literal["task", "journal"]]] = Field(None, description="Types to search (optional)")
    limit: int = Field(default=8, ge=1, le=50, description="Maximum results")


class BookRecommendationRequest(BaseModel):
    subject: str = Field(..., description="Book subject or genre")
    limit: int = Field(default=5, ge=1, le=20, description="Number of books to return")


class InspirationalQuoteRequest(BaseModel):
    goal: Literal["productivity", "self-care", "resilience"] = Field(..., description="User's current focus area")
    limit: int = Field(default=1, ge=1, le=5, description="Number of quotes to return")


# OpenAI function schema generators
def get_openai_tool_schema(model_class: BaseModel) -> dict:
    """Convert Pydantic model to OpenAI function schema format."""
    schema = model_class.model_json_schema()

    # Remove title and other metadata that OpenAI doesn't need
    if "title" in schema:
        del schema["title"]

    # Ensure required fields are properly formatted
    required = schema.get("required", [])
    properties = schema.get("properties", {})

    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


# Tool schema mapping for OpenAI
OPENAI_TOOL_SCHEMAS = {
    "get_current_weather": {
        "name": "get_current_weather",
        "description": "Get current weather conditions for a specific location. Call when user asks about current weather, temperature, or 'what's the weather like' in any location.",  # noqa: E501
        "parameters": get_openai_tool_schema(WeatherCurrentRequest),
    },
    "get_weather_forecast": {
        "name": "get_weather_forecast",
        "description": "Get multi-day weather forecast for a location. Call when user asks for weather predictions, forecast, or 'weather this week'.",  # noqa: E501
        "parameters": get_openai_tool_schema(WeatherForecastRequest),
    },
    "get_weather_alerts": {
        "name": "get_weather_alerts",
        "description": "Check for weather alerts in a specific location. Call when user asks about weather warnings, alerts, storms, or weather safety.",  # noqa: E501
        "parameters": get_openai_tool_schema(WeatherAlertsRequest),
    },
    "get_book_recommendations": {
        "name": "get_book_recommendations",
        "description": "Get book suggestions from Open Library based on subject or genre.",
        "parameters": get_openai_tool_schema(BookRecommendationRequest),
    },
    "get_inspirational_quotes": {
        "name": "get_inspirational_quotes",
        "description": (
            "Fetch motivational quotes or affirmations tailored to a goal. "
            "Call when user asks for inspiration, motivation, or positive affirmations."
        ),
        "parameters": get_openai_tool_schema(InspirationalQuoteRequest),
    },
    "add_task": {
        "name": "add_task",
        "description": "Add a new task to user's todo list. Call when user wants to add, create, or save a new task, todo, or reminder.",  # noqa: E501
        "parameters": get_openai_tool_schema(TaskAddRequest),
    },
    "list_tasks": {
        "name": "list_tasks",
        "description": "List tasks in the current space. Call when user asks to see, list, show, or view their tasks or todos.",  # noqa: E501
        "parameters": get_openai_tool_schema(TaskListRequest),
    },
    "update_task": {
        "name": "update_task",
        "description": "Update an existing task. Call when user wants to mark task complete, update task text, change priority, or modify existing tasks.",  # noqa: E501
        "parameters": get_openai_tool_schema(TaskUpdateRequest),
    },
    "add_journal_entry": {
        "name": "add_journal_entry",
        "description": "Create or update a journal entry. Call when user wants to add journal entry, diary entry, or save notes for a specific date.",  # noqa: E501
        "parameters": get_openai_tool_schema(JournalAddRequest),
    },
    "search_content": {
        "name": "search_content",
        "description": "Search through tasks and journal entries. Call when user wants to search through their tasks or journal entries for specific content.",  # noqa: E501
        "parameters": get_openai_tool_schema(SearchRequest),
    },
}
