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
AGENT_SYSTEM_PROMPT = """You are an AI assistant with access to tools for managing tasks, journals, and weather.

You may call multiple tools in sequence to gather information and take actions for the user. Think through
what data you need before responding and use the available tools to collect it. For example, when asked for
book recommendations, first search the user's journals and tasks from the past month to understand their
activities, then call get_book_recommendations.

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
7. When user wants book recommendations → search journals and tasks from the last month then
   call get_book_recommendations

Use the tools to provide real, actionable results rather than describing hypothetical actions. After finishing
all necessary tool calls, conclude with a concise human-readable summary that clearly answers the user's request.
"""


def format_sse_message(event: str, data: dict) -> str:
    """Format message for Server-Sent Events."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_agent_response(
    user_message: str, user_id: str, space_id: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """Stream agent responses with sequential tool execution."""

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        error_data = {"message": "OpenAI API key not configured"}
        yield format_sse_message("error", error_data)
        return

    client = AsyncOpenAI(api_key=api_key)
    tools = [{"type": "function", "function": schema} for schema in OPENAI_TOOL_SCHEMAS.values()]
    ready_data = {"ok": True, "tools": list(OPENAI_TOOL_SCHEMAS.keys()), "space_id": space_id}
    yield format_sse_message("ready", ready_data)

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    try:
        while True:
            stream = await client.chat.completions.create(
                model="gpt-4.1", messages=messages, tools=tools, stream=True, temperature=0.7
            )

            partial_tool_calls: Dict[int, Dict[str, str]] = {}
            content_parts: list[str] = []

            async for chunk in stream:
                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    continue

                if choice.delta.content:
                    token = choice.delta.content
                    content_parts.append(token)
                    yield format_sse_message("token", {"token": token})

                if choice.delta.tool_calls:
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
                        if tool_name in AVAILABLE_TOOLS:
                            info = AVAILABLE_TOOLS[tool_name]
                            request = info["schema"](**args)
                            result = await info["func"](request=request, user_id=user_id, space_id=space_id)
                        else:
                            result = {"ok": False, "error": f"Unknown tool: {tool_name}"}
                    except Exception as e:
                        result = {"ok": False, "error": str(e)}

                    yield format_sse_message("tool_result", {"tool": tool_name, "data": result})
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call_id,
                            "name": tool_name,
                            "content": json.dumps(result),
                        }
                    )

                continue

            messages.append({"role": "assistant", "content": "".join(content_parts)})
            yield format_sse_message("done", {"ok": True})
            break

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
