"""Chat session and trajectory storage for persistent chat history."""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from db import db
from pymongo.errors import DuplicateKeyError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

sessions_collection = db.chat_sessions
trajectories_collection = db.chat_trajectories


async def create_session(user_id: str, space_id: Optional[str], title: str, todo_id: Optional[str] = None) -> str:
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


async def get_pending_sessions(user_id: str, space_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return sessions that have a pending user message (last message role=user)."""
    query: Dict[str, Any] = {"user_id": user_id}
    if space_id:
        query["space_id"] = space_id

    # Get all trajectories for this user
    cursor = trajectories_collection.find(query)
    pending = []
    async for traj in cursor:
        msgs = traj.get("display_messages", [])
        if msgs and msgs[-1].get("role") == "user":
            # Get the session metadata
            session_doc = await sessions_collection.find_one({"_id": ObjectId(traj["session_id"])})
            if session_doc:
                pending.append(
                    {
                        "_id": str(session_doc["_id"]),
                        "title": session_doc.get("title", ""),
                        "todo_id": session_doc.get("todo_id"),
                        "last_message": msgs[-1].get("content", ""),
                        "updated_at": session_doc.get("updated_at"),
                    }
                )
    return pending


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


async def append_message(session_id: str, user_id: str, role: str, content: str) -> bool:
    """Append a message to a session's display_messages. Returns True if found.

    This allows external agents to post updates to a session without going
    through the OpenAI streaming flow.
    """
    now = datetime.utcnow()
    message = {"role": role, "content": content, "timestamp": now.isoformat()}

    result = await trajectories_collection.update_one(
        {"session_id": session_id, "user_id": user_id},
        {
            "$push": {"display_messages": message},
            "$set": {"updated_at": now},
        },
    )
    if result.matched_count == 0:
        return False

    await sessions_collection.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"updated_at": now}},
    )
    return True


async def delete_session(session_id: str, user_id: str) -> bool:
    """Delete a session and its trajectory. Returns True if found."""
    result = await sessions_collection.delete_one({"_id": ObjectId(session_id), "user_id": user_id})
    await trajectories_collection.delete_one({"session_id": session_id, "user_id": user_id})
    return result.deleted_count > 0


async def init_chat_session_indexes() -> None:
    """Create indexes for chat sessions and trajectories."""
    try:
        await sessions_collection.create_index([("user_id", 1), ("space_id", 1), ("updated_at", -1)])
        await sessions_collection.create_index("user_id")

        await trajectories_collection.create_index("session_id", unique=True)
        await trajectories_collection.create_index("user_id")
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
