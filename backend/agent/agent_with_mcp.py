"""Agent with MCP integration that can search and fetch content."""

import json
import logging
import os
import sys
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from openai import AsyncOpenAI

# Add parent directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from auth import verify_session  # noqa: E402
from chats import ChatMessage, save_chat_message  # noqa: E402

from .schemas import OPENAI_TOOL_SCHEMAS  # noqa: E402
from .tools import AVAILABLE_TOOLS  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent")

# Global MCP session storage
mcp_sessions: Dict[str, ClientSession] = {}
mcp_contexts: Dict[str, Any] = {}


async def connect_to_mcp_server() -> Optional[ClientSession]:
    """Connect to the MCP server if not already connected."""
    if "mcp" in mcp_sessions:
        return mcp_sessions["mcp"]

    try:
        server = StdioServerParameters(command=sys.executable, args=["mcp_server.py"], env=dict(os.environ))

        context = stdio_client(server)
        read, write = await context.__aenter__()
        mcp_contexts["mcp"] = context

        session = ClientSession(read, write)
        await session.__aenter__()
        await session.initialize()

        mcp_sessions["mcp"] = session
        logger.info("Connected to MCP server")
        return session
    except Exception as e:
        logger.error(f"Failed to connect to MCP server: {e}")
        return None


async def get_current_user(authorization: str = Header(None)):
    """Extract user from Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    user_info = await verify_session(token)
    user_info["token"] = token
    return user_info


def get_openai_client(api_key: str) -> AsyncOpenAI:
    """Create OpenAI client."""
    return AsyncOpenAI(api_key=api_key)


def format_sse_message(event: str, data: dict) -> str:
    """Format message for Server-Sent Events."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# Enhanced system prompt that knows about MCP tools
AGENT_SYSTEM_PROMPT = (
    "You are an AI assistant with access to tools for managing tasks, journals, "
    "weather, and web content.\n\n"
    "IMPORTANT: When you search the web and find relevant results, you should use "
    "fetch_webpage to read the actual content from those URLs to provide more detailed information.\n\n"
    "Available tools:\n"
    "- web_search: Search the web using Brave API\n"
    "- fetch_webpage: Extract full content from any URL (USE THIS after searching!)\n"
    "- fetch_json: Get JSON data from APIs\n"
    "- extract_links: Extract all links from a webpage\n"
    "- add_task, list_tasks, update_task: Task management\n"
    "- add_journal_entry, read_journal_entry: Journal management\n"
    "- get_current_weather, get_weather_forecast: Weather information\n"
    "- get_book_recommendations, get_inspirational_quotes: Recommendations\n\n"
    "WORKFLOW FOR WEB SEARCHES:\n"
    "1. Use web_search to find relevant URLs\n"
    "2. Use fetch_webpage on the most relevant results to get full content\n"
    "3. Provide a comprehensive answer based on the actual content\n\n"
    "Be proactive in fetching content from search results to give users detailed, accurate information."
)


