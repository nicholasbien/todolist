"""Chat session and trajectory storage for persistent chat history.

Sessions can be:
1. Streaming AI sessions (used by the main Assistant tab) — these have trajectories.
2. Task-linked messaging sessions (linked to a todo via todo_id) — these use
   append_message() for a simple post-and-poll pattern with agent response tracking.
"""

import logging
import math
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId

from db import db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

sessions_collection = db.chat_sessions
trajectories_collection = db.chat_trajectories
agent_responsiveness_events_collection = db.agent_responsiveness_events
agent_backlog_snapshots_collection = db.agent_backlog_snapshots

# Session management constants
MAX_ACTIVE_SESSIONS = 10
SESSION_STALE_DAYS = 7
OPENCLAW_AGENT_ID = "openclaw"


def _default_openclaw_metrics_state() -> Dict[str, Any]:
    """Default per-session state used to derive openclaw responsiveness metrics."""
    return {
        "first_user_message_at": None,
        "first_agent_response_at": None,
        "first_final_agent_response_at": None,
        "current_pending_started_at": None,
        "last_user_message_at": None,
        "last_agent_response_at": None,
        "postbacks_expected": 0,
        "postbacks_completed": 0,
        "updated_at": None,
    }


def _merge_openclaw_metrics_state(existing: Any) -> Dict[str, Any]:
    """Merge stored state with defaults to handle older documents safely."""
    state = _default_openclaw_metrics_state()
    if isinstance(existing, dict):
        state.update(existing)
    return state


def _latency_ms(start: datetime, end: datetime) -> int:
    """Return a non-negative latency in whole milliseconds."""
    return max(0, int((end - start).total_seconds() * 1000))


async def _record_responsiveness_event(
    *,
    user_id: str,
    space_id: Optional[str],
    session_id: str,
    metric_name: str,
    metric_value: int,
    event_at: datetime,
) -> None:
    """Persist a single metric event row for summary aggregation."""
    await agent_responsiveness_events_collection.insert_one(
        {
            "user_id": user_id,
            "space_id": space_id,
            "session_id": session_id,
            "agent_id": OPENCLAW_AGENT_ID,
            "metric_name": metric_name,
            "metric_value": metric_value,
            "created_at": event_at,
        }
    )


async def _record_pending_backlog_snapshot(
    *,
    user_id: str,
    space_id: Optional[str],
    pending_backlog_count: int,
    snapshot_at: datetime,
) -> None:
    """Persist one deduplicated snapshot per minute of pending backlog size."""
    snapshot_minute = snapshot_at.replace(second=0, microsecond=0)
    await agent_backlog_snapshots_collection.update_one(
        {
            "user_id": user_id,
            "space_id": space_id,
            "agent_id": OPENCLAW_AGENT_ID,
            "snapshot_minute": snapshot_minute,
        },
        {
            "$set": {
                "pending_backlog_count": pending_backlog_count,
                "updated_at": snapshot_at,
            },
            "$setOnInsert": {
                "created_at": snapshot_at,
            },
        },
        upsert=True,
    )


def _utc_day_start(day_value: date) -> datetime:
    """Return a naive UTC datetime at midnight for a given date."""
    return datetime.combine(day_value, time.min)


def _percentile(values: List[int], percentile: int) -> Optional[int]:
    """Compute percentile using nearest-rank method."""
    if not values:
        return None
    sorted_values = sorted(values)
    rank = int(math.ceil((percentile / 100.0) * len(sorted_values)))
    idx = max(0, min(len(sorted_values) - 1, rank - 1))
    return sorted_values[idx]


def _distribution_summary(
    values: List[int], breach_threshold: Optional[int]
) -> Dict[str, Any]:
    """Return count, percentiles, and optional SLA breach count."""
    if not values:
        return {
            "count": 0,
            "p50": None,
            "p90": None,
            "p95": None,
            "sla_breach_count": 0,
        }

    breaches = 0
    if breach_threshold is not None:
        breaches = sum(1 for value in values if value > breach_threshold)

    return {
        "count": len(values),
        "p50": _percentile(values, 50),
        "p90": _percentile(values, 90),
        "p95": _percentile(values, 95),
        "sla_breach_count": breaches,
    }


