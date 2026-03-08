"""Chat session and trajectory storage for persistent chat history.

Sessions can be:
1. Streaming AI sessions (used by the main Assistant tab) — these have trajectories.
2. Task-linked messaging sessions (linked to a todo via todo_id) — these use
   append_message() for a simple post-and-poll pattern with agent response tracking.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId
from db import db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

sessions_collection = db.chat_sessions
trajectories_collection = db.chat_trajectories

# Session management constants
MAX_ACTIVE_SESSIONS = 10
SESSION_STALE_DAYS = 7


async def create_session(
    user_id: str,
    space_id: Optional[str],
    title: str,
    todo_id: Optional[str] = None,
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


async def list_sessions(user_id: str, space_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """List sessions for dropdown. Returns lightweight metadata only."""
    query: Dict[str, Any] = {"user_id": user_id}
    if space_id is not None:
        query["space_id"] = space_id

    cursor = sessions_collection.find(query, {"user_id": 0}).sort("updated_at", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    for item in items:
        item["_id"] = str(item["_id"])
    return items


async def get_session_trajectory(session_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Load a session's trajectory and display messages. Validates ownership."""
    doc = await trajectories_collection.find_one({"session_id": session_id, "user_id": user_id})
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


async def delete_session(session_id: str, user_id: str) -> bool:
    """Delete a session and its trajectory. Returns True if found."""
    result = await sessions_collection.delete_one({"_id": ObjectId(session_id), "user_id": user_id})
    await trajectories_collection.delete_one({"session_id": session_id, "user_id": user_id})
    return result.deleted_count > 0


async def find_session_by_todo(user_id: str, todo_id: str) -> Optional[Dict[str, Any]]:
    """Find a session linked to a specific todo."""
    doc = await sessions_collection.find_one({"user_id": user_id, "todo_id": todo_id})
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc


async def append_message(session_id: str, user_id: str, role: str, content: str) -> Dict[str, Any]:
    """Append a message to a session's display_messages and update flags.

    When a user posts: sets needs_agent_response=True.
    When an assistant posts: sets needs_agent_response=False, has_unread_reply=True.
    """
    now = datetime.utcnow()
    message = {"role": role, "content": content, "timestamp": now.isoformat()}

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
    elif role == "assistant":
        update["needs_agent_response"] = False
        update["has_unread_reply"] = True

    await sessions_collection.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": update},
    )

    return message


async def get_pending_sessions(user_id: str, space_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get sessions that need an agent response.

    Filters out stale sessions and caps active session count.
    """
    cutoff = datetime.utcnow() - timedelta(days=SESSION_STALE_DAYS)
    query: Dict[str, Any] = {
        "user_id": user_id,
        "needs_agent_response": True,
        "updated_at": {"$gte": cutoff},
    }
    if space_id is not None:
        query["space_id"] = space_id

    cursor = sessions_collection.find(query).sort("updated_at", -1).limit(MAX_ACTIVE_SESSIONS)
    items = await cursor.to_list(length=MAX_ACTIVE_SESSIONS)
    for item in items:
        item["_id"] = str(item["_id"])
    return items


async def get_unread_todo_ids(user_id: str, space_id: Optional[str] = None) -> List[str]:
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


async def get_todo_session_statuses(user_id: str, space_id: Optional[str] = None) -> Dict[str, str]:
    """Return a map of todo_id -> status for todos with linked sessions.

    Status values: 'waiting', 'processing', 'unread_reply'
    """
    query: Dict[str, Any] = {
        "user_id": user_id,
        "todo_id": {"$exists": True},
    }
    if space_id is not None:
        query["space_id"] = space_id

    cursor = sessions_collection.find(
        query,
        {"todo_id": 1, "needs_agent_response": 1, "has_unread_reply": 1, "agent_id": 1},
    )
    items = await cursor.to_list(length=200)

    statuses: Dict[str, str] = {}
    for item in items:
        todo_id = item.get("todo_id")
        if not todo_id:
            continue
        if item.get("has_unread_reply"):
            statuses[todo_id] = "unread_reply"
        elif item.get("needs_agent_response"):
            if item.get("agent_id"):
                statuses[todo_id] = "processing"
            else:
                statuses[todo_id] = "waiting"
    return statuses


async def mark_session_read(session_id: str, user_id: str) -> bool:
    """Clear the unread flag on a session."""
    result = await sessions_collection.update_one(
        {"_id": ObjectId(session_id), "user_id": user_id},
        {"$set": {"has_unread_reply": False}},
    )
    return result.modified_count > 0


async def claim_session(session_id: str, user_id: str, agent_id: str) -> bool:
    """Atomically claim a session for an agent. Returns True if successful."""
    result = await sessions_collection.update_one(
        {
            "_id": ObjectId(session_id),
            "user_id": user_id,
            "agent_id": {"$in": [None, agent_id]},
        },
        {"$set": {"agent_id": agent_id}},
    )
    return result.modified_count > 0


async def release_session(session_id: str, user_id: str, agent_id: str) -> bool:
    """Release agent claim on a session."""
    result = await sessions_collection.update_one(
        {
            "_id": ObjectId(session_id),
            "user_id": user_id,
            "agent_id": agent_id,
        },
        {"$set": {"agent_id": None}},
    )
    return result.modified_count > 0


async def init_chat_session_indexes() -> None:
    """Create indexes for chat sessions and trajectories."""
    try:
        await sessions_collection.create_index([("user_id", 1), ("space_id", 1), ("updated_at", -1)])
        await sessions_collection.create_index("user_id")
        # Index for pending session queries
        await sessions_collection.create_index([("user_id", 1), ("needs_agent_response", 1)])
        # Index for unread reply queries
        await sessions_collection.create_index([("user_id", 1), ("has_unread_reply", 1)])
        # Unique partial index: one session per user+todo
        await sessions_collection.create_index(
            [("user_id", 1), ("todo_id", 1)],
            unique=True,
            partialFilterExpression={"todo_id": {"$exists": True}},
        )

        await trajectories_collection.create_index("session_id", unique=True)
        await trajectories_collection.create_index("user_id")
        logger.info("Chat session indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating chat session indexes: {e}")
