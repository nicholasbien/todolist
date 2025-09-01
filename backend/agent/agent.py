"""Main agent module with OpenAI integration and streaming support."""

import json
import logging
import os
import sys
from typing import Any, AsyncGenerator, Dict, List, Optional

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add parent directory to path for imports  # noqa: E402
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from auth import verify_session  # noqa: E402
from chats import ChatMessage, delete_chat_history, get_chat_history, save_chat_message  # noqa: E402
from fastapi import APIRouter, Depends, Header, HTTPException, Query  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from openai import AsyncOpenAI  # noqa: E402

from .schemas import OPENAI_TOOL_SCHEMAS  # noqa: E402
from .tools import AVAILABLE_TOOLS  # noqa: E402

router = APIRouter(prefix="/agent")

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


# In-memory conversation history keyed by user and space
conversation_state: Dict[str, List[Dict[str, Any]]] = {}
MAX_HISTORY = 10


async def get_current_user(authorization: str = Header(None)):
    """Extract user from Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    # Expect format: "Bearer <token>"
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    # Verify the session token
    user_info = await verify_session(token)
    user_info["token"] = token  # Add token to user info for logout
    return user_info


# System prompt for the agent
AGENT_SYSTEM_PROMPT = """You are an AI assistant with access to tools for managing tasks, journals, weather, and
web content.

CRITICAL: When you search the web, you MUST ALWAYS follow up by using fetch_webpage to read the actual content.
DO NOT just summarize search results - fetch and read the actual pages to provide detailed, accurate information.

Available tools include:
- web_search: Search the web using Brave API (returns URLs and snippets only)
- fetch_webpage: Extract full content from any URL (ALWAYS USE THIS after web_search!)
- fetch_json: Get JSON data from APIs
- extract_links: Extract all links from a webpage
- Task management, journal, weather, and recommendation tools

MANDATORY WORKFLOW FOR WEB SEARCHES:
1. Use web_search to find relevant URLs
2. ALWAYS use fetch_webpage on at least the top 2-3 most relevant results
3. Read and analyze the actual fetched content
4. Provide a comprehensive answer based on the ACTUAL CONTENT you fetched, not just search snippets

Example: If asked about "geology of Kilimanjaro":
- First: web_search for "geology of Kilimanjaro"
- Then: fetch_webpage on Wikipedia and other authoritative results
- Finally: Provide detailed answer from the fetched content

You can call multiple tools in sequence to gather information before providing comprehensive responses.
Be proactive in using tools to personalize your responses based on the user's data.

