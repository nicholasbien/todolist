"""Main agent module with OpenAI integration and streaming support."""

import json
import os
import sys
from typing import Any, AsyncGenerator, Dict, Optional

# Add parent directory to path for imports  # noqa: E402
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from auth import verify_session  # noqa: E402
from fastapi import APIRouter, Depends, Header, HTTPException, Query  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from openai import AsyncOpenAI  # noqa: E402

from .schemas import OPENAI_TOOL_SCHEMAS  # noqa: E402
from .tools import AVAILABLE_TOOLS  # noqa: E402

router = APIRouter(prefix="/agent")


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
AGENT_SYSTEM_PROMPT = """You are an AI assistant with access to tools for managing tasks and checking weather.

You have been provided with function tools that you should use proactively to help users.

TOOL USAGE GUIDELINES:
- get_current_weather: Call when user asks about current weather conditions, temperature, or
  "what's the weather like" in any location
- get_weather_forecast: Call when user asks for multi-day weather forecast, weather predictions, or "weather this week"
- get_weather_alerts: Call when user asks about weather warnings, alerts, storms, or weather safety
- add_task: Call when user wants to add, create, or save a new task, todo, or reminder
- list_tasks: Call when user asks to see, list, show, or view their tasks or todos
- update_task: Call when user wants to mark task complete, update task text, change priority, or modify existing tasks
- add_journal_entry: Call when user wants to add journal entry, diary entry, or save notes for a specific date
- search_content: Call when user wants to search through their tasks or journal entries for specific content
- get_book_recommendations: Call when user wants book suggestions or reading recommendations

CRITICAL INSTRUCTIONS:
1. When user asks about weather → IMMEDIATELY call appropriate weather tool
2. When user wants to add task → IMMEDIATELY call add_task
3. When user wants to see tasks → IMMEDIATELY call list_tasks
4. When user wants to complete/update task → IMMEDIATELY call update_task
5. When user wants to add journal → IMMEDIATELY call add_journal_entry
6. When user wants to search → IMMEDIATELY call search_content
7. When user wants book recommendations → IMMEDIATELY call get_book_recommendations

DO NOT just describe what you could do - actually call the tools!
The tools are available as functions - use them to provide real, actionable results.
Always call tools when they can help answer the user's request.

After executing any tools, conclude with a concise human-readable summary that clearly answers the user's request.
"""


