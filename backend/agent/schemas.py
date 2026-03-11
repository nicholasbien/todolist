"""
Pydantic schemas for agent tool validation and OpenAI function calling.
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class TaskAddRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Task description")
    category: str = Field(
        ...,
        description=(
            "Task category. Choose from user's existing categories (listed in system context), "
            "or use 'General' if none fit well."
        ),
    )
    priority: Literal["low", "medium", "high"] = Field(
        default="medium", description="Task priority: 'low', 'medium', or 'high'"
    )
    notes: Optional[str] = Field(
        default=None,
        description=(
            "Additional task details or context. Keep the main task title concise and place extended details here."
        ),
    )
    parent_id: Optional[str] = Field(
        default=None,
        description="Parent task ID to create this as a sub-task. Sub-tasks execute in linear order.",
    )


class TaskUpdateRequest(BaseModel):
    id: str = Field(..., min_length=1, description="Task ID to update")
    completed: Optional[bool] = Field(None, description="Mark as completed/incomplete")
    text: Optional[str] = Field(None, description="New task text (optional)")
    priority: Optional[Literal["low", "medium", "high"]] = Field(
        None, description="New priority: 'low', 'medium', or 'high' (optional)"
    )


class TaskListRequest(BaseModel):
    completed: Optional[bool] = Field(
        None, description="Filter by completion status (optional)"
    )


class JournalAddRequest(BaseModel):
    content: str = Field(..., min_length=1, description="Journal entry content")
    date: Optional[str] = Field(
        None, description="Date in YYYY-MM-DD format (optional, defaults to today)"
    )


class JournalReadRequest(BaseModel):
    date: Optional[str] = Field(
        None,
        description="Date in YYYY-MM-DD format (optional, gets recent entries if not provided)",
    )
    limit: int = Field(
        default=5, description="Number of recent entries to return if no date specified"
    )


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query")
    types: Optional[List[Literal["task", "journal"]]] = Field(
        None, description="Types to search (optional)"
    )
    limit: int = Field(default=8, ge=1, le=50, description="Maximum results")


class WebSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query")
    count: int = Field(
        default=5, ge=1, le=10, description="Number of results to return"
    )
    freshness: Optional[str] = Field(
        default="pm",
        description="Freshness filter: 'pd' (past day), 'pw' (past week), 'pm' (past month), 'py' (past year)",
    )
    summary: bool = Field(default=True, description="Include AI summary of results")


class WebScrapingRequest(BaseModel):
    url: str = Field(..., description="URL to scrape")
    selector: Optional[str] = Field(
        None, description="CSS selector to extract specific content (optional)"
    )
    extract_text: bool = Field(default=True, description="Extract text content")
    extract_html: bool = Field(default=False, description="Extract HTML content")


class SendEmailRequest(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        description="Plain text content of the email to send to the user",
    )
    title: Optional[str] = Field(
        None,
        min_length=1,
        description="Optional subject line for the email. If omitted, a default subject is used.",
    )


class MemorySaveRequest(BaseModel):
    key: str = Field(
        ...,
        min_length=1,
        description=(
            "Short identifier for this memory fact, e.g. 'preferred_name', "
            "'work_schedule', 'communication_style', 'project_context'"
        ),
    )
    value: str = Field(
        ..., min_length=1, description="The value or description to remember"
    )
    category: Optional[str] = Field(
        default=None,
        description="Optional category: 'preference', 'context', 'workflow', or 'personal'",
    )


class MemoryListRequest(BaseModel):
    category: Optional[str] = Field(
        default=None,
        description="Optional category filter: 'preference', 'context', 'workflow', or 'personal'",
    )


class MemoryDeleteRequest(BaseModel):
    key: str = Field(..., min_length=1, description="Key of the memory fact to delete")


class SearchSessionsRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query text")
    limit: int = Field(
        default=20, ge=1, le=50, description="Maximum number of results to return"
    )


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

    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


# Tool schema mapping for OpenAI Responses API
# Format: {"type": "function", "name": "...", "description": "...", "parameters": {...}}
OPENAI_TOOL_SCHEMAS = {
    "add_task": {
        "type": "function",
        "name": "add_task",
        "description": "Add a new task to user's todo list. Choose a category from the user's existing categories (provided in system context), or use 'General' if none fit well. Call when user wants to add, create, or save a new task, todo, or reminder. To create a sub-task, pass the parent task's ID as parent_id. Sub-tasks execute in order; completing all sub-tasks auto-completes the parent.",  # noqa: E501
        "parameters": get_openai_tool_schema(TaskAddRequest),
    },
    "list_tasks": {
        "type": "function",
        "name": "list_tasks",
        "description": "List tasks in the current space. Call when user asks to see, list, show, or view their tasks or todos. By default always pass completed=false to show only incomplete tasks. Only pass completed=true when the user explicitly asks about completed tasks, past accomplishments, what they have done/finished, or wants to revisit/undo a completed task.",  # noqa: E501
        "parameters": get_openai_tool_schema(TaskListRequest),
    },
    "update_task": {
        "type": "function",
        "name": "update_task",
        "description": "Update an existing task. Call when user wants to mark task complete, update task text, change priority, or modify existing tasks.",  # noqa: E501
        "parameters": get_openai_tool_schema(TaskUpdateRequest),
    },
    "add_journal_entry": {
        "type": "function",
        "name": "add_journal_entry",
        "description": "Create or update a journal entry. Call when user wants to add journal entry, diary entry, or save notes for a specific date.",  # noqa: E501
        "parameters": get_openai_tool_schema(JournalAddRequest),
    },
    "read_journal_entry": {
        "type": "function",
        "name": "read_journal_entry",
        "description": "Read journal entries. Call when user asks about their past journal entries, thoughts, or activities, or when you need context from their journals for personalization.",  # noqa: E501
        "parameters": get_openai_tool_schema(JournalReadRequest),
    },
    "search_content": {
        "type": "function",
        "name": "search_content",
        "description": "Search through tasks and journal entries. Call when user wants to search through their tasks or journal entries for specific content.",  # noqa: E501
        "parameters": get_openai_tool_schema(SearchRequest),
    },
    "web_search": {
        "type": "function",
        "name": "web_search",
        "description": (
            "Search the web for current information, news, or specific queries. "
            "Call when user asks for recent information, current events, or web searches. "
            "Provides both search results and AI-generated summaries."
        ),
        "parameters": get_openai_tool_schema(WebSearchRequest),
    },
    "send_email_to_user": {
        "type": "function",
        "name": "send_email_to_user",
        "description": (
            "Send an email directly to the current user using the provided plain text content. "
            "Optionally include a 'title' to set the email subject line. "
            "Call when the user asks the assistant to email them information or a recap."
        ),
        "parameters": get_openai_tool_schema(SendEmailRequest),
    },
    "save_memory": {
        "type": "function",
        "name": "save_memory",
        "description": (
            "Save a fact or preference about the user to persistent memory. "
            "Use this proactively when the user shares preferences, context about themselves, "
            "their work style, project details, or anything worth remembering across sessions. "
            "Examples: preferred name, communication style, recurring projects, timezone, "
            "tools they use, team structure. The memory persists across all future conversations."
        ),
        "parameters": get_openai_tool_schema(MemorySaveRequest),
    },
    "list_memories": {
        "type": "function",
        "name": "list_memories",
        "description": (
            "List all saved memory facts about the user. "
            "Call when the user asks what you know about them, or to review stored preferences."
        ),
        "parameters": get_openai_tool_schema(MemoryListRequest),
    },
    "delete_memory": {
        "type": "function",
        "name": "delete_memory",
        "description": (
            "Delete a specific memory fact by key. "
            "Call when the user asks to forget something or correct outdated information."
        ),
        "parameters": get_openai_tool_schema(MemoryDeleteRequest),
    },
    "search_sessions": {
        "type": "function",
        "name": "search_sessions",
        "description": (
            "Search chat sessions by title and message content. "
            "Call when the user wants to find a past conversation, look up what was discussed, "
            "or locate a session related to a specific topic. Returns matching sessions with preview snippets."
        ),
        "parameters": get_openai_tool_schema(SearchSessionsRequest),
    },
}
