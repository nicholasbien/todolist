"""Direct tool implementations for weather and task management.

Replaces the previous Node.js MCP server approach with direct Python functions.
"""

import os
import random
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import httpx

# Add parent directory to path for imports  # noqa: E402
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

# Backend imports  # noqa: E402
from bson import ObjectId  # noqa: E402
from db import collections  # noqa: E402
from journals import JournalEntry  # noqa: E402
from journals import create_journal_entry as db_create_journal_entry  # noqa: E402,E501
from todos import Todo  # noqa: E402
from todos import create_todo as db_create_todo  # noqa: E402,E501
from todos import get_todos, update_todo_fields  # noqa: E402

# Local imports  # noqa: E402
from .schemas import (  # noqa: E402
    BookRecommendationRequest,
    InspirationalQuoteRequest,
    JournalAddRequest,
    SearchRequest,
    TaskAddRequest,
    TaskListRequest,
    TaskUpdateRequest,
    WeatherAlertsRequest,
    WeatherCurrentRequest,
    WeatherForecastRequest,
)

# Mock weather data (can be replaced with real weather API)
MOCK_WEATHER_DATA = {
    "new york": {
        "location": "New York, NY",
        "temperature": 22,
        "description": "Partly cloudy",
        "humidity": 65,
        "wind_speed": 8,
        "condition": "partly_cloudy",
    },
    "london": {
        "location": "London, UK",
        "temperature": 15,
        "description": "Light rain",
        "humidity": 80,
        "wind_speed": 12,
        "condition": "rainy",
    },
    "tokyo": {
        "location": "Tokyo, Japan",
        "temperature": 28,
        "description": "Clear sky",
        "humidity": 55,
        "wind_speed": 5,
        "condition": "clear",
    },
    "san francisco": {
        "location": "San Francisco, CA",
        "temperature": 18,
        "description": "Foggy",
        "humidity": 85,
        "wind_speed": 6,
        "condition": "foggy",
    },
}

FALLBACK_QUOTES = {
    "productivity": [
        "Focus on being productive instead of busy. — Tim Ferriss",
        "The secret of getting ahead is getting started. — Mark Twain",
        "Your future is created by what you do today, not tomorrow. — Robert Kiyosaki",
    ],
    "self-care": [
        "Self-care is how you take your power back.",
        "You deserve the love you so freely give to others.",
        "Nurture yourself and your mind will flourish.",
    ],
    "resilience": [
        "Fall seven times, stand up eight. — Japanese Proverb",
        "The oak fought the wind and was broken, the willow bent when it must and survived. — Robert Jordan",
        "Hard times may have held you down, but they will not last forever.",
    ],
}


async def get_current_weather(
    request: WeatherCurrentRequest, user_id: str, space_id: Optional[str] = None
) -> Dict[str, Any]:
    """Get current weather for a location."""
    try:
        location_key = request.location.lower()
        weather_data = MOCK_WEATHER_DATA.get(location_key)

        if not weather_data:
            # Generate random data for unknown locations
            descriptions = ["Clear", "Partly cloudy", "Cloudy", "Light rain"]
            weather_data = {
                "location": request.location,
                "temperature": random.randint(5, 35),
                "description": random.choice(descriptions),
                "humidity": random.randint(40, 80),
                "wind_speed": random.randint(2, 15),
                "condition": "clear",
            }
        else:
            weather_data = weather_data.copy()
            weather_data["location"] = weather_data.get("location", request.location)

        # Convert temperature units (handle None/missing values)
        raw_temp = weather_data.get("temperature")
        if raw_temp is None:
            raise ValueError("Temperature data is missing")
        # Cast to int, handling various input types
        temp = int(float(str(raw_temp)))
        if request.units == "imperial":
            temp = round(temp * 9 / 5 + 32)
        elif request.units == "kelvin":
            temp = round(temp + 273.15)

        weather_data["temperature"] = temp

        # Format temperature display
        unit_symbol = "°F" if request.units == "imperial" else "°C" if request.units == "metric" else "K"
        weather_data["temperature_display"] = f"{temp}{unit_symbol}"

        # Format wind speed display (handle None/missing values)
        raw_wind_speed = weather_data.get("wind_speed")
        if raw_wind_speed is None:
            raise ValueError("Wind speed data is missing")
        # Cast to int, handling various input types
        wind_speed = int(float(str(raw_wind_speed)))
        if request.units == "imperial":
            weather_data["wind_speed_display"] = f"{round(wind_speed * 0.621371)} mph"
        else:
            weather_data["wind_speed_display"] = f"{wind_speed} km/h"

        return {"ok": True, "weather": weather_data}
    except Exception as e:
        return {"ok": False, "error": f"Failed to get weather for {request.location}: {str(e)}"}


