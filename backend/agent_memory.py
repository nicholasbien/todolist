"""Agent memory system for per-space persistent context.

Inspired by Claude Code's MEMORY.md approach: stores key-value facts and
daily memory logs that the agent learns about the user, scoped per space.

Two collections:
- agent_memories: persistent key-value facts (preferences, context)
- agent_memory_logs: daily append-only logs of what the agent learned
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from pydantic import BaseModel, Field

from db import db

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MongoDB collections
memories_collection = db.agent_memories
memory_logs_collection = db.agent_memory_logs


async def init_memory_indexes() -> None:
    """Create indexes for optimal memory query performance."""
    try:
        # Unique constraint: one fact per key per user per space per agent
        await memories_collection.create_index(
            [("user_id", 1), ("space_id", 1), ("agent_id", 1), ("key", 1)],
            unique=True,
        )
        await memories_collection.create_index("user_id")
        await memories_collection.create_index([("user_id", 1), ("space_id", 1)])
        await memories_collection.create_index(
            [("user_id", 1), ("space_id", 1), ("agent_id", 1)],
        )

        # Daily log indexes
        await memory_logs_collection.create_index("user_id")
        await memory_logs_collection.create_index([("user_id", 1), ("space_id", 1), ("date", -1)])
        await memory_logs_collection.create_index(
            [("user_id", 1), ("space_id", 1), ("date", 1)],
            unique=True,
        )

        logger.info("Agent memory indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating agent memory indexes: {e}")


# Alias used by the viewer UI branch
ensure_indexes = init_memory_indexes


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class MemoryFact(BaseModel):
    """A single key-value fact the agent remembers about the user."""

    id: Optional[str] = Field(alias="_id", default=None)
    user_id: str
    space_id: Optional[str] = None
    agent_id: Optional[str] = None
    key: str  # e.g. "preferred_name", "work_schedule", "communication_style"
    value: str  # freeform text
    category: Optional[str] = None  # e.g. "preference", "context", "workflow"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        populate_by_name = True


class MemoryLog(BaseModel):
    """Daily append-only log of what the agent learned in a session."""

    id: Optional[str] = Field(alias="_id", default=None)
    user_id: str
    space_id: Optional[str] = None
    date: str  # YYYY-MM-DD
    entries: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        populate_by_name = True


# ---------------------------------------------------------------------------
# Serialization helper (for REST API responses)
# ---------------------------------------------------------------------------


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MongoDB document to JSON-safe dict."""
    if not doc:
        return {}
    return {
        "_id": str(doc["_id"]),
        "user_id": doc.get("user_id", ""),
        "space_id": doc.get("space_id", ""),
        "agent_id": doc.get("agent_id", ""),
        "key": doc.get("key", ""),
        "value": doc.get("value", ""),
        "category": doc.get("category", ""),
        "created_at": (doc.get("created_at", "").isoformat() if doc.get("created_at") else None),
        "updated_at": (doc.get("updated_at", "").isoformat() if doc.get("updated_at") else None),
    }


# ---------------------------------------------------------------------------
# Memory facts CRUD
# ---------------------------------------------------------------------------


async def save_memory(
    user_id: str,
    key: str,
    value: str,
    space_id: Optional[str] = None,
    category: Optional[str] = None,
    agent_id: Optional[str] = None,
) -> MemoryFact:
    """Save or update a memory fact (upsert by user+space+agent+key)."""
    now = datetime.utcnow()
    result = await memories_collection.find_one_and_update(
        {"user_id": user_id, "space_id": space_id, "agent_id": agent_id, "key": key},
        {
            "$set": {
                "value": value,
                "category": category,
                "updated_at": now,
            },
            "$setOnInsert": {
                "user_id": user_id,
                "space_id": space_id,
                "agent_id": agent_id,
                "key": key,
                "created_at": now,
            },
        },
        upsert=True,
        return_document=True,
    )
    result["_id"] = str(result["_id"])
    logger.info(f"Saved memory '{key}' for user {user_id}, space {space_id}")
    return MemoryFact(**result)


async def get_memory(user_id: str, key: str, space_id: Optional[str] = None) -> Optional[MemoryFact]:
    """Get a specific memory fact by key."""
    doc = await memories_collection.find_one({"user_id": user_id, "space_id": space_id, "key": key})
    if doc:
        doc["_id"] = str(doc["_id"])
        return MemoryFact(**doc)
    return None


async def list_memories(
    user_id: str,
    space_id: Optional[str] = None,
    category: Optional[str] = None,
) -> List[MemoryFact]:
    """List all memory facts for a user/space, optionally filtered by category."""
    query: Dict[str, Any] = {"user_id": user_id, "space_id": space_id}
    if category:
        query["category"] = category

    cursor = memories_collection.find(query).sort("key", 1)
    docs = await cursor.to_list(length=200)

    results = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        results.append(MemoryFact(**doc))
    return results


async def get_memories(
    user_id: str,
    space_id: str,
    agent_id: str,
) -> List[Dict[str, Any]]:
    """Retrieve all memories for a given (user, space, agent) triple.

    Returns serialized dicts suitable for REST API responses.
    """
    cursor = memories_collection.find(
        {
            "user_id": user_id,
            "space_id": space_id,
            "agent_id": agent_id,
        }
    ).sort("updated_at", -1)
    docs = await cursor.to_list(length=500)
    return [_serialize(d) for d in docs]


