"""Main agent module with OpenAI integration and streaming support."""

import json
import logging
import os
import sys
import time
from collections import OrderedDict
from typing import Any, AsyncGenerator, Dict, List, Optional

import jinja2
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add parent directory to path for imports  # noqa: E402
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from auth import verify_session  # noqa: E402
from chat_sessions import (  # noqa: E402
    create_session,
    delete_session,
    find_session_by_todo,
    get_pending_sessions,
    get_session_trajectory,
    get_todo_session_statuses,
    get_unread_todo_ids,
    list_sessions,
    save_trajectory,
)
from chats import ChatMessage, save_chat_message  # noqa: E402
from fastapi import APIRouter, Depends, Header, HTTPException, Query  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from openai import AsyncOpenAI  # noqa: E402

from .schemas import OPENAI_TOOL_SCHEMAS  # noqa: E402
from .tools import AVAILABLE_TOOLS  # noqa: E402

router = APIRouter(prefix="/agent")

# Jinja2 environment for loading prompt templates
_prompts_dir = os.path.join(os.path.dirname(__file__), "..", "prompts")
_jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(_prompts_dir),
    autoescape=True,
    keep_trailing_newline=True,
)

# Global MCP session storage
mcp_sessions: Dict[str, ClientSession] = {}
mcp_contexts: Dict[str, Any] = {}


async def connect_to_mcp_server() -> Optional[ClientSession]:
    """Connect to the MCP server if not already connected."""
    # Check if we have an existing session and if it's still alive
    if "mcp" in mcp_sessions:
        session = mcp_sessions["mcp"]
        try:
            # Ping the session to check if it's still alive
            await session.list_tools()
            logger.debug("MCP session is healthy, reusing existing connection")
            return session
        except Exception as e:
            logger.warning(f"MCP session unhealthy, reconnecting: {e}")
            # Clean up dead session
            mcp_sessions.pop("mcp", None)
            if "mcp" in mcp_contexts:
                try:
                    await mcp_contexts["mcp"].__aexit__(None, None, None)
                except Exception:
                    pass
                mcp_contexts.pop("mcp", None)

    try:
        mcp_server_path = os.path.join(os.path.dirname(__file__), "..", "mcp_server.py")
        if not os.path.exists(mcp_server_path):
            logger.error(f"MCP server not found at: {mcp_server_path}")
            return None

        server = StdioServerParameters(command=sys.executable, args=[mcp_server_path], env=dict(os.environ))

        logger.info(f"Starting MCP server from: {mcp_server_path}")
        context = stdio_client(server)
        read, write = await context.__aenter__()
        mcp_contexts["mcp"] = context

        session = ClientSession(read, write)
        await session.__aenter__()
        await session.initialize()

        mcp_sessions["mcp"] = session
        logger.info("Connected to MCP server successfully")
        return session
    except Exception as e:
        logger.error(f"Failed to connect to MCP server: {e}", exc_info=True)
        return None


# Configure OpenAI client (using defaults)
def get_openai_client(api_key: str) -> AsyncOpenAI:
    """Create OpenAI client with default settings."""
    return AsyncOpenAI(api_key=api_key)
    # Default timeout: 600s (10 minutes)
    # Default max_retries: 2


# ---------------------------------------------------------------------------
# In-memory conversation cache keyed by session_id.
# Uses an OrderedDict for simple LRU eviction.
# ---------------------------------------------------------------------------
CACHE_MAX_SIZE = 200
CACHE_TTL_SECONDS = 30 * 60  # 30 minutes

# Each entry: {"trajectory": [...], "display_messages": [...], "last_access": float}
_session_cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()


def _cache_get(session_id: str) -> Optional[Dict[str, Any]]:
    """Get a session from the cache, updating access time."""
    entry = _session_cache.get(session_id)
    if entry is None:
        return None
    if time.time() - entry["last_access"] > CACHE_TTL_SECONDS:
        _session_cache.pop(session_id, None)
        return None
    entry["last_access"] = time.time()
    _session_cache.move_to_end(session_id)
    return entry


def _cache_put(session_id: str, trajectory: List, display_messages: List) -> None:
    """Store a session in the cache, evicting oldest if needed."""
    _session_cache[session_id] = {
        "trajectory": trajectory,
        "display_messages": display_messages,
        "last_access": time.time(),
    }
    _session_cache.move_to_end(session_id)
    # Evict oldest entries if cache exceeds max size
    while len(_session_cache) > CACHE_MAX_SIZE:
        _session_cache.popitem(last=False)