async def get_weather_forecast(
    request: WeatherForecastRequest, user_id: str, space_id: Optional[str] = None
) -> Dict[str, Any]:
    """Get multi-day weather forecast."""
    try:
        # Get current weather as base
        current_request = WeatherCurrentRequest(location=request.location, units=request.units)
        current_result = await get_current_weather(current_request, user_id, space_id)

        if not current_result.get("ok"):
            return current_result

        current_weather = current_result["weather"]
        base_temp = current_weather["temperature"]

        # Generate forecast data
        forecast = []
        for i in range(request.days):
            date = datetime.now() + timedelta(days=i)

            temp_variation = random.randint(-5, 5)
            descriptions = ["Sunny", "Partly cloudy", "Cloudy", "Light rain", "Clear"]
            day_data = {
                "date": date.strftime("%Y-%m-%d"),
                "temperature": base_temp + temp_variation,
                "description": (current_weather["description"] if i == 0 else random.choice(descriptions)),
                "humidity": random.randint(40, 80),
                "wind_speed": random.randint(2, 15),
            }

            # Add display formats
            temp = day_data["temperature"]
            unit_symbol = "°F" if request.units == "imperial" else "°C" if request.units == "metric" else "K"
            day_data["temperature_display"] = f"{temp}{unit_symbol}"

            wind_speed = day_data["wind_speed"]
            if request.units == "imperial":
                day_data["wind_speed_display"] = f"{round(wind_speed * 0.621371)} mph"
            else:
                day_data["wind_speed_display"] = f"{wind_speed} km/h"

            forecast.append(day_data)

        result_data = {"location": current_weather["location"], "forecast": forecast}
        return {"ok": True, "forecast": result_data}
    except Exception as e:
        return {"ok": False, "error": f"Failed to get forecast for {request.location}: {str(e)}"}


async def get_weather_alerts(
    request: WeatherAlertsRequest, user_id: str, space_id: Optional[str] = None
) -> Dict[str, Any]:
    """Check for weather alerts in a location."""
    try:
        # Mock alerts - in production would query real weather alerts API
        alerts = [f"No active weather alerts for {request.location}"]

        return {"ok": True, "location": request.location, "alerts": alerts}
    except Exception as e:
        return {"ok": False, "error": f"Failed to get alerts for {request.location}: {str(e)}"}


async def get_book_recommendations(
    request: BookRecommendationRequest, user_id: str, space_id: Optional[str] = None
) -> Dict[str, Any]:
    """Fetch book recommendations from Open Library."""
    try:
        url = f"https://openlibrary.org/subjects/{request.subject}.json?limit={request.limit}"
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url)
            response.raise_for_status()
        data = response.json()
        books = []
        for work in data.get("works", [])[: request.limit]:
            author = None
            if work.get("authors"):
                author = work["authors"][0].get("name")
            books.append(
                {
                    "title": work.get("title"),
                    "author": author,
                    "year": work.get("first_publish_year"),
                }
            )
        return {"ok": True, "books": books}
    except Exception as e:
        return {"ok": False, "error": f"Failed to get recommendations: {str(e)}"}


async def get_inspirational_quotes(
    request: InspirationalQuoteRequest, user_id: str, space_id: Optional[str] = None
) -> Dict[str, Any]:
    """Fetch inspirational quotes or affirmations based on user's goal."""
    quotes = []
    url_map = {
        "productivity": "https://zenquotes.io/api/random",
        "self-care": "https://www.affirmations.dev/",
        "resilience": "https://www.affirmations.dev/",
    }

    for _ in range(request.limit):
        url = url_map.get(request.goal)
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    if request.goal == "productivity":
                        if isinstance(data, list) and data:
                            quote_text = data[0].get("q")
                            author = data[0].get("a")
                            if quote_text and author:
                                quotes.append(f"{quote_text} — {author}")
                                continue
                    else:
                        affirmation = data.get("affirmation")
                        if affirmation:
                            quotes.append(affirmation)
                            continue
        except Exception:
            pass

        quotes.append(random.choice(FALLBACK_QUOTES[request.goal]))

    return {"ok": True, "quotes": quotes}


