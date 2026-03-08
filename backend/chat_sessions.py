"""Chat session and trajectory storage for persistent chat history."""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from db import db
from pymongo.errors import DuplicateKeyError

# Import todos collection for agent_id sync
todos_collection = db.todos

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

sessions_collection = db.chat_sessions
trajectories_collection = db.chat_trajectories

# Session management configuration
MAX_ACTIVE_SESSIONS = 10  # Maximum sessions to show in list-pending
SESSION_STALE_DAYS = 7  # Sessions older than this are archived (not in list-pending)

# Session status types
SESSION_STATUS_ACTIVE = "active"
SESSION_STATUS_ARCHIVED = "archived"


async def create_session(
    user_id: str, space_id: Optional[str], title: str, todo_id: Optional[str] = None
) -> str:
    """Create a new chat session and return its string ID.

    If todo_id is provided and a session already exists for that todo,
    returns the existing session ID (enforced by unique partial index).
    """
    # If linking to a todo, check for existing session first
    if todo_id:
        existing = await find_session_by_todo(user_id, todo_id)
        if existing:
            return existing

    now = datetime.utcnow()
    doc = {
        "user_id": user_id,
        "space_id": space_id,
        "title": title[:120],
        "todo_id": todo_id,
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = await sessions_collection.insert_one(doc)
    except DuplicateKeyError:
        # Race condition: another request created the session between our
        # find_session_by_todo check and insert_one. Return the existing one.
        if todo_id:
            existing = await find_session_by_todo(user_id, todo_id)
            if existing:
                return existing
        raise
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


async def find_session_by_todo(user_id: str, todo_id: str) -> Optional[str]:
    """Find a session linked to a specific todo. Returns session_id if found."""
    doc = await sessions_collection.find_one({"user_id": user_id, "todo_id": todo_id})
    if doc:
        return str(doc["_id"])
    return None


async def get_pending_sessions(
    user_id: str, space_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Return sessions that need an agent response.

    Uses the ``needs_agent_response`` flag for fast indexed queries.
    Falls back to checking the last message role for legacy docs that
    don't have the flag yet.

    Implements session capping: MAX_ACTIVE_SESSIONS limit and stale session filtering.
    """
    from datetime import timedelta

    base_query: Dict[str, Any] = {"user_id": user_id}
    if space_id:
        base_query["space_id"] = space_id

    # Archive filter: only sessions updated in last SESSION_STALE_DAYS
    stale_threshold = datetime.utcnow() - timedelta(days=SESSION_STALE_DAYS)

    # Query 1: docs with the flag set (fast, indexed) + not stale
    flagged_query = {
        **base_query,
        "needs_agent_response": True,
        "updated_at": {"$gte": stale_threshold},
    }
    # Query 2: legacy docs missing the flag — fall back to last-message check
    legacy_query = {**base_query, "needs_agent_response": {"$exists": False}}

    seen_ids: set = set()
    pending = []

    async def _collect(cursor) -> None:  # type: ignore[no-untyped-def]
        async for traj in cursor:
            sid = traj["session_id"]
            if sid in seen_ids:
                continue
            # For legacy docs, verify last message is from user
            if "needs_agent_response" not in traj:
                msgs = traj.get("display_messages", [])
                if not msgs or msgs[-1].get("role") != "user":
                    continue
            session_doc = await sessions_collection.find_one({"_id": ObjectId(sid)})
            if session_doc:
                seen_ids.add(sid)
                msgs = traj.get("display_messages", [])
                last_msg = msgs[-1].get("content", "") if msgs else ""
                pending.append(
                    {
                        "_id": str(session_doc["_id"]),
                        "title": session_doc.get("title", ""),
                        "todo_id": session_doc.get("todo_id"),
                        "agent_id": traj.get("agent_id"),
                        "last_message": last_msg,
                        "updated_at": session_doc.get("updated_at"),
                    }
                )

    await _collect(trajectories_collection.find(flagged_query))
    await _collect(trajectories_collection.find(legacy_query))

    # Sort by updated_at (newest first) and apply session cap
    pending.sort(key=lambda x: x.get("updated_at", datetime.min), reverse=True)

    # Apply MAX_ACTIVE_SESSIONS cap
    if len(pending) > MAX_ACTIVE_SESSIONS:
        logger.info(
            f"Session cap applied: {len(pending)} sessions, returning {MAX_ACTIVE_SESSIONS}"
        )
        return pending[:MAX_ACTIVE_SESSIONS]

    return pending


async def claim_session(session_id: str, user_id: str, agent_id: str) -> bool:
    """Atomically claim a session for an agent. Returns True if claimed.

    Uses an atomic update that only succeeds if agent_id is not already set
    (or is the same agent reclaiming). This prevents duplicate dispatch.
    Also syncs the agent_id to the linked todo if one exists.
    """
    result = await trajectories_collection.update_one(
        {
            "session_id": session_id,
            "user_id": user_id,
            "needs_agent_response": True,
            "$or": [
                {"agent_id": {"$exists": False}},
                {"agent_id": None},
                {"agent_id": agent_id},
            ],
        },
        {"$set": {"agent_id": agent_id, "updated_at": datetime.utcnow()}},
    )
    claimed = result.modified_count > 0 or result.matched_count > 0

    # Sync agent_id to linked todo if one exists
    if claimed:
        try:
            session_doc = await sessions_collection.find_one(
                {"_id": ObjectId(session_id), "user_id": user_id}, {"todo_id": 1}
            )
            if session_doc and session_doc.get("todo_id"):
                await todos_collection.update_one(
                    {"_id": ObjectId(session_doc["todo_id"]), "user_id": user_id},
                    {"$set": {"agent_id": agent_id}},
                )
                logger.info(
                    f"Synced agent_id to todo {session_doc['todo_id']} for session {session_id}"
                )
        except Exception as e:
            logger.warning(f"Failed to sync agent_id to linked todo: {e}")

    return claimed


async def release_session(session_id: str, user_id: str, agent_id: str = "") -> None:
    """Clear the agent_id claim on a session (called when agent finishes).
    Also clears the agent_id from the linked todo if one exists."""
    await trajectories_collection.update_one(
        {"session_id": session_id, "user_id": user_id},
        {"$set": {"agent_id": None}},
    )

    # Clear agent_id from linked todo if one exists
    try:
        session_doc = await sessions_collection.find_one(
            {"_id": ObjectId(session_id), "user_id": user_id}, {"todo_id": 1}
        )
        if session_doc and session_doc.get("todo_id"):
            await todos_collection.update_one(
                {"_id": ObjectId(session_doc["todo_id"]), "user_id": user_id},
                {"$set": {"agent_id": None}},
            )
            logger.info(
                f"Cleared agent_id from todo {session_doc['todo_id']} for session {session_id}"
            )
    except Exception as e:
        logger.warning(f"Failed to clear agent_id from linked todo: {e}")


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


# Max back-and-forth exchanges before a session auto-releases its agent claim.
# Each exchange = 1 user message + 1 assistant response. After this limit the
# agent_id is cleared so the session shows up as unclaimed if the user writes again.
MAX_SESSION_TURNS = 10


async def append_message(
    session_id: str, user_id: str, role: str, content: str
) -> bool:
    """Append a message to a session's display_messages. Returns True if found.

    Automatically manages ``needs_agent_response``:
    - user message  → needs_agent_response = True
    - assistant msg → needs_agent_response = False (but agent_id is KEPT so the
      same subagent stays claimed on the session for follow-ups)

    Agent release policy:
    - agent_id is only cleared when:
      (a) release_session() is called explicitly (user says "done", or agent finishes)
      (b) the session exceeds MAX_SESSION_TURNS exchanges — auto-released
    - This lets subagents maintain a persistent conversation with the user.

    Session Archival & Resurrection:
    - Sessions older than SESSION_STALE_DAYS are excluded from list-pending
    - When a new message is added, updated_at is refreshed to now
    - This "resurrects" archived sessions, making them active again
    """
    now = datetime.utcnow()
    message = {"role": role, "content": content, "timestamp": now.isoformat()}

    update: Dict[str, Any] = {
        "$push": {"display_messages": message},
        "$set": {"updated_at": now},
    }

    if role == "user":
        update["$set"]["needs_agent_response"] = True

    result = await trajectories_collection.update_one(
        {"session_id": session_id, "user_id": user_id},
        update,
    )
    if result.matched_count == 0:
        return False

    # For assistant messages, clear needs_agent_response but KEEP agent_id.
    # The subagent stays claimed so it can handle follow-up messages.
    if role == "assistant":
        # Re-read to check the last message role and turn count in one query.
        # (MongoDB doesn't support negative array indices like -1 in query filters.)
        doc = await trajectories_collection.find_one(
            {"session_id": session_id, "user_id": user_id},
            {"display_messages": 1},
        )
        if doc:
            msgs = doc.get("display_messages", [])
            # Only clear if last message is still from assistant (no user race)
            if msgs and msgs[-1].get("role") == "assistant":
                await trajectories_collection.update_one(
                    {"session_id": session_id, "user_id": user_id},
                    {"$set": {"needs_agent_response": False, "has_unread_reply": True}},
                )

            # Auto-release after MAX_SESSION_TURNS exchanges
            turn_count = sum(1 for m in msgs if m.get("role") == "assistant")
            if turn_count >= MAX_SESSION_TURNS:
                logger.info(
                    f"Session {session_id} hit {MAX_SESSION_TURNS} turns — auto-releasing agent"
                )
                await trajectories_collection.update_one(
                    {"session_id": session_id, "user_id": user_id},
                    {"$set": {"agent_id": None}},
                )

    await sessions_collection.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"updated_at": now}},
    )

    return True


async def delete_session(session_id: str, user_id: str) -> bool:
    """Delete a session and its trajectory. Returns True if found."""
    result = await sessions_collection.delete_one(
        {"_id": ObjectId(session_id), "user_id": user_id}
    )
    await trajectories_collection.delete_one(
        {"session_id": session_id, "user_id": user_id}
    )
    return result.deleted_count > 0


async def get_unread_todo_ids(user_id: str, space_id: Optional[str] = None) -> List[str]:
    """Return todo_ids that have unread agent replies."""
    query: Dict[str, Any] = {"user_id": user_id, "has_unread_reply": True}
    if space_id:
        query["space_id"] = space_id

    todo_ids = []
    async for traj in trajectories_collection.find(query, {"session_id": 1}):
        session_doc = await sessions_collection.find_one({"_id": ObjectId(traj["session_id"])}, {"todo_id": 1})
        if session_doc and session_doc.get("todo_id"):
            todo_ids.append(session_doc["todo_id"])
    return todo_ids


async def mark_session_read(session_id: str, user_id: str) -> bool:
    """Clear the unread reply flag for a session. Returns True if found."""
    result = await trajectories_collection.update_one(
        {"session_id": session_id, "user_id": user_id},
        {"$set": {"has_unread_reply": False}},
    )
    return result.matched_count > 0


async def init_chat_session_indexes() -> None:
    """Create indexes for chat sessions and trajectories."""
    try:
        await sessions_collection.create_index(
            [("user_id", 1), ("space_id", 1), ("updated_at", -1)]
        )
        await sessions_collection.create_index("user_id")

        await trajectories_collection.create_index("session_id", unique=True)
        await trajectories_collection.create_index("user_id")
        await trajectories_collection.create_index(
            [("user_id", 1), ("needs_agent_response", 1)],
        )
        await trajectories_collection.create_index(
            [("user_id", 1), ("has_unread_reply", 1)],
        )
        # Unique partial index: enforce at most one session per (user_id, todo_id)
        # where todo_id is not null. This prevents duplicate todo-linked sessions
        # even under concurrent requests.
        await sessions_collection.create_index(
            [("user_id", 1), ("todo_id", 1)],
            unique=True,
            partialFilterExpression={"todo_id": {"$type": "string"}},
        )
        logger.info("Chat session indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating chat session indexes: {e}")