# Legacy in-memory conversation history (kept for backward compat with old /history endpoint)
conversation_state: Dict[str, List[Dict[str, Any]]] = {}
MAX_HISTORY = 10


async def get_current_user(authorization: str = Header(None), token_param: Optional[str] = Query(None, alias="token")):
    """Extract user from Authorization header or token query parameter.

    EventSource doesn't support custom headers, so we need to accept token via query param
    as a fallback for Capacitor/native apps.
    """
    token = None

    # First try Authorization header (preferred)
    if authorization:
        try:
            scheme, token = authorization.split()
            if scheme.lower() != "bearer":
                raise HTTPException(status_code=401, detail="Invalid authentication scheme")
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid authorization header format")

    # Fallback to query parameter (for EventSource compatibility)
    elif token_param:
        token = token_param

    # No authentication provided
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required: provide Bearer token in Authorization header or token query parameter",  # noqa: E501
        )

    # Verify the session token
    user_info = await verify_session(token)
    user_info["token"] = token  # Add token to user info for logout
    return user_info


def estimate_token_count(messages: List[Dict[str, Any]], tools: Optional[List[Dict[str, Any]]] = None) -> int:
    """Rough estimate of token count for messages and tools."""
    # Very rough approximation: ~4 characters per token on average
    total_chars = 0

    # Count message tokens
    for msg in messages:
        if isinstance(msg.get("content"), str):
            total_chars += len(msg["content"])
        if msg.get("tool_calls"):
            total_chars += len(json.dumps(msg["tool_calls"]))

    # Count tool schema tokens (these are sent with every request)
    if tools:
        total_chars += len(json.dumps(tools))

    estimated_tokens = total_chars // 4
    return estimated_tokens