async def add_task(request: TaskAddRequest, user_id: str, space_id: Optional[str] = None) -> Dict[str, Any]:
    """Add a new task to user's todo list."""
    try:
        # Create Todo object
        todo = Todo(
            text=request.text,
            category=request.category or "General",
            priority=request.priority or "Medium",
            user_id=user_id,
            space_id=space_id,
            dateAdded=datetime.utcnow().isoformat(),
        )

        created_todo = await db_create_todo(todo)

        # db_create_todo returns a Todo object, convert to dict
        created_task_dict = created_todo.dict(by_alias=True)

        return {
            "ok": True,
            "id": str(created_task_dict["_id"]),
            "task": {
                "_id": str(created_task_dict["_id"]),
                "text": created_task_dict["text"],
                "category": created_task_dict.get("category"),
                "priority": created_task_dict.get("priority"),
                "completed": created_task_dict.get("completed", False),
                "dateAdded": created_task_dict.get("dateAdded"),
                "space_id": created_task_dict.get("space_id"),
                "user_id": created_task_dict.get("user_id"),
            },
        }
    except Exception as e:
        return {"ok": False, "error": f"Failed to add task: {str(e)}"}


async def list_tasks(request: TaskListRequest, user_id: str, space_id: Optional[str] = None) -> Dict[str, Any]:
    """List tasks in the current space."""
    try:
        # Use existing backend function
        tasks = await get_todos(user_id=user_id, space_id=space_id)

        # Convert Todo objects to dictionaries and filter by completion
        tasks_list = []
        for task in tasks:
            # Convert Todo object to dict if needed
            if hasattr(task, "dict"):
                task_dict = task.dict(by_alias=True)
            elif hasattr(task, "__dict__"):
                task_dict = task.__dict__
            else:
                task_dict = dict(task)

            # Filter by completion status if specified
            task_completed = task_dict.get("completed", False)
            if request.completed is not None and task_completed != request.completed:
                continue

            # Ensure _id is a string
            if "_id" in task_dict:
                task_dict["_id"] = str(task_dict["_id"])

            tasks_list.append(task_dict)

        return {"ok": True, "tasks": tasks_list}
    except Exception as e:
        return {"ok": False, "error": f"Failed to list tasks: {str(e)}"}


async def update_task(request: TaskUpdateRequest, user_id: str, space_id: Optional[str] = None) -> Dict[str, Any]:
    """Update an existing task."""
    try:
        # Prepare update data
        update_data: Dict[str, Any] = {}
        if request.completed is not None:
            update_data["completed"] = request.completed
            if request.completed:
                update_data["dateCompleted"] = datetime.utcnow().isoformat()
            else:
                update_data["dateCompleted"] = None
        if request.text is not None:
            update_data["text"] = request.text
        if request.priority is not None:
            update_data["priority"] = request.priority

        # Update using existing backend function
        await update_todo_fields(todo_id=request.id, updates=update_data, user_id=user_id)

        # Get updated task
        updated_task = await collections.todos.find_one({"_id": ObjectId(request.id)})

        return {
            "ok": True,
            "task": {
                "_id": str(updated_task["_id"]),
                "text": updated_task["text"],
                "category": updated_task.get("category"),
                "priority": updated_task.get("priority"),
                "completed": updated_task.get("completed", False),
                "dateAdded": updated_task.get("dateAdded"),
                "dateCompleted": updated_task.get("dateCompleted"),
                "space_id": updated_task.get("space_id"),
                "user_id": updated_task.get("user_id"),
            },
        }
    except Exception as e:
        # Handle HTTPException which has a detail attribute
        if hasattr(e, "detail"):
            error_msg = str(e.detail)
        else:
            error_msg = str(e)
        return {"ok": False, "error": f"Failed to update task: {error_msg}"}


