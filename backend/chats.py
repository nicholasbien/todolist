import logging
from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from db import db
from fastapi import HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

chats_collection = db.chats


class ChatMessage(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    user_id: str
    role: str
    content: str
    space_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        populate_by_name = True


async def save_chat_message(message: ChatMessage) -> ChatMessage:
    """Persist a chat message to the database."""
    try:
        data = message.dict(by_alias=True, exclude_unset=True)
        data.pop("_id", None)
        result = await chats_collection.insert_one(data)
        data["_id"] = str(result.inserted_id)
        return ChatMessage(**data)
    except Exception as e:
        logger.error(f"Error saving chat message: {e}")
        raise HTTPException(status_code=500, detail="Failed to save chat message")


async def get_chat_history(user_id: str, space_id: Optional[str] = None, limit: int = 10) -> List[ChatMessage]:
    """Retrieve recent chat history for a user and optional space."""
    try:
        query = {"user_id": user_id}
        if space_id is not None:
            query["space_id"] = space_id
        cursor = chats_collection.find(query).sort("_id", -1).limit(limit)
        items = await cursor.to_list(length=limit)
        items.reverse()  # oldest first
        history: List[ChatMessage] = []
        for item in items:
            item["_id"] = str(item["_id"])
            history.append(ChatMessage(**item))
        return history
    except Exception as e:
        logger.error(f"Error retrieving chat history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get chat history")


async def delete_chat_history(user_id: str, space_id: Optional[str] = None) -> None:
    """Delete chat history for a user and optional space."""
    try:
        query = {"user_id": user_id}
        if space_id is not None:
            query["space_id"] = space_id
        await chats_collection.delete_many(query)
    except Exception as e:
        logger.error(f"Error deleting chat history: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete chat history")


async def init_chat_indexes() -> None:
    """Create indexes used for chat storage."""
    try:
        await chats_collection.create_index("user_id")
        await chats_collection.create_index("space_id")
        await chats_collection.create_index("created_at")
        await chats_collection.create_index([("user_id", 1), ("space_id", 1), ("created_at", -1)])
        logger.info("Chat indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating chat indexes: {e}")