def _postback_summary(
    expected_count: int, completed_count: int, min_completeness_ratio: float
) -> Dict[str, Optional[float]]:
    """Summarize postback completion status for a period."""
    incomplete_count = max(0, expected_count - completed_count)
    ratio: Optional[float]
    if expected_count > 0:
        ratio = completed_count / expected_count
    else:
        ratio = None
    sla_breach_count = 0
    if ratio is not None and ratio < min_completeness_ratio:
        sla_breach_count = 1

    return {
        "expected_count": expected_count,
        "completed_count": completed_count,
        "incomplete_count": incomplete_count,
        "completeness_ratio": ratio,
        "sla_breach_count": sla_breach_count,
    }


async def create_session(
    user_id: str,
    space_id: Optional[str],
    title: str,
    todo_id: Optional[str] = None,
    agent_id: Optional[str] = None,
) -> str:
    """Create a new chat session and return its string ID."""
    now = datetime.utcnow()
    doc: Dict[str, Any] = {
        "user_id": user_id,
        "space_id": space_id,
        "title": title[:120],
        "created_at": now,
        "updated_at": now,
    }
    if todo_id:
        doc["todo_id"] = todo_id
    if agent_id:
        doc["agent_id"] = agent_id
    if agent_id == OPENCLAW_AGENT_ID:
        doc["openclaw_metrics"] = _default_openclaw_metrics_state()
    # Initialize messaging flags for any session that uses the post-and-poll
    # pattern (task-linked or direct-chat with an agent).
    if todo_id or agent_id:
        doc["needs_agent_response"] = False
        doc["has_unread_reply"] = False

    result = await sessions_collection.insert_one(doc)
    session_id = str(result.inserted_id)

    # Create the corresponding trajectory document
    await trajectories_collection.insert_one(
        {
            "session_id": session_id,
            "user_id": user_id,
            "space_id": space_id,
            "trajectory": [],
            "display_messages": [],
            "created_at": now,
            "updated_at": now,
        }
    )
    return session_id


async def list_sessions(
    user_id: str, space_id: Optional[str] = None, limit: int = 50
) -> List[Dict[str, Any]]:
    """List sessions for dropdown. Returns lightweight metadata only."""
    query: Dict[str, Any] = {"user_id": user_id}
    if space_id is not None:
        query["space_id"] = space_id

    cursor = (
        sessions_collection.find(query, {"user_id": 0})
        .sort("updated_at", -1)
        .limit(limit)
    )
    items = await cursor.to_list(length=limit)
    for item in items:
        item["_id"] = str(item["_id"])
    return items


async def get_session_trajectory(
    session_id: str, user_id: str
) -> Optional[Dict[str, Any]]:
    """Load a session's trajectory and display messages. Validates ownership."""
    doc = await trajectories_collection.find_one(
        {"session_id": session_id, "user_id": user_id}
    )
    if not doc:
        return None

    # Also get the session title
    session_doc = await sessions_collection.find_one({"_id": ObjectId(session_id)})
    title = session_doc.get("title", "") if session_doc else ""

    return {
        "session_id": session_id,
        "title": title,
        "todo_id": session_doc.get("todo_id") if session_doc else None,
        "agent_id": session_doc.get("agent_id") if session_doc else None,
        "needs_human_response": (
            session_doc.get("needs_human_response", False) if session_doc else False
        ),
        "display_messages": doc.get("display_messages", []),
        "trajectory": doc.get("trajectory", []),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


async def save_trajectory(
    session_id: str,
    user_id: str,
    trajectory: List[Dict[str, Any]],
    display_messages: List[Dict[str, Any]],
) -> None:
    """Persist updated trajectory and display messages after a turn completes."""
    now = datetime.utcnow()
    await trajectories_collection.update_one(
        {"session_id": session_id, "user_id": user_id},
        {
            "$set": {
                "trajectory": trajectory,
                "display_messages": display_messages,
                "updated_at": now,
            }
        },
    )
    await sessions_collection.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"updated_at": now}},
    )


