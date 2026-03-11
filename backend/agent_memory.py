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
from db import db
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MongoDB collections
memories_collection = db.agent_memories
memory_logs_collection = db.agent_memory_logs


async def init_memory_indexes() -> None:
    """Create indexes for optimal memory query performance."""
    try:
        # Unique constraint: one fact per key per user per space
        await memories_collection.create_index(
            [("user_id", 1), ("space_id", 1), ("key", 1)],
            unique=True,
        )
        await memories_collection.create_index("user_id")
        await memories_collection.create_index([("user_id", 1), ("space_id", 1)])

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


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class MemoryFact(BaseModel):
    """A single key-value fact the agent remembers about the user."""

    id: Optional[str] = Field(alias="_id", default=None)
    user_id: str
    space_id: Optional[str] = None
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
# Memory facts CRUD
# ---------------------------------------------------------------------------


async def save_memory(
    user_id: str,
    key: str,
    value: str,
    space_id: Optional[str] = None,
    category: Optional[str] = None,
) -> MemoryFact:
    """Save or update a memory fact (upsert by user+space+key)."""
    now = datetime.utcnow()
    result = await memories_collection.find_one_and_update(
        {"user_id": user_id, "space_id": space_id, "key": key},
        {
            "$set": {
                "value": value,
                "category": category,
                "updated_at": now,
            },
            "$setOnInsert": {
                "user_id": user_id,
                "space_id": space_id,
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


async def delete_memory(user_id: str, key: str, space_id: Optional[str] = None) -> bool:
    """Delete a specific memory fact."""
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