async def add_journal_entry(request: JournalAddRequest, user_id: str, space_id: Optional[str] = None) -> Dict[str, Any]:
    """Create or update a journal entry."""
    try:
        # Use today's date if not specified
        entry_date = request.date or datetime.now().strftime("%Y-%m-%d")

        # Create JournalEntry object
        journal_entry = JournalEntry(user_id=user_id, space_id=space_id, date=entry_date, text=request.content)

        # Create journal entry (default to UTC timezone)
        created_entry = await db_create_journal_entry(journal_entry, "UTC")

        return {
            "ok": True,
            "id": created_entry.id or "",
            "journal": {
                "_id": created_entry.id or "",
                "content": created_entry.text,
                "date": created_entry.date,
                "space_id": created_entry.space_id,
                "user_id": created_entry.user_id,
            },
        }
    except Exception as e:
        return {"ok": False, "error": f"Failed to add journal entry: {str(e)}"}


async def search_content(request: SearchRequest, user_id: str, space_id: Optional[str] = None) -> Dict[str, Any]:
    """Search through tasks and journal entries."""
    try:
        hits = []
        query_lower = request.query.lower()

        # Search tasks if requested
        if not request.types or "task" in request.types:
            tasks = await get_todos(user_id=user_id, space_id=space_id)
            for task in tasks:
                # Convert Todo object to dict if needed
                if hasattr(task, "dict"):
                    task_dict = task.dict(by_alias=True)
                elif hasattr(task, "__dict__"):
                    task_dict = task.__dict__
                else:
                    task_dict = dict(task)

                task_text = task_dict["text"]
                task_category = task_dict.get("category", "")
                text_content = f"{task_text} {task_category}".lower()
                if query_lower in text_content:
                    hit_data = {"type": "task", "id": str(task_dict["_id"]), "snippet": task_dict["text"]}
                    hits.append(hit_data)

        # Search journals if requested
        if not request.types or "journal" in request.types:
            # Note: simplified search - production might use full-text search
            query_filter = {"user_id": user_id}
            if space_id:
                query_filter["space_id"] = space_id

            journals = await collections.journals.find(query_filter).to_list(length=100)
            for journal in journals:
                content = journal.get("content", "")
                if query_lower in content.lower():
                    # Create snippet with length limit
                    snippet = content[:200] + "..." if len(content) > 200 else content
                    hit_data = {"type": "journal", "id": str(journal["_id"]), "snippet": snippet}
                    hits.append(hit_data)

        return {"ok": True, "results": hits[: request.limit]}
    except Exception as e:
        return {"ok": False, "error": f"Failed to search content: {str(e)}"}


# Tool registry for easy access
AVAILABLE_TOOLS: Dict[str, Dict[str, Any]] = {
    "get_current_weather": {
        "func": get_current_weather,
        "description": "Get current weather conditions for a specific location",
        "schema": WeatherCurrentRequest,
    },
    "get_weather_forecast": {
        "func": get_weather_forecast,
        "description": "Get multi-day weather forecast for a location",
        "schema": WeatherForecastRequest,
    },
    "get_weather_alerts": {
        "func": get_weather_alerts,
        "description": "Check for weather alerts in a specific location",
        "schema": WeatherAlertsRequest,
    },
    "get_book_recommendations": {
        "func": get_book_recommendations,
        "description": "Fetch book recommendations from Open Library",
        "schema": BookRecommendationRequest,
    },
    "get_inspirational_quotes": {
        "func": get_inspirational_quotes,
        "description": "Get motivational quotes or affirmations tailored to a goal",
        "schema": InspirationalQuoteRequest,
    },
    "add_task": {"func": add_task, "description": "Add a new task to user's todo list", "schema": TaskAddRequest},
    "list_tasks": {"func": list_tasks, "description": "List tasks in the current space", "schema": TaskListRequest},
    "update_task": {"func": update_task, "description": "Update an existing task", "schema": TaskUpdateRequest},
    "add_journal_entry": {
        "func": add_journal_entry,
        "description": "Create or update a journal entry",
        "schema": JournalAddRequest,
    },
    "search_content": {
        "func": search_content,
        "description": "Search through tasks and journal entries",
        "schema": SearchRequest,
    },
}