def format_sse_message(event: str, data: dict) -> str:
    """Format message for Server-Sent Events."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _format_tool_display(tool_name: str, args: dict, result: dict) -> str:
    """Build the display string for a tool call (mirrors frontend formatResult)."""

    def fmt_args(a: dict) -> str:
        if not a:
            return ""
        readable = ", ".join(f"{k}: {v}" for k, v in a.items())
        return f"({readable})"

    def fmt_result(d: dict) -> str:
        if d.get("ok") is False:
            return f"❌ {d.get('error', 'Error')}"
        if "tasks" in d:
            return f"✅ Found {len(d['tasks'])} tasks"
        if "results" in d:
            return f"🔍 Found {len(d['results'])} results"
        if "entries" in d:
            return f"📖 Found {len(d['entries'])} journal entries"
        if "entry" in d:
            entry = d["entry"]
            return f"📖 Journal entry from {entry['date']}" if entry else "📖 No journal entry found"
        if "memory" in d:
            mem = d["memory"]
            return f"🧠 Saved: {mem.get('key', '')} = {mem.get('value', '')}"
        if "memories" in d:
            return f"🧠 Found {d.get('count', len(d['memories']))} memories"
        if "deleted_key" in d:
            return f"🧠 Forgot: {d['deleted_key']}"
        return "✅ Success"

    return f"🔧 {tool_name}{fmt_args(args)}: {fmt_result(result)}"


async def _persist_turn(
    session_id: str,
    user_id: str,
    space_id: Optional[str],
    user_message: str,
    content_parts: List[str],
    input_messages: List[Dict[str, Any]],
    display_messages: List[Dict[str, Any]],
) -> None:
    """Save trajectory, display messages, and legacy chat entries after a turn."""
    assistant_text = "".join(content_parts)
    if assistant_text:
        display_messages.append({"role": "assistant", "content": assistant_text})

    # Save to new session storage
    await save_trajectory(session_id, user_id, input_messages, display_messages)
    _cache_put(session_id, input_messages, display_messages)

    # Also save to legacy chats collection for backward compatibility
    user_entry = ChatMessage(user_id=user_id, space_id=space_id, role="user", content=user_message)
    assistant_entry = ChatMessage(user_id=user_id, space_id=space_id, role="assistant", content=assistant_text)
    await save_chat_message(user_entry)
    await save_chat_message(assistant_entry)

    # Update legacy in-memory state
    key = f"{user_id}:{space_id}" if space_id else user_id
    history = conversation_state.get(key, [])
    history.extend(
        [
            {"role": "user", "content": user_message},
            {"role": "assistant", "content": assistant_text},
        ]
    )
    conversation_state[key] = history[-10:]


async def stream_agent_response(
    user_message: str,
    user_id: str,
    space_id: Optional[str] = None,
    user_name: Optional[str] = None,
    session_id: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Stream agent responses with sequential tool execution and summarization."""

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        error_data = {"message": "OpenAI API key not configured"}
        yield format_sse_message("error", error_data)
        return

    # Connect to MCP server
    mcp_session = await connect_to_mcp_server()
    mcp_tools = {}

    if mcp_session:
        try:
            tools_response = await mcp_session.list_tools()
            for tool in tools_response.tools:
                # Add MCP tools in Responses API format (flat structure)
                mcp_tools[tool.name] = {
                    "type": "function",
                    "name": tool.name,
                    "description": tool.description or f"MCP tool: {tool.name}",
                    "parameters": tool.inputSchema
                    if hasattr(tool, "inputSchema")
                    else {"type": "object", "properties": {}, "required": []},
                }
            logger.info(f"Discovered {len(mcp_tools)} MCP tools")
        except Exception as e:
            logger.error(f"Failed to list MCP tools: {e}")

    client = get_openai_client(api_key)
    # Combine native tools with MCP tools (both already in Responses API format)
    tools = list(OPENAI_TOOL_SCHEMAS.values()) + list(mcp_tools.values())

    # -----------------------------------------------------------------------
    # Session handling: create or resume
    # -----------------------------------------------------------------------
    is_new_session = session_id is None
    todo_context = ""

    if is_new_session:
        session_id = await create_session(user_id, space_id, user_message)
        logger.info(f"Created new session {session_id}")
        input_messages: list[dict[str, Any]] = []
        display_messages: list[dict[str, Any]] = []
    else:
        assert session_id is not None
        # Try in-memory cache first, then DB
        cached = _cache_get(session_id)
        if cached:
            input_messages = list(cached["trajectory"])
            display_messages = list(cached["display_messages"])
            logger.info(f"Loaded session {session_id} from cache ({len(input_messages)} trajectory items)")
        else:
            traj_doc = await get_session_trajectory(session_id, user_id)
            if not traj_doc:
                yield format_sse_message("error", {"message": "Session not found"})
                return
            input_messages = list(traj_doc.get("trajectory", []))
            display_messages = list(traj_doc.get("display_messages", []))
            logger.info(f"Loaded session {session_id} from DB ({len(input_messages)} trajectory items)")

            # If session is linked to a todo, fetch task context
            todo_id = traj_doc.get("todo_id")
            if todo_id:
                try:
                    from bson import ObjectId as _ObjId
                    from db import collections

                    todo_doc = await collections.todos.find_one({"_id": _ObjId(todo_id)})
                    if todo_doc:
                        task_text = todo_doc.get("text", "")
                        task_notes = todo_doc.get("notes", "")
                        task_category = todo_doc.get("category", "")
                        task_priority = todo_doc.get("priority", "")
                        task_due = todo_doc.get("dueDate", "")
                        todo_context = f"\n\nYou are discussing a specific task:\n- Task: {task_text}"
                        if task_notes:
                            todo_context += f"\n- Notes: {task_notes}"
                        if task_category:
                            todo_context += f"\n- Category: {task_category}"
                        if task_priority:
                            todo_context += f"\n- Priority: {task_priority}"
                        if task_due:
                            todo_context += f"\n- Due: {task_due}"
                        todo_context += (
                            f"\n\nThis task ALREADY EXISTS (ID: {todo_id}) — do NOT"
                            " create a duplicate."
                            " The user is chatting about this specific"
                            " task and wants help working on it."
                            " You can: answer questions, give advice,"
                            f" update this task (use update_task with ID {todo_id}),"
                            " or break it into sub-tasks (use add_task with"
                            f' parent_id="{todo_id}").'
                            " When creating sub-tasks, each one should be a"
                            " concrete, actionable step with clear notes."
                            " Sub-tasks execute in linear order — completing"
                            " all sub-tasks auto-completes the parent."
                            " Each sub-task gets its own session for an agent"
                            " to work on."
                        )
                except Exception as e:
                    logger.error(f"Failed to fetch todo context: {e}")

    assert session_id is not None  # guaranteed after create or resume

    tool_names = list(OPENAI_TOOL_SCHEMAS.keys()) + list(mcp_tools.keys())
    ready_data = {"ok": True, "tools": tool_names, "space_id": space_id, "session_id": session_id}
    yield format_sse_message("ready", ready_data)

    # -----------------------------------------------------------------------
    # Build developer instructions (regenerated each turn, never stored)
    # -----------------------------------------------------------------------
    from datetime import datetime

    from bson import ObjectId
    from categories import get_categories
    from db import collections

    current_date = datetime.now().strftime("%A, %B %d, %Y")

    # Fetch space info and categories
    space_name = "Default"
    if space_id:
        try:
            space_doc = await collections.spaces.find_one({"_id": ObjectId(space_id)})
            if space_doc:
                space_name = space_doc.get("name", "Default")
        except Exception:
            pass  # Keep default space name if lookup fails

    categories = await get_categories(space_id)
    category_names = categories if categories else ["General"]
    categories_str = ", ".join(category_names)

    # Build context with user name if available
    user_context = f"You are helping {user_name}.\n" if user_name else ""

    # Build memory context
    memory_context = ""
    try:
        from agent_memory import build_memory_context

        memory_context = await build_memory_context(user_id, space_id)
    except Exception as e:
        logger.error(f"Failed to build memory context: {e}")

    developer_instructions = _jinja_env.get_template("agent_developer_instructions.j2").render(
        current_date=current_date,
        user_context=user_context,
        space_name=space_name,
        categories_str=categories_str,
        todo_context=todo_context,
        memory_context=memory_context,
    )

    # -----------------------------------------------------------------------
    # Append user message to trajectory + display_messages
    # -----------------------------------------------------------------------
    input_messages.append({"role": "user", "content": user_message})
    display_messages.append({"role": "user", "content": user_message})

    try:
        api_call_count = 0
        total_input_tokens = 0
        total_output_tokens = 0
        MAX_AGENT_STEPS = 10  # Maximum number of agent steps (tool calls + responses)

        while api_call_count < MAX_AGENT_STEPS:
            api_call_count += 1

            # Log token estimate before API call
            estimated_tokens = estimate_token_count(input_messages, tools)
            logger.info(
                f"API Call #{api_call_count} - Input messages: {len(input_messages)}, "
                f"Estimated tokens: {estimated_tokens}"
            )

            # Make API call
            try:
                stream = await client.responses.create(
                    model="gpt-5.2",
                    instructions=developer_instructions,
                    input=input_messages,
                    tools=tools,
                    stream=True,
                )
            except Exception as api_error:
                logger.error(f"OpenAI API Error: {type(api_error).__name__}: {api_error}")
                yield format_sse_message(
                    "error", {"message": "An error occurred while processing your request. Please try again."}
                )
                return

            partial_tool_calls: Dict[str, Dict[str, str]] = {}  # Key by tool call ID
            content_parts: list[str] = []
            current_tool_call_id = None

            async for event in stream:
                event_type = event.type if hasattr(event, "type") else None

                # Handle completed event for usage stats
                if event_type == "response.completed":
                    try:
                        total_input_tokens += event.response.usage.input_tokens
                        total_output_tokens += event.response.usage.output_tokens
                        logger.info(
                            f"API Call #{api_call_count} - Usage: "
                            f"Input: {event.response.usage.input_tokens}, "
                            f"Output: {event.response.usage.output_tokens}, "
                            f"Total: {event.response.usage.total_tokens}"
                        )
                    except Exception as e:
                        logger.error(f"Error accessing usage data: {e}", exc_info=True)
                        logger.error(f"Event type: {type(event)}, Event: {event}")

                # Handle text content deltas
                elif event_type == "response.output_text.delta":
                    if hasattr(event, "delta"):
                        token = event.delta
                        content_parts.append(token)
                        yield format_sse_message("token", {"token": token})

                # Handle function call arguments streaming
                elif event_type == "response.function_call_arguments.delta":
                    if hasattr(event, "item_id"):
                        current_tool_call_id = event.item_id
                        if current_tool_call_id not in partial_tool_calls:
                            partial_tool_calls[current_tool_call_id] = {
                                "id": current_tool_call_id,
                                "name": "",
                                "arguments": "",
                            }
                    if hasattr(event, "delta") and current_tool_call_id:
                        partial_tool_calls[current_tool_call_id]["arguments"] += event.delta

                # Handle function call completion - get the name from output_item.done
                elif event_type == "response.output_item.done":
                    if hasattr(event, "item") and hasattr(event.item, "type"):
                        if event.item.type == "function_call":
                            # This event has the complete tool call info
                            call_id = event.item.id
                            if call_id in partial_tool_calls:
                                partial_tool_calls[call_id]["name"] = event.item.name
                                partial_tool_calls[call_id]["arguments"] = event.item.arguments
                                partial_tool_calls[call_id]["call_id"] = event.item.call_id

            if partial_tool_calls:
                tool_names_executing = [p["name"] for p in partial_tool_calls.values() if p.get("name")]
                logger.info(f"Executing {len(partial_tool_calls)} tools: {', '.join(tool_names_executing)}")

                # Append assistant's message with function calls to input (like response.output)
                assistant_output_items = []

                # Add text output if any
                if content_parts:
                    assistant_output_items.append(
                        {
                            "type": "message",
                            "role": "assistant",
                            "content": [{"type": "output_text", "text": "".join(content_parts)}],
                        }
                    )

                # Add function call items
                for call_id, partial in partial_tool_calls.items():
                    assistant_output_items.append(
                        {
                            "type": "function_call",
                            "call_id": partial.get("call_id", call_id),
                            "name": partial["name"],
                            "arguments": partial["arguments"],
                        }
                    )

                # Append assistant's output to input
                input_messages.extend(assistant_output_items)

                # Execute tools and collect outputs
                for call_id, partial in partial_tool_calls.items():
                    tool_name = partial["name"]
                    # call_id is already the key from the dictionary
                    try:
                        args = json.loads(partial["arguments"] or "{}")

                        # Check if it's an MCP tool or native tool
                        if tool_name in mcp_tools and mcp_session:
                            # Call MCP tool
                            mcp_result = await mcp_session.call_tool(tool_name, arguments=args)
                            if hasattr(mcp_result, "content"):
                                if isinstance(mcp_result.content, list) and len(mcp_result.content) > 0:
                                    content = (
                                        mcp_result.content[0].text
                                        if hasattr(mcp_result.content[0], "text")
                                        else str(mcp_result.content[0])
                                    )
                                else:
                                    content = str(mcp_result.content)

                                try:
                                    result = json.loads(content) if isinstance(content, str) else content
                                except (json.JSONDecodeError, ValueError):
                                    result = {"result": content}
                            else:
                                result = {"result": str(mcp_result)}
                        elif tool_name in AVAILABLE_TOOLS:
                            info = AVAILABLE_TOOLS[tool_name]
                            request = info["schema"](**args)
                            result = await info["func"](request=request, user_id=user_id, space_id=space_id)
                        else:
                            result = {"ok": False, "error": f"Unknown tool: {tool_name}"}
                    except Exception as e:
                        logger.error(f"Error executing tool {tool_name}: {e}", exc_info=True)
                        result = {"ok": False, "error": str(e)}

                    yield format_sse_message("tool_result", {"tool": tool_name, "args": args, "data": result})

                    # Build display message for this tool call
                    tool_display = _format_tool_display(tool_name, args, result)
                    display_messages.append(
                        {
                            "role": "system",
                            "content": tool_display,
                            "toolData": {"tool": tool_name, "args": args, "data": result},
                        }
                    )

                    # Use call_id from the event, not the item id
                    actual_call_id = partial.get("call_id", call_id)
                    logger.info(f"Adding function_call_output with call_id: {actual_call_id}")
                    # Append function call output to input (like official example)
                    input_messages.append(
                        {
                            "type": "function_call_output",
                            "call_id": actual_call_id,
                            "output": json.dumps(result),
                        }
                    )

                continue

            # No more tool calls - we have final response
            # Append final assistant message to maintain conversation state
            if content_parts and not partial_tool_calls:
                input_messages.append(
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "".join(content_parts)}],
                    }
                )

            # Log final token summary
            logger.info(
                f"Conversation complete - Total API calls: {api_call_count}, "
                f"Total input tokens: {total_input_tokens}, "
                f"Total output tokens: {total_output_tokens}, "
                f"Total tokens: {total_input_tokens + total_output_tokens}"
            )

            # Persist BEFORE yielding done — the client closes the connection
            # on "done", which can cancel the generator before post-yield code runs.
            await _persist_turn(
                session_id,
                user_id,
                space_id,
                user_message,
                content_parts,
                input_messages,
                display_messages,
            )

            yield format_sse_message("done", {"ok": True})
            break

        # If we exit the loop due to max steps, force a final response
        if api_call_count >= MAX_AGENT_STEPS:
            logger.warning(f"Reached maximum agent steps ({MAX_AGENT_STEPS}), generating final response")

            # Add final instruction to wrap up
            final_instruction = (
                "You've reached the maximum number of steps. "
                "Please provide a comprehensive final answer based on the information gathered so far."
            )

            try:
                stream = await client.responses.create(
                    model="gpt-5.2",
                    instructions=f"{developer_instructions}\n\n{final_instruction}",
                    input=input_messages,
                    tools=None,  # No tools for final response
                    stream=True,
                )
            except Exception as api_error:
                logger.error(f"OpenAI API Error (final response): {type(api_error).__name__}: {api_error}")
                yield format_sse_message(
                    "error", {"message": "An error occurred while processing your request. Please try again."}
                )
                return

            async for event in stream:
                event_type = event.type if hasattr(event, "type") else None

                if event_type == "response.output_text.delta":
                    if hasattr(event, "delta"):
                        token = event.delta
                        content_parts.append(token)
                        yield format_sse_message("token", {"token": token})

                # Track usage
                elif event_type == "response.completed":
                    try:
                        total_input_tokens += event.response.usage.input_tokens
                        total_output_tokens += event.response.usage.output_tokens
                    except Exception as e:
                        logger.error(f"Error accessing usage data in final response: {e}", exc_info=True)

            # Persist before yielding done
            await _persist_turn(
                session_id,
                user_id,
                space_id,
                user_message,
                content_parts,
                input_messages,
                display_messages,
            )

            yield format_sse_message("done", {"ok": True, "info": f"Reached maximum of {MAX_AGENT_STEPS} agent steps"})

    except Exception as e:
        error_msg = str(e)
        # Provide more user-friendly message for rate limiting
        if "429" in error_msg or "rate" in error_msg.lower():
            error_msg = (
                "OpenAI API rate limit reached. The system will automatically retry. "
                "If this persists, please try again in a few moments."
            )
        yield format_sse_message("error", {"message": error_msg})


