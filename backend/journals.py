import logging
from datetime import datetime
from typing import List, Optional

import auth
import pytz  # type: ignore
from bson import ObjectId
from db import db
from dotenv import load_dotenv
from fastapi import HTTPException
from pydantic import BaseModel, Field
from spaces import user_in_space

# Import will be done locally to avoid circular import

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# MongoDB connection provided by shared database module
journals_collection = db.journals


async def init_journal_indexes() -> None:
    """Create indexes used in frequent queries for optimal performance."""
    try:
        # Index by user for quick lookup
        await journals_collection.create_index("user_id")
        # Index by space for collaborative journaling
        await journals_collection.create_index("space_id")
        # Index by date for quick daily lookup
        await journals_collection.create_index("date")

        # Compound indexes for common query patterns
        # Most journal queries filter by user_id + date
        await journals_collection.create_index([("user_id", 1), ("date", 1)])
        # Space-aware queries
        await journals_collection.create_index([("user_id", 1), ("space_id", 1)])
        # Date range queries within spaces
        await journals_collection.create_index([("user_id", 1), ("space_id", 1), ("date", -1)])

        logger.info("Journal indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating journal indexes: {e}")


class JournalEntry(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    user_id: str
    space_id: Optional[str] = None
    date: str  # YYYY-MM-DD format
    text: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        populate_by_name = True


async def create_journal_entry(entry: JournalEntry, user_timezone: str) -> JournalEntry:
    """Create or update a journal entry for a specific date and space."""
    try:
        # Determine the user's timezone, defaulting to UTC if invalid
        try:
            tz = pytz.timezone(user_timezone)
        except Exception:
            tz = pytz.timezone("UTC")

        now = datetime.now(tz)

        # Check if entry already exists for this user, date, and space
        existing_entry = await journals_collection.find_one(
            {"user_id": entry.user_id, "date": entry.date, "space_id": entry.space_id}
        )

        entry_dict = entry.dict(by_alias=True, exclude_unset=True)
        entry_dict["updated_at"] = now

        if existing_entry:
            # Update existing entry
            entry_dict.pop("_id", None)  # Remove _id from update
            entry_dict.pop("created_at", None)  # Don't update created_at
            await journals_collection.update_one({"_id": existing_entry["_id"]}, {"$set": entry_dict})
            entry_dict["_id"] = str(existing_entry["_id"])
            entry_dict["created_at"] = existing_entry["created_at"]
        else:
            # Create new entry
            entry_dict.pop("_id", None)  # Let MongoDB generate _id
            entry_dict["created_at"] = now
            result = await journals_collection.insert_one(entry_dict)
            entry_dict["_id"] = str(result.inserted_id)

        logger.info(f"Journal entry saved for user {entry.user_id}, date {entry.date}, space {entry.space_id}")
        return JournalEntry(**entry_dict)

    except Exception as e:
        logger.error(f"Error creating/updating journal entry: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save journal entry: {str(e)}")


async def get_journal_entry_by_date(user_id: str, date: str, space_id: Optional[str] = None) -> Optional[JournalEntry]:
    """Get journal entry for a specific date and space."""
    try:
        entry = await journals_collection.find_one({"user_id": user_id, "date": date, "space_id": space_id})

        if entry:
            entry["_id"] = str(entry["_id"])
            return JournalEntry(**entry)
        return None

    except Exception as e:
        logger.error(f"Error fetching journal entry: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch journal entry: {str(e)}")


async def get_journal_entries(user_id: str, space_id: Optional[str] = None, limit: int = 30) -> List[JournalEntry]:
    """Get recent journal entries for a user, optionally filtered by space."""
    try:
        query = {"user_id": user_id}
        if space_id is not None:
            query["space_id"] = space_id

        cursor = journals_collection.find(query).sort("date", -1).limit(limit)
        entries = await cursor.to_list(length=limit)

        result = []
        for entry in entries:
            entry["_id"] = str(entry["_id"])
            result.append(JournalEntry(**entry))

        logger.info(f"Retrieved {len(result)} journal entries for user {user_id}, space {space_id}")
        return result

    except Exception as e:
        logger.error(f"Error fetching journal entries: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch journal entries: {str(e)}")


async def get_space_journal_entries(user_id: str, space_id: str, limit: int = 30) -> List[dict]:
    """Get recent journal entries for a space including all members."""
    try:
        if not await user_in_space(user_id, space_id):
            raise HTTPException(status_code=403, detail="Not in space")

        cursor = journals_collection.find({"space_id": space_id}).sort("date", -1).limit(limit)
        entries = await cursor.to_list(length=limit)

        user_ids = {ObjectId(e["user_id"]) for e in entries}
        user_map: dict[str, str] = {}
        if user_ids:
            async for u in auth.users_collection.find({"_id": {"$in": list(user_ids)}}):
                user_map[str(u["_id"])] = u.get("first_name", "")

        result: List[dict] = []
        for entry in entries:
            entry["_id"] = str(entry["_id"])
            entry["first_name"] = user_map.get(entry["user_id"], "")
            result.append(entry)

        logger.info(f"Retrieved {len(result)} journal entries for space {space_id} including all members")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching space journal entries: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch journal entries: {str(e)}")


async def delete_journal_entry(entry_id: str, user_id: str) -> bool:
    """Delete a journal entry by ID."""
    try:
        result = await journals_collection.delete_one({"_id": ObjectId(entry_id), "user_id": user_id})

        if result.deleted_count > 0:
            logger.info(f"Journal entry {entry_id} deleted successfully")
            return True
        else:
            logger.warning(f"Journal entry {entry_id} not found or not owned by user {user_id}")
            return False

    except Exception as e:
        logger.error(f"Error deleting journal entry: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete journal entry: {str(e)}")


async def generate_journal_summary(entry_text: str) -> str:
    """Generate AI summary of journal entry using OpenAI."""
    try:
        import os

        import openai

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")

        client = openai.AsyncOpenAI(api_key=api_key)

        prompt = f"""Summarize this journal entry in 2-3 sentences, highlighting key themes and insights:

{entry_text}

Summary:"""

        response = await client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a helpful assistant that creates concise, meaningful summaries of journal entries. "
                        "Focus on emotional themes, insights, and key events."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=150,
            temperature=1,
        )

        summary = response.choices[0].message.content.strip()
        logger.info("Generated journal summary successfully")
        return summary

    except Exception as e:
        logger.error(f"Error generating journal summary: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")


# Health check for database connection
async def health_check() -> dict:
    """Check journal collection health."""
    try:
        count = await journals_collection.count_documents({})
        return {"status": "healthy", "journal_entries_count": count, "collection": "journals"}
    except Exception as e:
        logger.error(f"Journal health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}