async def delete_memory(memory_id: str, user_id: str) -> bool:
    """Delete a single memory by its MongoDB _id (must belong to user)."""
    try:
        oid = ObjectId(memory_id)
    except (InvalidId, TypeError):
        return False
    result = await memories_collection.delete_one({"_id": oid, "user_id": user_id})
    return result.deleted_count > 0


async def delete_memory_by_key(user_id: str, key: str, space_id: Optional[str] = None) -> bool:
    """Delete a specific memory fact by key."""
    result = await memories_collection.delete_one({"user_id": user_id, "space_id": space_id, "key": key})
    if result.deleted_count > 0:
        logger.info(f"Deleted memory '{key}' for user {user_id}, space {space_id}")
        return True
    return False


async def delete_all_memories(user_id: str, space_id: Optional[str] = None) -> int:
    """Delete all memory facts for a user/space. Returns count deleted."""
    result = await memories_collection.delete_many({"user_id": user_id, "space_id": space_id})
    logger.info(f"Deleted {result.deleted_count} memories for user {user_id}, space {space_id}")
    return result.deleted_count


# ---------------------------------------------------------------------------
# Daily memory logs
# ---------------------------------------------------------------------------


async def append_memory_log(
    user_id: str,
    entry: str,
    space_id: Optional[str] = None,
    date: Optional[str] = None,
) -> MemoryLog:
    """Append an entry to the daily memory log (creates if needed)."""
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")

    now = datetime.utcnow()
    result = await memory_logs_collection.find_one_and_update(
        {"user_id": user_id, "space_id": space_id, "date": date},
        {
            "$push": {"entries": entry},
            "$set": {"updated_at": now},
            "$setOnInsert": {
                "user_id": user_id,
                "space_id": space_id,
                "date": date,
                "created_at": now,
            },
        },
        upsert=True,
        return_document=True,
    )
    result["_id"] = str(result["_id"])
    logger.info(f"Appended memory log for user {user_id}, space {space_id}, date {date}")
    return MemoryLog(**result)


async def get_memory_log(
    user_id: str,
    date: str,
    space_id: Optional[str] = None,
) -> Optional[MemoryLog]:
    """Get a memory log for a specific date."""
    doc = await memory_logs_collection.find_one({"user_id": user_id, "space_id": space_id, "date": date})
    if doc:
        doc["_id"] = str(doc["_id"])
        return MemoryLog(**doc)
    return None


async def get_recent_memory_logs(
    user_id: str,
    space_id: Optional[str] = None,
    limit: int = 7,
) -> List[MemoryLog]:
    """Get recent daily memory logs."""
    cursor = memory_logs_collection.find({"user_id": user_id, "space_id": space_id}).sort("date", -1).limit(limit)
    docs = await cursor.to_list(length=limit)

    results = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        results.append(MemoryLog(**doc))
    return results


# ---------------------------------------------------------------------------
# Context building (for injection into agent prompts)
# ---------------------------------------------------------------------------


async def get_memories_for_context(
    user_id: str,
    space_id: str,
    agent_id: Optional[str] = None,
) -> str:
    """Build a context string from stored memories for injection into prompts.

    If agent_id is provided, returns memories specific to that agent.
    Otherwise returns all memories for the user+space.
    """
    query: Dict[str, Any] = {"user_id": user_id, "space_id": space_id}
    if agent_id:
        query["agent_id"] = agent_id

    cursor = memories_collection.find(query).sort("updated_at", -1).limit(50)
    docs = await cursor.to_list(length=50)

    if not docs:
        return ""

    lines = []
    for doc in docs:
        lines.append(f"- {doc['key']}: {doc['value']}")

    return "## Agent Memory\nThings you've previously learned about this user:\n" + "\n".join(lines)


async def build_memory_context(user_id: str, space_id: Optional[str] = None) -> str:
    """Build a memory context string for injection into agent developer instructions.

    Returns a formatted block of text summarizing what the agent knows about
    the user, or an empty string if no memories exist.
    """
    facts = await list_memories(user_id, space_id)
    recent_logs = await get_recent_memory_logs(user_id, space_id, limit=3)

    if not facts and not recent_logs:
        return ""

    parts: List[str] = []
    parts.append("## Agent Memory (what you know about this user)")

    if facts:
        parts.append("")
        # Group by category
        categorized: Dict[str, List[MemoryFact]] = {}
        for fact in facts:
            cat = fact.category or "general"
            categorized.setdefault(cat, []).append(fact)

        for cat, cat_facts in sorted(categorized.items()):
            parts.append(f"### {cat.title()}")
            for fact in cat_facts:
                parts.append(f"- **{fact.key}**: {fact.value}")

    if recent_logs:
        parts.append("")
        parts.append("### Recent observations")
        for log in recent_logs:
            parts.append(f"**{log.date}**:")
            for entry in log.entries[-5:]:  # Last 5 entries per day
                parts.append(f"  - {entry}")

    return "\n".join(parts)