@router.get("/sessions")
async def list_chat_sessions(
    space_id: Optional[str] = Query(None, description="Space ID"),
    current_user: dict = Depends(get_current_user),
):
    """List chat sessions for dropdown (lightweight metadata only)."""
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")
    return await list_sessions(user_id, space_id)


@router.get("/sessions/pending")
async def get_pending_sessions_route(
    space_id: Optional[str] = Query(None),
    agent_id: Optional[str] = Query(None, description="Filter by agent_id; omit for unclaimed only"),
    current_user: dict = Depends(get_current_user),
):
    """Get sessions awaiting agent response."""
    return await get_pending_sessions(current_user["user_id"], space_id, agent_id)


@router.get("/sessions/unread-todos")
async def get_unread_todos_route(
    space_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Get todo IDs with unread agent replies."""
    todo_ids = await get_unread_todo_ids(current_user["user_id"], space_id)
    return {"todo_ids": todo_ids}


@router.get("/sessions/todo-statuses")
async def get_todo_statuses_route(
    space_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Get session status per todo (waiting/processing/unread_reply)."""
    return await get_todo_session_statuses(current_user["user_id"], space_id)


@router.get("/sessions/by-todo/{todo_id}")
async def get_session_by_todo_route(
    todo_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Find the session linked to a specific todo."""
    session = await find_session_by_todo(current_user["user_id"], todo_id)
    if not session:
        raise HTTPException(status_code=404, detail="No session found for this todo")
    return session


@router.get("/sessions/{session_id}")
async def get_chat_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Load a specific past session for rendering and resuming."""
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    result = await get_session_trajectory(session_id, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.delete("/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a single chat session."""
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    deleted = await delete_session(session_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")

    # Also remove from cache
    _session_cache.pop(session_id, None)
    return {"ok": True}


@router.get("/stream")
async def agent_stream(
    q: str = Query(..., description="User query"),
    space_id: Optional[str] = Query(None, description="Space ID"),
    session_id: Optional[str] = Query(None, description="Session ID to resume; omit for new session"),
    user_data: dict = Depends(get_current_user),
):
    """Stream agent responses with tool calls via Server-Sent Events."""

    user_id = user_data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    user_name = user_data.get("first_name")

    # Create async generator
    async def generate():
        async for chunk in stream_agent_response(q, user_id, space_id, user_name, session_id):
            yield chunk

    # Return streaming response
    headers = {"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}  # For nginx
    return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)
