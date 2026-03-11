"""Direct tool implementations for task management, journals, search, and web tools.

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
from bson.errors import InvalidId  # noqa: E402
from db import collections  # noqa: E402
from journals import JournalEntry  # noqa: E402
from journals import create_journal_entry as db_create_journal_entry  # noqa: E402,E501
from todos import Todo  # noqa: E402
from todos import create_todo as db_create_todo  # noqa: E402,E501
from todos import get_todos, update_todo_fields  # noqa: E402

# Local imports  # noqa: E402
from .schemas import (  # noqa: E402
    JournalAddRequest,
    JournalReadRequest,
    MemoryDeleteRequest,
    MemoryListRequest,
    MemorySaveRequest,
    SearchRequest,
    SendEmailRequest,
    TaskAddRequest,
    TaskListRequest,
    TaskUpdateRequest,
    WebScrapingRequest,
    WebSearchRequest,
)

MAX_TASK_TITLE_LENGTH = 80


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
            category=request.category,
            priority=ui_priority,
            user_id=user_id,
            space_id=space_id,
            dateAdded=datetime.utcnow().isoformat(),
            notes=notes,
            creator_type="agent",
            parent_id=request.parent_id,
        )

        created_todo = await db_create_todo(todo)

        # db_create_todo returns a Todo object, convert to dict
        created_task_dict = created_todo.dict(by_alias=True)
        todo_id = str(created_task_dict["_id"])

        # Auto-create linked session for agent-created tasks (mirrors app.py behavior)
        try:
            from chat_sessions import append_message
            from chat_sessions import create_session as create_chat_session
            from chat_sessions import find_session_by_todo

            is_subtask = bool(request.parent_id)

            # Build initial message
            if is_subtask:
                parent_doc = await collections.todos.find_one({"_id": ObjectId(request.parent_id)})
                parent_text = parent_doc.get("text", "") if parent_doc else ""
                initial_msg = f'Subtask of: "{parent_text}"\n\nTask: {title}'
                if notes:
                    initial_msg += f"\nNotes: {notes}"
            else:
                initial_msg = f"Agent created task: {title}"
                if notes:
                    initial_msg += f"\nNotes: {notes}"

            # Inherit agent_id from parent session for subtasks
            auto_agent_id = None
            if is_subtask:
                parent_session = await find_session_by_todo(user_id, request.parent_id or "")
                if parent_session and parent_session.get("agent_id"):
                    auto_agent_id = parent_session["agent_id"]

            session_id = await create_chat_session(
                user_id,
                space_id,
                title,
                todo_id=todo_id,
                agent_id=auto_agent_id,
            )
            await append_message(session_id, user_id, "assistant", initial_msg)

            # Dormant session for non-first subtasks
            if is_subtask:
                parent_doc_fresh = await collections.todos.find_one({"_id": ObjectId(request.parent_id)})
                parent_subtask_ids = parent_doc_fresh.get("subtask_ids", []) if parent_doc_fresh else []
                if parent_subtask_ids and parent_subtask_ids[0] != todo_id:
                    from chat_sessions import sessions_collection as sess_coll

                    await sess_coll.update_one(
                        {"_id": ObjectId(session_id)},
                        {"$set": {"needs_agent_response": False}},
                    )
        except Exception as e:
            import logging

            logging.getLogger(__name__).error(f"Failed to create session for agent task: {e}")

        return {
            "ok": True,
            "id": todo_id,
            "task": {
                "_id": todo_id,
                "text": created_task_dict["text"],
                "category": created_task_dict.get("category"),
                "priority": created_task_dict.get("priority"),
                "completed": created_task_dict.get("completed", False),
                "dateAdded": created_task_dict.get("dateAdded"),
                "space_id": created_task_dict.get("space_id"),
                "user_id": created_task_dict.get("user_id"),
                "notes": created_task_dict.get("notes"),
                "parent_id": created_task_dict.get("parent_id"),
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

        # Trigger subtask orchestration if completing
        if request.completed:
            try:
                from todos import handle_subtask_completion

                await handle_subtask_completion(request.id, user_id)
            except Exception as e:
                import logging

                logging.getLogger(__name__).error(f"Subtask orchestration error in agent: {e}")

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


async def send_email_to_user(request: SendEmailRequest, user_id: str, space_id: Optional[str] = None) -> Dict[str, Any]:
    """Send an email with the provided text content to the current user."""
    del space_id  # Space context is not required for direct emails

    message_text = request.text.strip()
    if not message_text:
        return {"ok": False, "error": "Email text cannot be empty."}

    subject_override = (request.title or "").strip() if request.title is not None else None
    if subject_override == "":
        return {"ok": False, "error": "Email title cannot be empty when provided."}

    try:
        user_object_id = ObjectId(user_id)
    except (InvalidId, TypeError):
        return {"ok": False, "error": "Invalid user identifier."}

    try:
        from auth import users_collection
        from email_summary import send_email
    except ImportError as exc:
        return {"ok": False, "error": f"Email support unavailable: {exc}"}

    user = await users_collection.find_one({"_id": user_object_id})
    if not user:
        return {"ok": False, "error": "User not found."}

    user_email = user.get("email")
    if not user_email:
        return {"ok": False, "error": "User email address not available."}

    subject = subject_override or "Message from your AI assistant"
    success = await send_email(user_email, subject, message_text)

    if success:
        return {"ok": True, "email": user_email, "subject": subject}

    return {"ok": False, "error": "Failed to send email to the user."}


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
    # Stub kept for future MCP integration; currently unused and avoids missing dependency failures
    return {"ok": False, "error": "Web scraping via MCP is currently disabled"}


async def save_memory_tool(request: MemorySaveRequest, user_id: str, space_id: Optional[str] = None) -> Dict[str, Any]:
    """Save a memory fact about the user."""
    try:
        from agent_memory import save_memory

        fact = await save_memory(
            user_id=user_id,
            key=request.key,
            value=request.value,
            space_id=space_id,
            category=request.category,
        )
        return {
            "ok": True,
            "memory": {
                "key": fact.key,
                "value": fact.value,
                "category": fact.category,
            },
        }
    except Exception as e:
        return {"ok": False, "error": f"Failed to save memory: {str(e)}"}


async def list_memories_tool(
    request: MemoryListRequest, user_id: str, space_id: Optional[str] = None
) -> Dict[str, Any]:
    """List all memory facts for this user/space."""
    try:
        from agent_memory import list_memories

        facts = await list_memories(
            user_id=user_id,
            space_id=space_id,
            category=request.category,
        )
        return {
            "ok": True,
            "memories": [{"key": f.key, "value": f.value, "category": f.category} for f in facts],
            "count": len(facts),
        }
    except Exception as e:
        return {"ok": False, "error": f"Failed to list memories: {str(e)}"}


async def delete_memory_tool(
    request: MemoryDeleteRequest, user_id: str, space_id: Optional[str] = None
) -> Dict[str, Any]:
    """Delete a specific memory fact."""
    try:
        from agent_memory import delete_memory_by_key

        deleted = await delete_memory_by_key(
            user_id=user_id,
            key=request.key,
            space_id=space_id,
        )
        if deleted:
            return {"ok": True, "deleted_key": request.key}
        return {"ok": False, "error": f"Memory '{request.key}' not found"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to delete memory: {str(e)}"}


# Tool registry for easy access
AVAILABLE_TOOLS: Dict[str, Dict[str, Any]] = {
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
    "send_email_to_user": {
        "func": send_email_to_user,
        "description": "Send an email with custom text content to the current user",
        "schema": SendEmailRequest,
    },
    "web_scraping": {
        "func": web_scraping,
        "description": "Scrape and extract content from any webpage",
        "schema": WebScrapingRequest,
    },
    "save_memory": {
        "func": save_memory_tool,
        "description": "Save a fact or preference about the user to persistent memory",
        "schema": MemorySaveRequest,
    },
    "list_memories": {
        "func": list_memories_tool,
        "description": "List all saved memory facts about the user",
        "schema": MemoryListRequest,
    },
    "delete_memory": {
        "func": delete_memory_tool,
        "description": "Delete a specific memory fact",
        "schema": MemoryDeleteRequest,
    },
}