def format_sse_message(event: str, data: dict) -> str:
    """Format message for Server-Sent Events."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_agent_response(
    user_message: str, user_id: str, space_id: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """Stream agent responses with tool calls."""

    # Get OpenAI API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        error_data = {"message": "OpenAI API key not configured"}
        yield format_sse_message("error", error_data)
        return

    client = AsyncOpenAI(api_key=api_key)

    # Prepare tools for OpenAI
    tools = [{"type": "function", "function": tool_schema} for tool_schema in OPENAI_TOOL_SCHEMAS.values()]

    # Send ready event with available tools
    ready_data = {"ok": True, "tools": list(OPENAI_TOOL_SCHEMAS.keys()), "space_id": space_id}
    yield format_sse_message("ready", ready_data)

    try:
        # Create streaming chat completion
        messages = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}, {"role": "user", "content": user_message}]
        stream = await client.chat.completions.create(
            model="gpt-4.1",
            messages=messages,
            tools=tools,
            stream=True,
            temperature=0.7,
        )

        # Track partial tool calls across chunks
        partial_tool_calls: Dict[int, Dict[str, Any]] = {}
        executed_tools = []
        assistant_tool_calls = []

        async for chunk in stream:
            choice = chunk.choices[0] if chunk.choices else None
            if not choice:
                continue

            # Handle text content
            if choice.delta.content:
                yield format_sse_message("token", {"token": choice.delta.content})

            # Handle tool calls
            if choice.delta.tool_calls:
                for delta_tool_call in choice.delta.tool_calls:
                    index = delta_tool_call.index or 0

                    # Initialize partial tool call if not exists
                    if index not in partial_tool_calls:
                        partial_tool_calls[index] = {"id": "", "name": "", "arguments": ""}

                    if delta_tool_call.id:
                        partial_tool_calls[index]["id"] = delta_tool_call.id

                    # Accumulate function name
                    if delta_tool_call.function and delta_tool_call.function.name:
                        partial_tool_calls[index]["name"] = delta_tool_call.function.name

                    # Accumulate arguments
                    func = delta_tool_call.function
                    if func and func.arguments:
                        partial_tool_calls[index]["arguments"] += func.arguments

                    # Try to parse and execute if complete
                    partial = partial_tool_calls[index]
                    if partial["name"] and partial["arguments"]:
                        try:
                            args = json.loads(partial["arguments"])
                            tool_name = partial["name"]

                            if tool_name in AVAILABLE_TOOLS:
                                tool_info = AVAILABLE_TOOLS[tool_name]

                                # Validate arguments with Pydantic schema
                                request = tool_info["schema"](**args)

                                # Call the tool function
                                result = await tool_info["func"](request=request, user_id=user_id, space_id=space_id)

                                # Record tool call for follow-up completion
                                assistant_tool_calls.append(
                                    {
                                        "id": partial["id"],
                                        "type": "function",
                                        "function": {
                                            "name": tool_name,
                                            "arguments": json.dumps(args),
                                        },
                                    }
                                )
                                executed_tools.append({"id": partial["id"], "name": tool_name, "result": result})

                                # Send tool result to client
                                tool_result_data: Dict[str, Any] = {"tool": tool_name, "data": result}
                                yield format_sse_message("tool_result", tool_result_data)

                                # Clear this tool call
                                del partial_tool_calls[index]

                        except json.JSONDecodeError:
                            # JSON not complete yet, continue accumulating
                            pass
                        except Exception as e:
                            tool_error_data: Dict[str, Any] = {
                                "tool": partial.get("name", ""),
                                "data": {"ok": False, "error": str(e)},
                            }
                            yield format_sse_message("tool_result", tool_error_data)
                            del partial_tool_calls[index]

            # Handle completion
            if choice.finish_reason == "tool_calls":
                for index, partial in list(partial_tool_calls.items()):
                    if partial["name"] and partial["arguments"]:
                        try:
                            args = json.loads(partial["arguments"])
                            tool_name = partial["name"]

                            if tool_name in AVAILABLE_TOOLS:
                                tool_info = AVAILABLE_TOOLS[tool_name]
                                request = tool_info["schema"](**args)
                                result = await tool_info["func"](request=request, user_id=user_id, space_id=space_id)

                                assistant_tool_calls.append(
                                    {
                                        "id": partial["id"],
                                        "type": "function",
                                        "function": {
                                            "name": tool_name,
                                            "arguments": json.dumps(args),
                                        },
                                    }
                                )
                                executed_tools.append({"id": partial["id"], "name": tool_name, "result": result})

                                completion_tool_result: Dict[str, Any] = {
                                    "tool": tool_name,
                                    "data": result,
                                }
                                yield format_sse_message("tool_result", completion_tool_result)
                        except Exception as e:
                            completion_error_data: Dict[str, Any] = {
                                "tool": partial.get("name", ""),
                                "data": {"ok": False, "error": str(e)},
                            }
                            yield format_sse_message("tool_result", completion_error_data)

                partial_tool_calls.clear()

        # If tools were called, get final assistant response
        if executed_tools:
            followup_messages = messages + [{"role": "assistant", "content": None, "tool_calls": assistant_tool_calls}]

            for tool in executed_tools:
                followup_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool["id"],
                        "content": json.dumps(tool["result"]),
                    }
                )

            followup_stream = await client.chat.completions.create(
                model="gpt-4.1",
                messages=followup_messages,
                stream=True,
                temperature=0.7,
            )

            async for chunk in followup_stream:
                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    continue
                if choice.delta.content:
                    yield format_sse_message("token", {"token": choice.delta.content})

        # Send completion event
        yield format_sse_message("done", {"ok": True})

    except Exception as e:
        yield format_sse_message("error", {"message": str(e)})


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
