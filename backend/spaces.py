import logging
import os
from typing import List, Optional

from auth import users_collection
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
USE_MOCK_DB = os.getenv("USE_MOCK_DB", "false").lower() == "true"
client = AsyncMongoMockClient() if USE_MOCK_DB else AsyncIOMotorClient(MONGODB_URL)
db = client.todo_db
spaces_collection = db.spaces


class Space(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    name: str
    owner_id: str
    member_ids: List[str] = []

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        allow_population_by_field_name = True


async def ensure_default_space(user_id: str) -> str:
    """Ensure the user has a Default space and return its ID."""
    existing = await spaces_collection.find_one({"owner_id": user_id, "name": "Default"})
    if existing:
        return str(existing["_id"])

    space = Space(name="Default", owner_id=user_id, member_ids=[user_id])
    space_dict = space.dict(by_alias=True)
    space_dict.pop("_id", None)
    result = await spaces_collection.insert_one(space_dict)
    logger.info("Created Default space for user %s", user_id)
    return str(result.inserted_id)


async def create_space(name: str, owner_id: str, member_emails: List[str]) -> Space:
    """Create a new collaboration space."""
    member_ids = [owner_id]
    for email in member_emails:
        user = await users_collection.find_one({"email": email})
        if not user:
            raise HTTPException(status_code=404, detail=f"User not found: {email}")
        member_ids.append(str(user["_id"]))

    space = Space(name=name, owner_id=owner_id, member_ids=list(set(member_ids)))
    space_dict = space.dict(by_alias=True)
    space_dict.pop("_id", None)
    result = await spaces_collection.insert_one(space_dict)
    created = await spaces_collection.find_one({"_id": result.inserted_id})
    created["_id"] = str(created["_id"])
    return Space(**created)


async def get_spaces_for_user(user_id: str) -> List[Space]:
    await ensure_default_space(user_id)
    query = {"member_ids": user_id}
    cursor = spaces_collection.find(query)
    spaces = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        spaces.append(Space(**doc))
    return spaces


async def user_in_space(user_id: str, space_id: str) -> bool:
    space = await spaces_collection.find_one({"_id": ObjectId(space_id)})
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    return user_id in space.get("member_ids", [])
