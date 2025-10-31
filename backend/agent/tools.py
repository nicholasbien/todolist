"""Direct tool implementations for weather and task management.

Replaces the previous Node.js MCP server approach with direct Python functions.
"""

import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

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
    JournalReadRequest,
    SearchRequest,
    TaskAddRequest,
    TaskListRequest,
    TaskUpdateRequest,
    WeatherCurrentRequest,
    WeatherForecastRequest,
    WebScrapingRequest,
    WebSearchRequest,
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

# Fallback quotes - not currently used, always fetching from API
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


MAX_TASK_TITLE_LENGTH = 80


async def get_current_weather(
    request: WeatherCurrentRequest, user_id: str, space_id: Optional[str] = None
) -> Dict[str, Any]:
    """Get current weather for a location using OpenWeatherMap API."""
    try:
        # Get API key from environment
        api_key = os.getenv("OPENWEATHER_API_KEY")
        if not api_key:
            return {"ok": False, "error": "Weather API not configured. Please set OPENWEATHER_API_KEY in environment."}

        # Call OpenWeatherMap API
        base_url = "https://api.openweathermap.org/data/2.5/weather"
        params = {
            "q": request.location,
            "appid": api_key,
            "units": request.units if request.units != "kelvin" else "standard",
        }

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(base_url, params=params)
            if response.status_code == 404:
                return {"ok": False, "error": f"Location '{request.location}' not found"}
            elif response.status_code == 401:
                return {"ok": False, "error": "Invalid weather API key"}
            response.raise_for_status()

        data = response.json()

        # Parse the API response
        weather_data = {
            "location": f"{data['name']}, {data['sys']['country']}",
            "temperature": round(data["main"]["temp"]),
            "description": data["weather"][0]["description"].capitalize(),
            "humidity": data["main"]["humidity"],
            "wind_speed": round(data["wind"]["speed"]),
            "condition": data["weather"][0]["main"].lower(),
        }

        # Format temperature display
        temp = weather_data["temperature"]
        unit_symbol = "°F" if request.units == "imperial" else "°C" if request.units == "metric" else "K"
        weather_data["temperature_display"] = f"{temp}{unit_symbol}"

        # Format wind speed display
        wind_speed = weather_data["wind_speed"]
        if request.units == "imperial":
            weather_data["wind_speed_display"] = f"{wind_speed} mph"
        else:
            weather_data["wind_speed_display"] = f"{wind_speed} m/s"

        return {"ok": True, "weather": weather_data}
    except httpx.HTTPStatusError as e:
        return {"ok": False, "error": f"Weather API error: {e.response.status_code}"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to get weather for {request.location}: {str(e)}"}


async def get_weather_forecast(
    request: WeatherForecastRequest, user_id: str, space_id: Optional[str] = None
) -> Dict[str, Any]:
    """Get multi-day weather forecast using OpenWeatherMap API."""
    try:
        # Get API key from environment
        api_key = os.getenv("OPENWEATHER_API_KEY")
        if not api_key:
            return {"ok": False, "error": "Weather API not configured. Please set OPENWEATHER_API_KEY in environment."}

        # Call OpenWeatherMap 5-day forecast API (free tier)
        base_url = "https://api.openweathermap.org/data/2.5/forecast"
        params = {
            "q": request.location,
            "appid": api_key,
            "units": request.units if request.units != "kelvin" else "standard",
            "cnt": min(request.days * 8, 40),  # API returns 3-hour intervals, max 40
        }

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(base_url, params=params)
            if response.status_code == 404:
                return {"ok": False, "error": f"Location '{request.location}' not found"}
            elif response.status_code == 401:
                return {"ok": False, "error": "Invalid weather API key"}
            response.raise_for_status()

        data = response.json()

        # Parse location
        location = f"{data['city']['name']}, {data['city']['country']}"

        # Group forecasts by day (take noon forecast for each day)
        forecast: List[Dict[str, Any]] = []
        processed_dates = set()

        for item in data["list"]:
            forecast_date = datetime.fromtimestamp(item["dt"]).strftime("%Y-%m-%d")

            # Skip if we already have this date or exceeded requested days
            if forecast_date in processed_dates or len(forecast) >= request.days:
                continue

            processed_dates.add(forecast_date)

            # Parse forecast data
            temp = round(item["main"]["temp"])
            unit_symbol = "°F" if request.units == "imperial" else "°C" if request.units == "metric" else "K"

            wind_speed = round(item["wind"]["speed"])
            wind_unit = "mph" if request.units == "imperial" else "m/s"

            day_data = {
                "date": forecast_date,
                "temperature": temp,
                "temperature_display": f"{temp}{unit_symbol}",
                "description": item["weather"][0]["description"].capitalize(),
                "humidity": item["main"]["humidity"],
                "wind_speed": wind_speed,
                "wind_speed_display": f"{wind_speed} {wind_unit}",
            }

            forecast.append(day_data)

        result_data = {"location": location, "forecast": forecast}
        return {"ok": True, "forecast": result_data}
    except httpx.HTTPStatusError as e:
        return {"ok": False, "error": f"Weather API error: {e.response.status_code}"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to get forecast for {request.location}: {str(e)}"}


# Weather alerts function removed - not needed


async def get_book_recommendations(
    request: BookRecommendationRequest, user_id: str, space_id: Optional[str] = None
) -> Dict[str, Any]:
    """Fetch book recommendations from Open Library using Search or Subject API."""
    try:
        # Handle multiple queries first (early return avoids variable conflicts)
        if request.queries:
            # Handle multiple queries - combine results from multiple searches
            all_books = []
            books_per_query = max(2, request.limit // len(request.queries))

            for query in request.queries[:3]:  # Limit to 3 queries max
                query_url = "https://openlibrary.org/search.json"
                query_params: Dict[str, Any] = {
                    "q": query,
                    "limit": books_per_query,
                }

                async with httpx.AsyncClient(timeout=15) as client:
                    response = await client.get(query_url, params=query_params)
                    response.raise_for_status()

                data = response.json()
                for doc in (data.get("docs") or [])[:books_per_query]:
                    authors = doc.get("author_name") or []
                    book_data = {
                        "title": doc.get("title", "Unknown Title"),
                        "author_name": authors,
                        "year": doc.get("first_publish_year"),
                        "query_source": query,  # Track which query found this book
                    }
                    all_books.append(book_data)

            # Remove duplicates based on title
            seen_titles = set()
            unique_books = []
            for book in all_books:
                title_lower = book["title"].lower()
                if title_lower not in seen_titles:
                    seen_titles.add(title_lower)
                    unique_books.append(book)

            return {
                "ok": True,
                "books": unique_books[: request.limit],
                "count": len(unique_books[: request.limit]),
                "search_term": ", ".join(request.queries),
                "api_used": "multi_search",
            }

        # Determine which API to use for single requests
        if request.subject:
            # Use subject-specific API for curated subject lists
            clean_subject = request.subject.lower().replace(" ", "_")
            search_url = f"https://openlibrary.org/subjects/{clean_subject}.json"
            search_params: Dict[str, Any] = {"limit": request.limit}
            search_term = request.subject
            api_type = "subject"
        elif request.author:
            # Use search API with author-specific query
            search_url = "https://openlibrary.org/search.json"
            search_params = {
                "author": request.author,
                "limit": request.limit,
            }
            search_term = request.author
            api_type = "author"
        elif request.query:
            # Use general search API for single short query
            search_url = "https://openlibrary.org/search.json"
            search_params = {
                "q": request.query,
                "limit": request.limit,
            }
            search_term = request.query
            api_type = "search"
        else:
            return {"ok": False, "error": "Either query, queries, subject, or author must be provided"}

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(search_url, params=search_params)
            response.raise_for_status()

        data = response.json()
        books = []

        if api_type == "subject":
            # Subject API returns works in a different format
            works = data.get("works", [])
            for work in works[: request.limit]:
                authors = [author.get("name", "") for author in (work.get("authors") or []) if author]
                book_data = {
                    "title": work.get("title", "Unknown Title"),
                    "author_name": authors,
                    "year": work.get("first_publish_year"),
                }
                books.append(book_data)
        else:
            # Search API format - this is generally better for complex queries
            for doc in (data.get("docs") or [])[: request.limit]:
                authors = doc.get("author_name") or []
                book_data = {
                    "title": doc.get("title", "Unknown Title"),
                    "author_name": authors,
                    "year": doc.get("first_publish_year"),
                }
                books.append(book_data)

        return {
            "ok": True,
            "books": books,
            "count": len(books),
            "search_term": search_term,
            "api_used": api_type,
        }

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
                    else:
                        affirmation = data.get("affirmation")
                        if affirmation:
                            quotes.append(affirmation)
        except Exception as e:
            # Log the error but continue trying to fetch quotes
            print(f"Error fetching quote: {e}")
            continue

    # If no quotes were fetched, return an error
    if not quotes:
        return {"ok": False, "error": "Unable to fetch quotes from API"}

    return {"ok": True, "quotes": quotes}


def _map_priority_to_ui_format(priority: str) -> str:
    """Convert priority to UI format (capitalize first letter)."""
    return priority.capitalize() if priority else "Medium"


def _prepare_task_title_and_notes(text: str, explicit_notes: Optional[str]) -> Tuple[str, Optional[str]]:
    """Ensure tasks have concise titles with additional context stored in notes."""

    normalized_text = (text or "").strip()
    provided_notes = explicit_notes.strip() if explicit_notes and explicit_notes.strip() else None

    if not normalized_text:
        return "", provided_notes

    # Split into non-empty lines while preserving order
    lines = [line.strip() for line in normalized_text.splitlines() if line.strip()]
    if not lines:
        return "", provided_notes

    title_source = lines[0]
    details_parts: List[str] = []

    if len(lines) > 1:
        remaining_lines = "\n".join(lines[1:]).strip()
        if remaining_lines:
            details_parts.append(remaining_lines)

    if len(title_source) > MAX_TASK_TITLE_LENGTH:
        truncated = title_source[:MAX_TASK_TITLE_LENGTH].rstrip(" ,.;:-")
        if len(title_source) > MAX_TASK_TITLE_LENGTH:
            truncated += "…"
        title = truncated

        remainder = title_source[MAX_TASK_TITLE_LENGTH:].strip()
        if remainder:
            details_parts.insert(0, remainder)
        else:
            # Preserve the full original title in notes if truncation removed information
            details_parts.insert(0, title_source)
    else:
        title = title_source

    if provided_notes:
        details_parts.append(provided_notes)

    notes = "\n\n".join(part for part in details_parts if part)
    return title, notes or None


async def add_task(request: TaskAddRequest, user_id: str, space_id: Optional[str] = None) -> Dict[str, Any]:
    """Add a new task to user's todo list."""
    try:
        # Map priority from agent format to UI format
        ui_priority = _map_priority_to_ui_format(request.priority)

        title, notes = _prepare_task_title_and_notes(request.text, request.notes)

        # Create Todo object
        todo = Todo(
            text=title,
            category=request.category or "General",
            priority=ui_priority,
            user_id=user_id,
            space_id=space_id,
            dateAdded=datetime.utcnow().isoformat(),
            notes=notes,
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
                "notes": created_task_dict.get("notes"),
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
            update_data["priority"] = _map_priority_to_ui_format(request.priority)

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
    """Append content to a journal entry for the given date."""
    try:
        # Use today's date if not specified
        entry_date = request.date or datetime.now().strftime("%Y-%m-%d")

        # Fetch existing entry to preserve previous content
        existing_entry = await collections.journals.find_one(
            {"user_id": user_id, "space_id": space_id, "date": entry_date}
        )

        # Combine existing text with new content when present
        content = request.content
        if existing_entry and existing_entry.get("text"):
            content = f"{existing_entry['text']}\n{content}".strip()

        journal_entry = JournalEntry(user_id=user_id, space_id=space_id, date=entry_date, text=content)

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


async def read_journal_entry(
    request: JournalReadRequest, user_id: str, space_id: Optional[str] = None
) -> Dict[str, Any]:
    """Read journal entries for a specific date or get recent entries."""
    try:
        # Use user_id as string for MongoDB query (journals store user_id as string)
        query_filter = {"user_id": user_id}
        if space_id:
            query_filter["space_id"] = space_id

        if request.date:
            # Get specific date entry
            query_filter["date"] = request.date
            journal = await collections.journals.find_one(query_filter)
            if journal:
                return {
                    "ok": True,
                    "entry": {
                        "id": str(journal["_id"]),
                        "content": journal.get("text", ""),  # Database uses 'text' field
                        "date": journal.get("date", ""),
                        "space_id": journal.get("space_id"),
                    },
                }
            else:
                return {"ok": True, "entry": None, "message": f"No journal entry found for {request.date}"}
        else:
            # Get recent entries
            journals = (
                await collections.journals.find(query_filter)
                .sort("date", -1)
                .limit(request.limit)
                .to_list(length=request.limit)
            )
            entries = []
            for journal in journals:
                entries.append(
                    {
                        "id": str(journal["_id"]),
                        "content": journal.get("text", ""),  # Database uses 'text' field
                        "date": journal.get("date", ""),
                        "space_id": journal.get("space_id"),
                    }
                )
            return {"ok": True, "entries": entries, "count": len(entries)}

    except Exception as e:
        return {"ok": False, "error": f"Failed to read journal entries: {str(e)}"}


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
            # Convert user_id string back to ObjectId for MongoDB query
            try:
                user_object_id = ObjectId(user_id)
            except Exception:
                user_object_id = user_id  # fallback if not a valid ObjectId string

            query_filter = {"user_id": user_object_id}
            if space_id:
                query_filter["space_id"] = space_id

            journals = await collections.journals.find(query_filter).to_list(length=100)
            for journal in journals:
                content = journal.get("text", "")  # Database uses 'text' field
                if query_lower in content.lower():
                    # Create snippet with length limit
                    snippet = content[:200] + "..." if len(content) > 200 else content
                    hit_data = {"type": "journal", "id": str(journal["_id"]), "snippet": snippet}
                    hits.append(hit_data)

        return {"ok": True, "results": hits[: request.limit]}
    except Exception as e:
        return {"ok": False, "error": f"Failed to search content: {str(e)}"}


async def web_search(request: WebSearchRequest, user_id: str, space_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Search the web using Brave Search API.

    Args:
        request: WebSearchRequest containing query, count, freshness, and summary params
        user_id: User ID for the request
        space_id: Optional space ID

    Returns:
        Dict with search results and optional summary
    """
    try:
        # Check if BRAVE_API_KEY is set
        brave_api_key = os.getenv("BRAVE_API_KEY")
        if not brave_api_key or brave_api_key == "your_brave_api_key_here":
            return {
                "ok": False,
                "error": "Brave Search API key not configured. Please set BRAVE_API_KEY environment variable.",
                "results": [],
                "summary": None,
            }

        # Direct Brave Search API integration (much cleaner than MCP)
        async with httpx.AsyncClient() as client:
            try:
                # Call Brave Search API directly
                url = "https://api.search.brave.com/res/v1/web/search"
                headers = {
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": brave_api_key,
                }
                params = {
                    "q": request.query,
                    "count": request.count,
                    "freshness": request.freshness,
                    "summary": "1" if request.summary else "0",
                }

                response = await client.get(url, headers=headers, params=params)
                response.raise_for_status()

                data = response.json()

                # Extract search results
                web_results = data.get("web", {}).get("results", [])
                formatted_results = []

                for result_item in web_results[: request.count]:
                    formatted_results.append(
                        {
                            "title": result_item.get("title", ""),
                            "url": result_item.get("url", ""),
                            "snippet": result_item.get("description", ""),
                        }
                    )

                # Extract summary if available
                summary_text = None
                if request.summary:
                    summary_data = data.get("summarizer", {})
                    summary_text = summary_data.get("key", "") if summary_data else None

                return {
                    "ok": True,
                    "results": formatted_results,
                    "summary": summary_text,
                    "query": request.query,
                    "count": len(formatted_results),
                }

            except httpx.HTTPStatusError as e:
                return {
                    "ok": False,
                    "error": f"Brave API error {e.response.status_code}: {e.response.text}",
                    "results": [],
                    "summary": None,
                }
            except Exception as e:
                return {
                    "ok": False,
                    "error": f"Web search failed: {str(e)}",
                    "results": [],
                    "summary": None,
                }

    except Exception as e:
        return {"ok": False, "error": f"Failed to perform web search: {str(e)}"}


async def web_scraping(request: WebScrapingRequest, user_id: str, space_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Scrape web content using Puppeteer MCP server.

    Args:
        request: WebScrapingRequest containing URL and optional selector
        user_id: User ID for the request
        space_id: Optional space ID

    Returns:
        Dict with scraped content or error
    """
    try:
        # Import the MCP client manager
        from mcp_client import mcp_manager

        # Scrape the URL using Puppeteer MCP
        result = await mcp_manager.scrape_url(url=request.url, selector=request.selector)

        if not result.get("ok"):
            return result

        # Extract requested content types
        content = result.get("content", {})
        extracted = {}

        if request.extract_text:
            extracted["text"] = content.get("text", "")

        if request.extract_html:
            extracted["html"] = content.get("html", "")

        # Add metadata
        extracted["title"] = content.get("title", "")
        extracted["url"] = result.get("url", request.url)

        return {"ok": True, "content": extracted, "screenshot": result.get("screenshot")}

    except Exception as e:
        return {"ok": False, "error": f"Failed to scrape URL: {str(e)}"}


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
    "get_book_recommendations": {
        "func": get_book_recommendations,
        "description": "Search for books using flexible queries - subjects, genres, authors, titles",
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
    "read_journal_entry": {
        "func": read_journal_entry,
        "description": "Read journal entries for specific date or recent entries",
        "schema": JournalReadRequest,
    },
    "search_content": {
        "func": search_content,
        "description": "Search through tasks and journal entries",
        "schema": SearchRequest,
    },
    "web_search": {
        "func": web_search,
        "description": "Search the web for current information, news, or specific queries",
        "schema": WebSearchRequest,
    },
    "web_scraping": {
        "func": web_scraping,
        "description": "Scrape and extract content from any webpage",
        "schema": WebScrapingRequest,
    },
}