async def stream_agent_response(
    user_message: str, user_id: str, space_id: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """Stream agent responses with MCP integration."""

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        yield format_sse_message("error", {"message": "OpenAI API key not configured"})
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

    # Combine native tools with MCP tools
    all_tools = [{"type": "function", "function": schema} for schema in OPENAI_TOOL_SCHEMAS.values()]
    all_tools.extend(mcp_tools.values())

    # Send ready message
    tool_names = list(OPENAI_TOOL_SCHEMAS.keys()) + list(mcp_tools.keys())
    yield format_sse_message("ready", {"ok": True, "tools": tool_names, "space_id": space_id})

    # Build messages
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    client = get_openai_client(api_key)

    try:
        # Create completion
        stream = await client.chat.completions.create(  # type: ignore
            model="gpt-4.1",
            messages=messages,
            tools=all_tools if all_tools else None,
            stream=True,
            temperature=0.7,
            stream_options={"include_usage": True},
        )

        partial_tool_calls: Dict[int, Dict[str, str]] = {}
        content_parts: List[str] = []

        async for chunk in stream:
            choice = chunk.choices[0] if chunk.choices else None
            if not choice:
                continue

            # Stream content
            if choice.delta.content:
                token = choice.delta.content
                content_parts.append(token)
                yield format_sse_message("token", {"token": token})

            # Accumulate tool calls
            if choice.delta.tool_calls:
                for tool_call in choice.delta.tool_calls:
                    idx = tool_call.index or 0
                    if idx not in partial_tool_calls:
                        partial_tool_calls[idx] = {"id": "", "name": "", "arguments": ""}

                    if tool_call.id:
                        partial_tool_calls[idx]["id"] = tool_call.id
                    if tool_call.function:
                        if tool_call.function.name:
                            partial_tool_calls[idx]["name"] = tool_call.function.name
                        if tool_call.function.arguments:
                            partial_tool_calls[idx]["arguments"] += tool_call.function.arguments

        # Execute tool calls
        if partial_tool_calls:
            tool_results: List[Dict[str, Any]] = []

            for partial in partial_tool_calls.values():
                tool_name = partial["name"]
                try:
                    args = json.loads(partial["arguments"] or "{}")
                    logger.info(f"Executing tool: {tool_name} with args: {args}")

                    # Check if it's an MCP tool or native tool
                    if tool_name in mcp_tools and mcp_session:
                        # Call MCP tool
                        result = await mcp_session.call_tool(tool_name, arguments=args)
                        if hasattr(result, "content"):
                            if isinstance(result.content, list) and len(result.content) > 0:
                                content = (
                                    result.content[0].text
                                    if hasattr(result.content[0], "text")
                                    else str(result.content[0])
                                )
                            else:
                                content = str(result.content)

                            try:
                                tool_result = json.loads(content) if isinstance(content, str) else content
                            except (json.JSONDecodeError, ValueError):
                                tool_result = {"result": content}
                        else:
                            tool_result = {"result": str(result)}

                    elif tool_name in AVAILABLE_TOOLS:
                        # Call native tool
                        tool_info = AVAILABLE_TOOLS[tool_name]
                        request = tool_info["schema"](**args)
                        tool_result = await tool_info["func"](request=request, user_id=user_id, space_id=space_id)
                    else:
                        tool_result = {"ok": False, "error": f"Unknown tool: {tool_name}"}

                    tool_results.append({"tool": tool_name, "args": args, "result": tool_result})

                    yield format_sse_message("tool_result", {"tool": tool_name, "args": args, "data": tool_result})

                except Exception as e:
                    logger.error(f"Error executing {tool_name}: {e}")
                    yield format_sse_message(
                        "tool_result", {"tool": tool_name, "args": args, "data": {"ok": False, "error": str(e)}}
                    )

            # Continue conversation with tool results
            if tool_results:
                # Add tool results to messages
                messages.append(
                    {
                        "role": "assistant",
                        "content": "".join(content_parts),
                        "tool_calls": [
                            {
                                "id": partial["id"] or f"call_{i}",
                                "type": "function",
                                "function": {"name": partial["name"], "arguments": partial["arguments"]},
                            }
                            for i, partial in enumerate(partial_tool_calls.values())
                        ],
                    }
                )

                for i, (partial, result) in enumerate(zip(partial_tool_calls.values(), tool_results)):  # type: ignore
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": partial["id"] or f"call_{i}",
                            "name": partial["name"],
                            "content": json.dumps(result["result"]),  # type: ignore
                        }
                    )

                # Get final response
                final_stream = await client.chat.completions.create(  # type: ignore
                    model="gpt-4.1", messages=messages, stream=True, temperature=0.7
                )

                async for chunk in final_stream:  # type: ignore
                    choice = chunk.choices[0] if chunk.choices else None
                    if choice and choice.delta.content:
                        token = choice.delta.content
                        content_parts.append(token)
                        yield format_sse_message("token", {"token": token})

        # Save conversation
        user_entry = ChatMessage(user_id=user_id, space_id=space_id, role="user", content=user_message)
        assistant_entry = ChatMessage(
            user_id=user_id, space_id=space_id, role="assistant", content="".join(content_parts)
        )
        await save_chat_message(user_entry)
        await save_chat_message(assistant_entry)

        yield format_sse_message("done", {"ok": True})

    except Exception as e:
        logger.error(f"Stream error: {e}")
        yield format_sse_message("error", {"message": str(e)})


@router.get("/stream")
async def agent_stream_endpoint(
    q: str = Query(..., description="User query"),
    space_id: Optional[str] = Query(None),
    user_data: dict = Depends(get_current_user),
):
    """Stream agent responses with MCP integration."""

    user_id = user_data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    async def generate():
        async for chunk in stream_agent_response(q, user_id, space_id):
            yield chunk

    headers = {"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)
