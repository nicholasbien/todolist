import logging
import os
from typing import List, Optional

import auth
from bson import ObjectId
from categories import init_default_categories
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

# Link to the frontend for invite emails (provided via env var)
WEBSITE_URL = os.getenv("WEBSITE_URL")


class Space(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    name: str
    owner_id: str
    member_ids: List[str] = []
    pending_emails: List[str] = []

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        allow_population_by_field_name = True


async def ensure_default_categories(user_id: str) -> None:
    """Ensure the user has default categories (space_id = None)."""
    # Initialize default categories for the default space if none exist
    await init_default_categories(None)
    logger.info("Ensured default categories for user %s", user_id)


async def create_space(name: str, owner_id: str) -> Space:
    """Create a new space owned by the given user."""
    member_ids = [owner_id]

    space = Space(
        name=name,
        owner_id=owner_id,
        member_ids=list(set(member_ids)),
    )
    space_dict = space.dict(by_alias=True)
    space_dict.pop("_id", None)
    result = await spaces_collection.insert_one(space_dict)
    created = await spaces_collection.find_one({"_id": result.inserted_id})
    created["_id"] = str(created["_id"])
    await init_default_categories(created["_id"])
    return Space(**created)


async def get_spaces_for_user(user_id: str) -> List[Space]:
    # Ensure default categories exist for space_id = None
    await ensure_default_categories(user_id)

    # Get user's actual spaces from database
    query = {"member_ids": user_id}
    cursor = spaces_collection.find(query)
    spaces = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        spaces.append(Space(**doc))

    # Add virtual "Default" space (space_id = None) at the beginning
    default_space = Space(
        id=None,  # This represents space_id = None
        name="Default",
        owner_id=user_id,
        member_ids=[user_id],
        pending_emails=[],
    )
    spaces.insert(0, default_space)

    # Sort remaining spaces alphabetically (Default is already first)
    if len(spaces) > 1:
        remaining_spaces = spaces[1:]
        remaining_spaces.sort(key=lambda s: s.name)
        spaces = [spaces[0]] + remaining_spaces

    return spaces


async def user_in_space(user_id: str, space_id: Optional[str]) -> bool:
    # Handle default space (space_id = None) - only the user themselves has access
    if space_id is None:
        return True  # User always has access to their own default space

    try:
        space = await spaces_collection.find_one({"_id": ObjectId(space_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid space ID")

    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    return user_id in space.get("member_ids", [])


async def invite_members(space_id: str, inviter_email: str, emails: List[str]) -> None:
    """Invite users to a space via email."""
    space = await spaces_collection.find_one({"_id": ObjectId(space_id)})
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    pending = set(space.get("pending_emails", []))
    member_ids = set(space.get("member_ids", []))

    # Deduplicate input emails
    unique_emails = set(emails)

    for email in unique_emails:
        user = await auth.users_collection.find_one({"email": email})
        if user:
            user_id = str(user["_id"])
            if user_id in member_ids:
                # Already a member - don't send another invite
                continue
            member_ids.add(user_id)
        else:
            if email in pending:
                # Already invited and pending
                continue
            pending.add(email)

        # Send invitation email (best effort)
        try:
            from email_summary import send_email

            # Get inviter's first name
            inviter_user = await auth.users_collection.find_one({"email": inviter_email})
            if inviter_user and inviter_user.get("name"):
                inviter_display = f"{inviter_user['name']} ({inviter_email})"
            else:
                inviter_display = inviter_email

            subject = "You've been invited to a todo space"
            body = f"{inviter_display} has invited you to collaborate on the space '{space['name']}'.\n"
            if WEBSITE_URL:
                body += f"Sign up at {WEBSITE_URL} to access the shared todos."
            else:
                body += "Sign up to access the shared todos."
            await send_email(email, subject, body)
        except Exception:
            logger.error("Failed to send invite email to %s", email)

    await spaces_collection.update_one(
        {"_id": ObjectId(space_id)},
        {"$set": {"member_ids": list(member_ids), "pending_emails": list(pending)}},
    )


async def add_user_to_pending_spaces(user_id: str, email: str) -> None:
    """Add the user to any spaces where their email was invited."""
    cursor = spaces_collection.find({"pending_emails": email})
    async for space in cursor:
        await spaces_collection.update_one(
            {"_id": space["_id"]},
            {"$addToSet": {"member_ids": user_id}, "$pull": {"pending_emails": email}},
        )


async def update_space(
    space_id: str, user_id: str, new_name: Optional[str] = None, collaborative: Optional[bool] = None
) -> Space:
    """Update a space's name or collaborative flag. Only the owner may update."""
    space = await spaces_collection.find_one({"_id": ObjectId(space_id)})
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    if space.get("owner_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the owner can rename the space")

    update: dict = {}
    if new_name is not None:
        update["name"] = new_name
    if collaborative is False:
        update["member_ids"] = [space["owner_id"]]
        update["pending_emails"] = []
    if update:
        await spaces_collection.update_one({"_id": ObjectId(space_id)}, {"$set": update})

    updated = await spaces_collection.find_one({"_id": ObjectId(space_id)})
    updated["_id"] = str(updated["_id"])
    return Space(**updated)


async def is_default_space(space_id: str, user_id: str) -> bool:
    """Check if the given space is the user's Default space."""
    space = await spaces_collection.find_one({"_id": ObjectId(space_id), "owner_id": user_id})
    return bool(space and space.get("name") == "Default")


async def delete_space(space_id: str, user_id: str) -> dict:
    """Delete a space and all its todos and categories."""
    space = await spaces_collection.find_one({"_id": ObjectId(space_id)})
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    if space.get("owner_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the owner can delete the space")
    if space.get("name") == "Default":
        raise HTTPException(status_code=400, detail="Cannot delete the Default space")

    # Import here to avoid circular imports
    from categories import categories_collection
    from todos import todos_collection

    # Delete all todos in this space
    todos_result = await todos_collection.delete_many({"space_id": space_id})

    # Delete all categories in this space
    categories_result = await categories_collection.delete_many({"space_id": space_id})

    # Delete the space itself
    await spaces_collection.delete_one({"_id": ObjectId(space_id)})

    message = f"Space deleted with {todos_result.deleted_count} todos and {categories_result.deleted_count} categories"
    return {"message": message}
