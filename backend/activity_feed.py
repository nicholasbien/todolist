"""Activity feed aggregation — collects events from todos, sessions, and journals
into a single chronological timeline."""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from db import db

logger = logging.getLogger(__name__)

todos_collection = db.todos
sessions_collection = db.chat_sessions
trajectories_collection = db.chat_trajectories
journals_collection = db.journals


async def get_activity_feed(
    user_id: str,
    space_id: Optional[str] = None,
    limit: int = 50,
    before: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Aggregate activity events from multiple data sources.

    Returns a list of events sorted by timestamp (newest first).
    Each event has: type, timestamp, title, detail, and optional metadata.

    ``before`` is an ISO-8601 timestamp for cursor-based pagination.
    """
    events: List[Dict[str, Any]] = []

    cutoff = None
    if before:
        try:
            cutoff = datetime.fromisoformat(before.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            cutoff = None

    # ---- 1. Todo events (created + completed) ----
    todo_query: Dict[str, Any] = {"user_id": user_id}
    if space_id is not None:
        todo_query["space_id"] = space_id
    # Exclude subtasks from the feed — they clutter it
    todo_query["$or"] = [
        {"parent_id": {"$exists": False}},
        {"parent_id": None},
    ]

    try:
        cursor = todos_collection.find(todo_query).sort("dateAdded", -1).limit(limit * 2)
        todos = await cursor.to_list(length=limit * 2)

        for todo in todos:
            todo_id = str(todo["_id"])
            created_at = todo.get("dateAdded", "")
            # Task creation event
            ts = _parse_date(created_at)
            if ts and (cutoff is None or ts < cutoff):
                creator = "agent" if todo.get("creator_type") == "agent" else "user"
                events.append(
                    {
                        "type": "task_created",
                        "timestamp": ts.isoformat(),
                        "title": todo.get("text", "Untitled task"),
                        "detail": f"Task created by {creator}",
                        "category": todo.get("category", "General"),
                        "priority": todo.get("priority", "Medium"),
                        "todo_id": todo_id,
                    }
                )

            # Task completion event
            if todo.get("completed") and todo.get("dateCompleted"):
                completed_ts = _parse_date(todo["dateCompleted"])
                if completed_ts and (cutoff is None or completed_ts < cutoff):
                    events.append(
                        {
                            "type": "task_completed",
                            "timestamp": completed_ts.isoformat(),
                            "title": todo.get("text", "Untitled task"),
                            "detail": "Task completed",
                            "category": todo.get("category", "General"),
                            "todo_id": todo_id,
                        }
                    )
    except Exception as e:
        logger.error(f"Error fetching todo events: {e}")

    # ---- 2. Session / agent message events ----
    session_query: Dict[str, Any] = {"user_id": user_id}
    if space_id is not None:
        session_query["space_id"] = space_id

    try:
        cursor = sessions_collection.find(session_query).sort("updated_at", -1).limit(limit)
        sessions = await cursor.to_list(length=limit)

        session_ids = [str(s["_id"]) for s in sessions]
        session_map = {str(s["_id"]): s for s in sessions}

        # Batch-fetch trajectories for these sessions
        traj_cursor = trajectories_collection.find(
            {"session_id": {"$in": session_ids}},
            {"session_id": 1, "display_messages": 1},
        )
        trajectories = await traj_cursor.to_list(length=len(session_ids))
        traj_map = {t["session_id"]: t for t in trajectories}

        for session_id, session in session_map.items():
            traj = traj_map.get(session_id)
            if not traj:
                continue
            messages = traj.get("display_messages", [])
            session_title = session.get("title", "Chat session")

            for msg in messages:
                msg_ts = _parse_date(msg.get("timestamp", ""))
                if not msg_ts:
                    continue
                if cutoff is not None and msg_ts >= cutoff:
                    continue

                role = msg.get("role", "")
                content = msg.get("content", "")
                agent_id = msg.get("agent_id")

                if role == "user":
                    events.append(
                        {
                            "type": "message_user",
                            "timestamp": msg_ts.isoformat(),
                            "title": session_title,
                            "detail": _truncate(content, 150),
                            "session_id": session_id,
                            "todo_id": session.get("todo_id"),
                        }
                    )
                elif role == "assistant":
                    events.append(
                        {
                            "type": "message_agent",
                            "timestamp": msg_ts.isoformat(),
                            "title": session_title,
                            "detail": _truncate(content, 150),
                            "session_id": session_id,
                            "todo_id": session.get("todo_id"),
                            "agent_id": agent_id,
                        }
                    )
    except Exception as e:
        logger.error(f"Error fetching session events: {e}")

    # ---- 3. Journal entries ----
    journal_query: Dict[str, Any] = {"user_id": user_id}
    if space_id is not None:
        journal_query["space_id"] = space_id

    try:
        cursor = journals_collection.find(journal_query).sort("date", -1).limit(limit)
        journals = await cursor.to_list(length=limit)

        for entry in journals:
            # Use updated_at or created_at as the event timestamp
            ts = entry.get("updated_at") or entry.get("created_at")
            if isinstance(ts, str):
                ts = _parse_date(ts)
            if not ts:
                # Fall back to parsing the date field
                ts = _parse_date(entry.get("date", "") + "T00:00:00")
            if ts and (cutoff is None or ts < cutoff):
                events.append(
                    {
                        "type": "journal_entry",
                        "timestamp": ts.isoformat(),
                        "title": f"Journal — {entry.get('date', 'Unknown date')}",
                        "detail": _truncate(entry.get("text", ""), 150),
                        "journal_id": str(entry["_id"]),
                        "date": entry.get("date"),
                    }
                )
    except Exception as e:
        logger.error(f"Error fetching journal events: {e}")

    # Sort all events by timestamp descending and trim
    events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return events[:limit]


def _parse_date(value: Any) -> Optional[datetime]:
    """Parse a date string or datetime object into a UTC-aware datetime.

    All returned datetimes are timezone-aware (UTC) so that .isoformat()
    produces a suffix like ``+00:00`` and JavaScript ``new Date()`` parses
    the timestamp correctly instead of treating it as local time.
    """
    if isinstance(value, datetime):
        # If the datetime is naive (no tzinfo), assume it's UTC
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if not isinstance(value, str) or not value:
        return None
    # Try common formats
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            dt = datetime.strptime(value.split("+")[0].rstrip("Z"), fmt)
            # Treat parsed naive datetimes as UTC
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _truncate(text: str, max_len: int) -> str:
    """Truncate text with ellipsis."""
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."