async def delete_session(session_id: str, user_id: str) -> bool:
    """Delete a session and its trajectory. Returns True if found."""
    result = await sessions_collection.delete_one(
        {"_id": ObjectId(session_id), "user_id": user_id}
    )
    await trajectories_collection.delete_one(
        {"session_id": session_id, "user_id": user_id}
    )
    return result.deleted_count > 0


async def find_session_by_todo(user_id: str, todo_id: str) -> Optional[Dict[str, Any]]:
    """Find a session linked to a specific todo."""
    doc = await sessions_collection.find_one({"user_id": user_id, "todo_id": todo_id})
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc


async def append_message(
    session_id: str,
    user_id: str,
    role: str,
    content: str,
    agent_id: Optional[str] = None,
    interim: bool = False,
    needs_human_response: bool = False,
) -> Dict[str, Any]:
    """Append a message to a session's display_messages and update flags.

    When a user posts: sets needs_agent_response=True, clears needs_human_response.
    When an assistant posts: sets needs_agent_response=False, has_unread_reply=True.
    If agent_id is provided on an assistant message, stamps the session so
    future followups route back to that agent.

    If interim=True and role is "assistant", the message is posted but
    needs_agent_response is NOT cleared.  This allows progress updates
    (e.g. "Working on this...") without removing the session from the
    pending queue, so the final response can be posted later.

    If needs_human_response=True and role is 'assistant', the session is marked
    as needing a human reply before the agent should continue. This sets
    needs_human_response=True and needs_agent_response=False, effectively
    pausing agent polling until the human responds.
    """
    now = datetime.utcnow()
    session_object_id = ObjectId(session_id)
    session_doc = await sessions_collection.find_one(
        {"_id": session_object_id},
        {
            "agent_id": 1,
            "space_id": 1,
            "needs_agent_response": 1,
            "openclaw_metrics": 1,
        },
    )
    message: Dict[str, Any] = {
        "role": role,
        "content": content,
        "timestamp": now.isoformat(),
    }
    if agent_id and role == "assistant":
        message["agent_id"] = agent_id
    if needs_human_response:
        message["needs_human_response"] = True

    session_agent_id = session_doc.get("agent_id") if session_doc else None
    assistant_is_openclaw = role == "assistant" and (
        agent_id == OPENCLAW_AGENT_ID
        or (agent_id is None and session_agent_id == OPENCLAW_AGENT_ID)
    )
    track_openclaw_metrics = bool(session_doc) and (
        session_agent_id == OPENCLAW_AGENT_ID or assistant_is_openclaw
    )
    session_space_id = session_doc.get("space_id") if session_doc else None
    metric_events: List[Dict[str, Any]] = []

    # Update trajectory doc
    await trajectories_collection.update_one(
        {"session_id": session_id, "user_id": user_id},
        {
            "$push": {"display_messages": message},
            "$set": {"updated_at": now},
        },
    )

    # Update session flags
    update: Dict[str, Any] = {"updated_at": now}
    if role == "user":
        update["needs_agent_response"] = True
        update["needs_human_response"] = False
    elif role == "assistant":
        if not interim:
            update["needs_agent_response"] = False
        update["has_unread_reply"] = True
        if agent_id:
            update["agent_id"] = agent_id
        if needs_human_response:
            update["needs_human_response"] = True
            update["needs_agent_response"] = False

    if track_openclaw_metrics:
        openclaw_metrics = _merge_openclaw_metrics_state(
            session_doc.get("openclaw_metrics")
        )
        pending_before = bool(session_doc.get("needs_agent_response"))

        if role == "user":
            if openclaw_metrics.get("first_user_message_at") is None:
                openclaw_metrics["first_user_message_at"] = now
            openclaw_metrics["last_user_message_at"] = now
            if (not pending_before) or (
                openclaw_metrics.get("current_pending_started_at") is None
            ):
                openclaw_metrics["current_pending_started_at"] = now
                openclaw_metrics["postbacks_expected"] = (
                    int(openclaw_metrics.get("postbacks_expected", 0)) + 1
                )
                metric_events.append(
                    {"metric_name": "postback_expected", "metric_value": 1}
                )

        elif assistant_is_openclaw:
            first_user_at = openclaw_metrics.get("first_user_message_at")
            if (
                isinstance(first_user_at, datetime)
                and openclaw_metrics.get("first_agent_response_at") is None
            ):
                openclaw_metrics["first_agent_response_at"] = now
                metric_events.append(
                    {
                        "metric_name": "time_to_first_agent_response_ms",
                        "metric_value": _latency_ms(first_user_at, now),
                    }
                )

            openclaw_metrics["last_agent_response_at"] = now
            pending_started_at = openclaw_metrics.get("current_pending_started_at")
            if not interim and isinstance(pending_started_at, datetime):
                completed_before = int(openclaw_metrics.get("postbacks_completed", 0))
                openclaw_metrics["postbacks_completed"] = completed_before + 1
                openclaw_metrics["current_pending_started_at"] = None
                metric_events.append(
                    {"metric_name": "postback_completed", "metric_value": 1}
                )

                if (
                    isinstance(first_user_at, datetime)
                    and openclaw_metrics.get("first_final_agent_response_at") is None
                ):
                    openclaw_metrics["first_final_agent_response_at"] = now
                    metric_events.append(
                        {
                            "metric_name": "time_to_final_agent_response_ms",
                            "metric_value": _latency_ms(first_user_at, now),
                        }
                    )

                if completed_before > 0:
                    metric_events.append(
                        {
                            "metric_name": "followup_response_latency_ms",
                            "metric_value": _latency_ms(pending_started_at, now),
                        }
                    )

        openclaw_metrics["updated_at"] = now
        update["openclaw_metrics"] = openclaw_metrics

    await sessions_collection.update_one(
        {"_id": session_object_id},
        {"$set": update},
    )

    if track_openclaw_metrics and metric_events:
        try:
            for event in metric_events:
                await _record_responsiveness_event(
                    user_id=user_id,
                    space_id=session_space_id,
                    session_id=session_id,
                    metric_name=event["metric_name"],
                    metric_value=event["metric_value"],
                    event_at=now,
                )
        except Exception as exc:
            logger.warning(
                "Failed to persist openclaw responsiveness event for session %s: %s",
                session_id,
                exc,
            )

    return message