FORMATTING GUIDELINES:
- Output responses directly in markdown format (without wrapping in code blocks)
- Never start responses with ```markdown or similar code fence markers
- Use **bold** for emphasis on important points
- Use bullet points (- or *) for lists
- Use numbered lists (1. 2. 3.) for sequential steps
- Use `code formatting` for technical terms or commands
- Use headers (##) to organize longer responses
- Use tables when presenting comparative data
- Keep formatting clean and purposeful

Available tools:
- get_current_weather: current weather for any location
- get_weather_forecast: multi-day weather forecasts
- get_weather_alerts: weather warnings and alerts
- add_task: create new tasks
- list_tasks: show existing tasks (call liberally to understand user's current work)
- update_task: modify or complete tasks
- add_journal_entry: save journal entries
- read_journal_entry: read journal entries for specific dates or recent entries
- search_content: search through tasks and journal entries
- get_book_recommendations: search for books using flexible queries (subjects, authors, titles, detailed descriptions)
- get_inspirational_quotes: get motivational quotes for productivity/self-care/resilience

Personalization Strategy:
For recommendations (books, quotes, etc.), first call list_tasks and read_journal_entry to understand:
- What the user is currently working on
- Their interests and goals from recent tasks/journals
- Their activity patterns and preferences
Then provide tailored suggestions based on this context.

Always use tools when they can help. After all tool calls complete, provide a concise, well-formatted summary
addressing the user's request."""


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


async def stream_agent_response(
    user_message: str, user_id: str, space_id: Optional[str] = None
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
                # Add MCP tools with their schemas
                mcp_tools[tool.name] = {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description or f"MCP tool: {tool.name}",
                        "parameters": tool.inputSchema
                        if hasattr(tool, "inputSchema")
                        else {"type": "object", "properties": {}, "required": []},
                    },
                }
            logger.info(f"Discovered {len(mcp_tools)} MCP tools")
        except Exception as e:
            logger.error(f"Failed to list MCP tools: {e}")

    client = get_openai_client(api_key)
    # Combine native tools with MCP tools
    tools = [{"type": "function", "function": schema} for schema in OPENAI_TOOL_SCHEMAS.values()]
    tools.extend(mcp_tools.values())

    tool_names = list(OPENAI_TOOL_SCHEMAS.keys()) + list(mcp_tools.keys())
    ready_data = {"ok": True, "tools": tool_names, "space_id": space_id}
    yield format_sse_message("ready", ready_data)

    # Load conversation history for this user/space
    key = f"{user_id}:{space_id}" if space_id else user_id
    history = conversation_state.get(key)
    if history is None:
        db_history = await get_chat_history(user_id, space_id, limit=MAX_HISTORY)
        history = [{"role": m.role, "content": m.content} for m in db_history]
        conversation_state[key] = history

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": user_message},
    ]

    try:
        api_call_count = 0
        total_input_tokens = 0
        total_output_tokens = 0
        MAX_AGENT_STEPS = 10  # Maximum number of agent steps (tool calls + responses)

        while api_call_count < MAX_AGENT_STEPS:
            api_call_count += 1

            # Log token estimate before API call
            estimated_tokens = estimate_token_count(messages, tools)
            logger.info(
                f"API Call #{api_call_count} - Estimated input tokens: {estimated_tokens}, "
                f"Message count: {len(messages)}"
            )

            stream = await client.chat.completions.create(
                model="gpt-4.1",
                messages=messages,
                tools=tools,
                stream=True,
                temperature=0.7,
                stream_options={"include_usage": True},  # Request usage stats in stream
            )

            partial_tool_calls: Dict[int, Dict[str, str]] = {}
            content_parts: list[str] = []
            tool_calls_made = False

            async for chunk in stream:
                # Check for usage data in stream
                if hasattr(chunk, "usage") and chunk.usage:
                    logger.info(
                        f"API Call #{api_call_count} - Usage: "
                        f"Input tokens: {chunk.usage.prompt_tokens}, "
                        f"Output tokens: {chunk.usage.completion_tokens}"
                    )
                    total_input_tokens += chunk.usage.prompt_tokens if chunk.usage.prompt_tokens else 0
                    total_output_tokens += chunk.usage.completion_tokens if chunk.usage.completion_tokens else 0

                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    continue

                if choice.delta.content:
                    token = choice.delta.content
                    content_parts.append(token)
                    yield format_sse_message("token", {"token": token})

                if choice.delta.tool_calls:
                    tool_calls_made = True
                    for delta_tool_call in choice.delta.tool_calls:
                        index = delta_tool_call.index or 0
                        if index not in partial_tool_calls:
                            partial_tool_calls[index] = {"id": "", "name": "", "arguments": ""}

                        call = partial_tool_calls[index]
                        if delta_tool_call.id:
                            call["id"] = delta_tool_call.id
                        func = delta_tool_call.function
                        if func and func.name:
                            call["name"] = func.name
                        if func and func.arguments:
                            call["arguments"] += func.arguments

            if partial_tool_calls:
                assistant_message: Dict[str, Any] = {
                    "role": "assistant",
                    "content": "".join(content_parts),
                    "tool_calls": [],
                }

                for index, partial in partial_tool_calls.items():
                    tool_name = partial["name"]
                    arguments = partial["arguments"] or "{}"
                    call_id = partial.get("id") or str(index)
                    assistant_message["tool_calls"].append(
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {"name": tool_name, "arguments": arguments},
                        }
                    )

                messages.append(assistant_message)

                for index, partial in partial_tool_calls.items():
                    tool_name = partial["name"]
                    call_id = partial.get("id") or str(index)
                    try:
                        args = json.loads(partial["arguments"] or "{}")
                        logger.info(f"Executing tool: {tool_name} with args: {args}")

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
                        result = {"ok": False, "error": str(e)}

                    yield format_sse_message("tool_result", {"tool": tool_name, "args": args, "data": result})
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call_id,
                            "name": tool_name,
                            "content": json.dumps(result),
                        }
                    )

                continue

            # No more tool calls - we have final response
            if tool_calls_made:
                messages.append({"role": "assistant", "content": "".join(content_parts)})

            # Log final token summary
            logger.info(
                f"Conversation complete - Total API calls: {api_call_count}, "
                f"Total input tokens: {total_input_tokens}, "
                f"Total output tokens: {total_output_tokens}, "
                f"Total tokens: {total_input_tokens + total_output_tokens}"
            )

            yield format_sse_message("done", {"ok": True})
            break

        # If we exit the loop due to max steps, force a final response
        if api_call_count >= MAX_AGENT_STEPS:
            logger.warning(f"Reached maximum agent steps ({MAX_AGENT_STEPS}), generating final response")

            # Force a final response without tools
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "You've reached the maximum number of steps. "
                        "Please provide a comprehensive final answer based on the information gathered so far."
                    ),
                }
            )

            stream = await client.chat.completions.create(
                model="gpt-4.1",
                messages=messages,
                tools=None,  # No tools for final response
                stream=True,
                temperature=0.7,
                stream_options={"include_usage": True},
            )

            async for chunk in stream:
                choice = chunk.choices[0] if chunk.choices else None
                if choice and choice.delta.content:
                    token = choice.delta.content
                    content_parts.append(token)
                    yield format_sse_message("token", {"token": token})

                # Track usage
                if chunk.usage:
                    total_input_tokens += chunk.usage.prompt_tokens or 0
                    total_output_tokens += chunk.usage.completion_tokens or 0

            yield format_sse_message("done", {"ok": True, "info": f"Reached maximum of {MAX_AGENT_STEPS} agent steps"})

        # Update conversation history
        user_entry = ChatMessage(user_id=user_id, space_id=space_id, role="user", content=user_message)
        assistant_entry = ChatMessage(
            user_id=user_id, space_id=space_id, role="assistant", content="".join(content_parts)
        )
        await save_chat_message(user_entry)
        await save_chat_message(assistant_entry)

        history.extend(
            [
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": "".join(content_parts)},
            ]
        )
        conversation_state[key] = history[-10:]

    except Exception as e:
        error_msg = str(e)
        # Provide more user-friendly message for rate limiting
        if "429" in error_msg or "rate" in error_msg.lower():
            error_msg = (
                "OpenAI API rate limit reached. The system will automatically retry. "
                "If this persists, please try again in a few moments."
            )
        yield format_sse_message("error", {"message": error_msg})


@router.get("/stream")
async def agent_stream(
    q: str = Query(..., description="User query"),
    space_id: Optional[str] = Query(None, description="Space ID"),
    user_data: dict = Depends(get_current_user),
):
    """Stream agent responses with tool calls via Server-Sent Events."""

    user_id = user_data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    # Create async generator
    async def generate():
        async for chunk in stream_agent_response(q, user_id, space_id):
            yield chunk

    # Return streaming response
    headers = {"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}  # For nginx
    return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)


@router.delete("/history")
async def clear_history(
    space_id: Optional[str] = Query(None, description="Space ID"),
    current_user: dict = Depends(get_current_user),
):
    """Clear chat history for the current user and optional space."""
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    key = f"{user_id}:{space_id}" if space_id else user_id
    conversation_state.pop(key, None)
    await delete_chat_history(user_id, space_id)
    return {"ok": True}
