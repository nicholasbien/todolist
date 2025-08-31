"""Main agent module with OpenAI integration and streaming support."""

import json
import os
import sys
from typing import Any, AsyncGenerator, Dict, List, Optional

# Add parent directory to path for imports  # noqa: E402
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from auth import verify_session  # noqa: E402
from fastapi import APIRouter, Depends, Header, HTTPException, Query  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from openai import AsyncOpenAI  # noqa: E402

from .schemas import OPENAI_TOOL_SCHEMAS  # noqa: E402
from .tools import AVAILABLE_TOOLS  # noqa: E402

router = APIRouter(prefix="/agent")

# In-memory conversation history keyed by user and space
conversation_state: Dict[str, List[Dict[str, Any]]] = {}


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
recommendations.

You can call multiple tools in sequence to gather information before providing comprehensive responses.
Be proactive in using tools to personalize your responses based on the user's data.

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
- get_book_recommendations: get book suggestions by subject/genre
- get_inspirational_quotes: get motivational quotes for productivity/self-care/resilience

Personalization Strategy:
For recommendations (books, quotes, etc.), first call list_tasks and read_journal_entry to understand:
- What the user is currently working on
- Their interests and goals from recent tasks/journals
- Their activity patterns and preferences
Then provide tailored suggestions based on this context.

Always use tools when they can help. After all tool calls complete, provide a concise summary
addressing the user's request."""


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

    client = AsyncOpenAI(api_key=api_key)
    tools = [{"type": "function", "function": schema} for schema in OPENAI_TOOL_SCHEMAS.values()]
    ready_data = {"ok": True, "tools": list(OPENAI_TOOL_SCHEMAS.keys()), "space_id": space_id}
    yield format_sse_message("ready", ready_data)

    # Load conversation history for this user/space
    key = f"{user_id}:{space_id}" if space_id else user_id
    history = conversation_state.get(key, [])

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": user_message},
    ]

    try:
        while True:
            stream = await client.chat.completions.create(
                model="gpt-4.1", messages=messages, tools=tools, stream=True, temperature=0.7
            )

            partial_tool_calls: Dict[int, Dict[str, str]] = {}
            content_parts: list[str] = []
            tool_calls_made = False

            async for chunk in stream:
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
                        if tool_name in AVAILABLE_TOOLS:
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

            yield format_sse_message("done", {"ok": True})
            break

        # Update conversation history
        history.extend(
            [
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": "".join(content_parts)},
            ]
        )
        conversation_state[key] = history[-10:]

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