async def get_pending_sessions(
    user_id: str, space_id: Optional[str] = None, agent_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Get sessions that need an agent response.

    Filters out stale sessions and caps active session count.

    agent_id routing:
      - None  → only unclaimed sessions (no agent_id field on session)
      - "X"   → sessions claimed by "X" **plus** unclaimed sessions
                 (so an agent can discover new work and see its own followups)
    """
    cutoff = datetime.utcnow() - timedelta(days=SESSION_STALE_DAYS)
    query: Dict[str, Any] = {
        "user_id": user_id,
        "needs_agent_response": True,
        "updated_at": {"$gte": cutoff},
        "needs_human_response": {"$ne": True},
    }
    if space_id is not None:
        query["space_id"] = space_id

    if agent_id is not None:
        # Return sessions claimed by this agent OR unclaimed sessions
        query["$or"] = [
            {"agent_id": agent_id},
            {"agent_id": {"$exists": False}},
        ]
    else:
        # Default: only unclaimed sessions
        query["agent_id"] = {"$exists": False}

    if agent_id == OPENCLAW_AGENT_ID:
        try:
            pending_backlog_count = await sessions_collection.count_documents(query)
            await _record_pending_backlog_snapshot(
                user_id=user_id,
                space_id=space_id,
                pending_backlog_count=pending_backlog_count,
                snapshot_at=datetime.utcnow(),
            )
        except Exception as exc:
            logger.warning(
                "Failed to persist openclaw backlog snapshot for user %s: %s",
                user_id,
                exc,
            )

    cursor = (
        sessions_collection.find(query)
        .sort("updated_at", -1)
        .limit(MAX_ACTIVE_SESSIONS)
    )
    items = await cursor.to_list(length=MAX_ACTIVE_SESSIONS)

    # Enrich each session with message count and recent user messages
    for item in items:
        item["_id"] = str(item["_id"])
        session_id = item["_id"]
        # Fetch message count and recent user messages from trajectory
        traj = await trajectories_collection.find_one(
            {"session_id": session_id},
            {"display_messages": 1},
        )
        has_assistant_message = False
        if traj and traj.get("display_messages"):
            msgs = traj["display_messages"]
            item["message_count"] = len(msgs)
            # Collect all user messages since the last assistant response
            recent: List[str] = []
            for msg in reversed(msgs):
                if msg.get("role") == "assistant":
                    has_assistant_message = True
                    break
                if msg.get("role") == "user":
                    content = msg.get("content", "")
                    recent.append(content[:200] if len(content) > 200 else content)
            if not has_assistant_message:
                has_assistant_message = any(m.get("role") == "assistant" for m in msgs)
            recent.reverse()
            item["recent_messages"] = recent
        else:
            item["message_count"] = 0
            item["recent_messages"] = []

        # A follow-up requires: agent_id is set AND the agent already responded
        # at least once. Without this check, tasks pre-assigned via the agent
        # dropdown (which sets agent_id at creation) would incorrectly appear
        # as follow-ups before the agent has ever handled them.
        item["is_followup"] = bool(item.get("agent_id")) and has_assistant_message

    return items


async def get_unread_todo_ids(
    user_id: str, space_id: Optional[str] = None
) -> List[str]:
    """Return todo IDs that have sessions with unread agent replies."""
    query: Dict[str, Any] = {
        "user_id": user_id,
        "has_unread_reply": True,
        "todo_id": {"$exists": True},
    }
    if space_id is not None:
        query["space_id"] = space_id

    cursor = sessions_collection.find(query, {"todo_id": 1})
    items = await cursor.to_list(length=100)
    return [item["todo_id"] for item in items if item.get("todo_id")]


async def get_todo_session_statuses(
    user_id: str, space_id: Optional[str] = None
) -> Dict[str, str]:
    """Return a map of todo_id -> status for todos with linked sessions.

    Status values: 'waiting', 'unread_reply'
    """
    query: Dict[str, Any] = {
        "user_id": user_id,
        "todo_id": {"$exists": True},
    }
    if space_id is not None:
        query["space_id"] = space_id

    cursor = sessions_collection.find(
        query,
        {
            "todo_id": 1,
            "needs_agent_response": 1,
            "has_unread_reply": 1,
            "needs_human_response": 1,
        },
    )
    items = await cursor.to_list(length=200)

    statuses: Dict[str, str] = {}
    for item in items:
        todo_id = item.get("todo_id")
        if not todo_id:
            continue
        if item.get("needs_human_response"):
            statuses[todo_id] = "needs_human_response"
        elif item.get("has_unread_reply"):
            statuses[todo_id] = "unread_reply"
        elif item.get("needs_agent_response"):
            statuses[todo_id] = "waiting"
    return statuses


async def mark_session_read(session_id: str, user_id: str) -> bool:
    """Clear the unread flag on a session."""
    result = await sessions_collection.update_one(
        {"_id": ObjectId(session_id), "user_id": user_id},
        {"$set": {"has_unread_reply": False}},
    )
    return result.modified_count > 0


def _empty_responsiveness_bucket() -> Dict[str, Any]:
    """Create an empty aggregation bucket for one day/window."""
    return {
        "time_to_first_agent_response_ms": [],
        "time_to_final_agent_response_ms": [],
        "followup_response_latency_ms": [],
        "pending_backlog_count": [],
        "postback_expected_count": 0,
        "postback_completed_count": 0,
    }


def _summarize_responsiveness_bucket(
    bucket: Dict[str, Any],
    *,
    first_response_sla_ms: int,
    final_response_sla_ms: int,
    followup_response_sla_ms: int,
    pending_backlog_sla_count: int,
    postback_completeness_sla_ratio: float,
) -> Dict[str, Any]:
    """Build summary payload for one bucket."""
    return {
        "time_to_first_agent_response_ms": _distribution_summary(
            bucket["time_to_first_agent_response_ms"], first_response_sla_ms
        ),
        "time_to_final_agent_response_ms": _distribution_summary(
            bucket["time_to_final_agent_response_ms"], final_response_sla_ms
        ),
        "followup_response_latency_ms": _distribution_summary(
            bucket["followup_response_latency_ms"], followup_response_sla_ms
        ),
        "pending_backlog_count": _distribution_summary(
            bucket["pending_backlog_count"], pending_backlog_sla_count
        ),
        "postback_completeness": _postback_summary(
            expected_count=bucket["postback_expected_count"],
            completed_count=bucket["postback_completed_count"],
            min_completeness_ratio=postback_completeness_sla_ratio,
        ),
    }


async def get_agent_responsiveness_summary(
    user_id: str,
    *,
    space_id: Optional[str] = None,
    agent_id: str = OPENCLAW_AGENT_ID,
    days: int = 7,
    first_response_sla_ms: int = 5 * 60 * 1000,
    final_response_sla_ms: int = 15 * 60 * 1000,
    followup_response_sla_ms: int = 10 * 60 * 1000,
    pending_backlog_sla_count: int = 5,
    postback_completeness_sla_ratio: float = 0.95,
) -> Dict[str, Any]:
    """Return daily and rolling responsiveness metrics for one agent/user."""
    if agent_id != OPENCLAW_AGENT_ID:
        raise ValueError("Only openclaw responsiveness metrics are supported")

    days = max(1, min(days, 30))
    query_days = max(days, 7)

    today = datetime.utcnow().date()
    query_start_day = today - timedelta(days=query_days - 1)
    query_start_dt = _utc_day_start(query_start_day)
    query_end_dt = _utc_day_start(today + timedelta(days=1))

    event_query: Dict[str, Any] = {
        "user_id": user_id,
        "agent_id": agent_id,
        "created_at": {"$gte": query_start_dt, "$lt": query_end_dt},
    }
    if space_id is not None:
        event_query["space_id"] = space_id

    snapshot_query: Dict[str, Any] = {
        "user_id": user_id,
        "agent_id": agent_id,
        "snapshot_minute": {"$gte": query_start_dt, "$lt": query_end_dt},
    }
    if space_id is not None:
        snapshot_query["space_id"] = space_id

    events = await agent_responsiveness_events_collection.find(
        event_query,
        {"metric_name": 1, "metric_value": 1, "created_at": 1},
    ).to_list(length=50000)
    snapshots = await agent_backlog_snapshots_collection.find(
        snapshot_query,
        {"pending_backlog_count": 1, "snapshot_minute": 1},
    ).to_list(length=50000)

    day_keys = [
        (query_start_day + timedelta(days=offset)).isoformat()
        for offset in range(query_days)
    ]
    buckets: Dict[str, Dict[str, Any]] = {
        day_key: _empty_responsiveness_bucket() for day_key in day_keys
    }

    for event in events:
        created_at = event.get("created_at")
        if not isinstance(created_at, datetime):
            continue
        day_key = created_at.date().isoformat()
        bucket = buckets.get(day_key)
        if bucket is None:
            continue

        metric_name = event.get("metric_name")
        metric_value = event.get("metric_value")
        if metric_name in (
            "time_to_first_agent_response_ms",
            "time_to_final_agent_response_ms",
            "followup_response_latency_ms",
        ):
            if isinstance(metric_value, (int, float)):
                bucket[metric_name].append(int(metric_value))
        elif metric_name == "postback_expected":
            if isinstance(metric_value, (int, float)):
                bucket["postback_expected_count"] += int(metric_value)
        elif metric_name == "postback_completed":
            if isinstance(metric_value, (int, float)):
                bucket["postback_completed_count"] += int(metric_value)

    for snapshot in snapshots:
        snapshot_at = snapshot.get("snapshot_minute")
        if not isinstance(snapshot_at, datetime):
            continue
        day_key = snapshot_at.date().isoformat()
        bucket = buckets.get(day_key)
        if bucket is None:
            continue

        backlog_count = snapshot.get("pending_backlog_count")
        if isinstance(backlog_count, (int, float)):
            bucket["pending_backlog_count"].append(int(backlog_count))

    daily_start_day = today - timedelta(days=days - 1)
    daily: List[Dict[str, Any]] = []
    for offset in range(days):
        day_value = daily_start_day + timedelta(days=offset)
        day_key = day_value.isoformat()
        summary = _summarize_responsiveness_bucket(
            buckets.get(day_key, _empty_responsiveness_bucket()),
            first_response_sla_ms=first_response_sla_ms,
            final_response_sla_ms=final_response_sla_ms,
            followup_response_sla_ms=followup_response_sla_ms,
            pending_backlog_sla_count=pending_backlog_sla_count,
            postback_completeness_sla_ratio=postback_completeness_sla_ratio,
        )
        daily.append({"date": day_key, **summary})

    rolling_start_day = today - timedelta(days=6)
    rolling_bucket = _empty_responsiveness_bucket()
    for offset in range(7):
        day_key = (rolling_start_day + timedelta(days=offset)).isoformat()
        bucket = buckets.get(day_key)
        if not bucket:
            continue
        rolling_bucket["time_to_first_agent_response_ms"].extend(
            bucket["time_to_first_agent_response_ms"]
        )
        rolling_bucket["time_to_final_agent_response_ms"].extend(
            bucket["time_to_final_agent_response_ms"]
        )
        rolling_bucket["followup_response_latency_ms"].extend(
            bucket["followup_response_latency_ms"]
        )
        rolling_bucket["pending_backlog_count"].extend(bucket["pending_backlog_count"])
        rolling_bucket["postback_expected_count"] += bucket["postback_expected_count"]
        rolling_bucket["postback_completed_count"] += bucket["postback_completed_count"]

    rolling_summary = _summarize_responsiveness_bucket(
        rolling_bucket,
        first_response_sla_ms=first_response_sla_ms,
        final_response_sla_ms=final_response_sla_ms,
        followup_response_sla_ms=followup_response_sla_ms,
        pending_backlog_sla_count=pending_backlog_sla_count,
        postback_completeness_sla_ratio=postback_completeness_sla_ratio,
    )

    return {
        "agent_id": agent_id,
        "space_id": space_id,
        "generated_at": datetime.utcnow().isoformat(),
        "thresholds": {
            "first_response_sla_ms": first_response_sla_ms,
            "final_response_sla_ms": final_response_sla_ms,
            "followup_response_sla_ms": followup_response_sla_ms,
            "pending_backlog_sla_count": pending_backlog_sla_count,
            "postback_completeness_sla_ratio": postback_completeness_sla_ratio,
        },
        "daily": daily,
        "rolling_7d": {
            "date_from": rolling_start_day.isoformat(),
            "date_to": today.isoformat(),
            **rolling_summary,
        },
    }


async def search_sessions(
    user_id: str,
    query: str,
    space_id: Optional[str] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Search sessions by title and message content using MongoDB text indexes.

    Returns sessions where the title or message content matches the query,
    sorted by text relevance score. Each result includes a preview snippet
    from the best-matching message.
    """
    if not query or not query.strip():
        return []

    results: List[Dict[str, Any]] = []
    seen_session_ids: set = set()

    # 1) Search session titles via text index
    title_filter: Dict[str, Any] = {
        "user_id": user_id,
        "$text": {"$search": query},
    }
    if space_id is not None:
        title_filter["space_id"] = space_id

    cursor = (
        sessions_collection.find(
            title_filter,
            {"score": {"$meta": "textScore"}},
        )
        .sort([("score", {"$meta": "textScore"})])
        .limit(limit)
    )
    title_hits = await cursor.to_list(length=limit)

    for doc in title_hits:
        sid = str(doc["_id"])
        seen_session_ids.add(sid)
        results.append(
            {
                "_id": sid,
                "title": doc.get("title", ""),
                "space_id": doc.get("space_id"),
                "todo_id": doc.get("todo_id"),
                "agent_id": doc.get("agent_id"),
                "updated_at": doc.get("updated_at"),
                "created_at": doc.get("created_at"),
                "match_source": "title",
                "preview": doc.get("title", ""),
                "score": doc.get("score", 0),
            }
        )

    # 2) Search message content via text index on trajectories
    content_filter: Dict[str, Any] = {
        "user_id": user_id,
        "$text": {"$search": query},
    }
    if space_id is not None:
        content_filter["space_id"] = space_id

    cursor = (
        trajectories_collection.find(
            content_filter,
            {"score": {"$meta": "textScore"}, "session_id": 1, "display_messages": 1},
        )
        .sort([("score", {"$meta": "textScore"})])
        .limit(limit)
    )
    content_hits = await cursor.to_list(length=limit)

    # Filter to unseen session IDs and build a lookup of trajectory data
    new_content_hits = []
    for traj in content_hits:
        sid = traj.get("session_id")
        if not sid or sid in seen_session_ids:
            continue
        seen_session_ids.add(sid)
        new_content_hits.append(traj)

    # Batch-fetch all session docs in a single query instead of N individual lookups
    if new_content_hits:
        content_sids = [t["session_id"] for t in new_content_hits]
        content_session_ids = [ObjectId(sid) for sid in content_sids]
        session_cursor = sessions_collection.find({"_id": {"$in": content_session_ids}})
        session_docs_list = await session_cursor.to_list(
            length=len(content_session_ids)
        )
        session_docs_map: Dict[str, Dict[str, Any]] = {
            str(doc["_id"]): doc for doc in session_docs_list
        }
    else:
        session_docs_map = {}

    for traj in new_content_hits:
        sid = traj["session_id"]
        session_doc = session_docs_map.get(sid)
        if not session_doc:
            continue

        # Find the best matching message snippet
        preview = ""
        query_lower = query.lower()
        for msg in reversed(traj.get("display_messages", [])):
            content = msg.get("content", "")
            if query_lower in content.lower():
                # Extract a snippet around the match
                idx = content.lower().index(query_lower)
                start = max(0, idx - 40)
                end = min(len(content), idx + len(query) + 80)
                snippet = content[start:end]
                if start > 0:
                    snippet = "..." + snippet
                if end < len(content):
                    snippet = snippet + "..."
                preview = snippet
                break

        if not preview and traj.get("display_messages"):
            # Fallback: use last message as preview
            last_msg = traj["display_messages"][-1]
            preview = last_msg.get("content", "")[:120]

        results.append(
            {
                "_id": sid,
                "title": session_doc.get("title", ""),
                "space_id": session_doc.get("space_id"),
                "todo_id": session_doc.get("todo_id"),
                "agent_id": session_doc.get("agent_id"),
                "updated_at": session_doc.get("updated_at"),
                "created_at": session_doc.get("created_at"),
                "match_source": "content",
                "preview": preview,
                "score": traj.get("score", 0),
            }
        )

    # Sort all results by score descending, cap at limit
    results.sort(key=lambda r: r.get("score", 0), reverse=True)
    return results[:limit]


async def init_chat_session_indexes() -> None:
    """Create indexes for chat sessions and trajectories."""
    try:
        await sessions_collection.create_index(
            [("user_id", 1), ("space_id", 1), ("updated_at", -1)]
        )
        await sessions_collection.create_index("user_id")
        # Index for pending session queries
        await sessions_collection.create_index(
            [("user_id", 1), ("needs_agent_response", 1)]
        )
        # Index for unread reply queries
        await sessions_collection.create_index(
            [("user_id", 1), ("has_unread_reply", 1)]
        )
        # Unique partial index: one session per user+todo
        await sessions_collection.create_index(
            [("user_id", 1), ("todo_id", 1)],
            unique=True,
            partialFilterExpression={"todo_id": {"$exists": True}},
        )

        # Text index on session titles for search
        await sessions_collection.create_index(
            [("title", "text")],
            name="title_text_search",
        )

        await trajectories_collection.create_index("session_id", unique=True)
        await trajectories_collection.create_index("user_id")
        # Text index on message content for search
        await trajectories_collection.create_index(
            [("display_messages.content", "text")],
            name="message_content_text_search",
        )

        # Openclaw responsiveness metrics indexes
        await agent_responsiveness_events_collection.create_index(
            [("user_id", 1), ("agent_id", 1), ("created_at", -1)]
        )
        await agent_responsiveness_events_collection.create_index(
            [("user_id", 1), ("space_id", 1), ("agent_id", 1), ("created_at", -1)]
        )
        await agent_backlog_snapshots_collection.create_index(
            [("user_id", 1), ("agent_id", 1), ("snapshot_minute", -1)]
        )
        await agent_backlog_snapshots_collection.create_index(
            [("user_id", 1), ("space_id", 1), ("agent_id", 1), ("snapshot_minute", 1)],
            unique=True,
        )
        logger.info("Chat session indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating chat session indexes: {e}")
