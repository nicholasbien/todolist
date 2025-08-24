import logging
import os
from typing import List, Optional
from urllib.parse import quote

import auth
from bson import ObjectId
from categories import init_default_categories
from db import db
from dotenv import load_dotenv
from fastapi import HTTPException
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

spaces_collection = db.spaces


async def init_space_indexes() -> None:
    """Create indexes used for space queries and member lookups."""
    try:
        # Single field indexes
        await spaces_collection.create_index("owner_id")
        await spaces_collection.create_index("member_ids")  # Array index for membership queries
        await spaces_collection.create_index("pending_emails")  # Array index for pending invites

        # Compound indexes for common patterns
        # Finding spaces owned by user OR where user is a member (union queries)
        await spaces_collection.create_index([("owner_id", 1), ("member_ids", 1)])

        logger.info("Space indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating space indexes: {e}")


# Link to the frontend for invite emails (provided via env var)
WEBSITE_URL = os.getenv("WEBSITE_URL")


class Space(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    name: str
    owner_id: str
    member_ids: List[str] = []
    is_default: bool = False

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        allow_population_by_field_name = True


async def get_default_space_id(user_id: str) -> str:
    """Get the default space ID for a user."""
    default_space = await spaces_collection.find_one({"owner_id": user_id, "is_default": True})
    if not default_space:
        raise HTTPException(status_code=404, detail="Default space not found for user")
    return str(default_space["_id"])


async def ensure_default_categories(user_id: str) -> None:
    """Ensure the user has default categories for their default space."""
    # Get the user's default space ID
    default_space_id = await get_default_space_id(user_id)
    # Initialize default categories for the actual default space
    await init_default_categories(default_space_id)
    logger.info("Ensured default categories for user %s in default space %s", user_id, default_space_id)


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

    # DEBUG: Log found spaces from database
    logger.info(f"DEBUG: Found {len(spaces)} spaces in database for user {user_id}")
    for space in spaces:
        logger.info(f"DEBUG: Space from DB - ID: {space.id}, Name: {space.name}, Owner: {space.owner_id}")

    # Sort spaces with default first, then alphabetically
    default_spaces = [s for s in spaces if s.is_default]
    other_spaces = [s for s in spaces if not s.is_default]
    other_spaces.sort(key=lambda s: s.name)

    return default_spaces + other_spaces


async def user_in_space(user_id: str, space_id: str) -> bool:
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
                signup_link = f"{WEBSITE_URL}?email={quote(email)}"
                body += f"Sign up at {signup_link} to access the shared todos."
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


async def leave_space(space_id: str, user_id: str) -> dict:
    """Remove a user from a space's member list."""
    space = await spaces_collection.find_one({"_id": ObjectId(space_id)})
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    if space.get("owner_id") == user_id:
        raise HTTPException(status_code=400, detail="Owner cannot leave their own space")
    if user_id not in space.get("member_ids", []):
        raise HTTPException(status_code=400, detail="User is not a member of this space")
    await spaces_collection.update_one({"_id": ObjectId(space_id)}, {"$pull": {"member_ids": user_id}})
    return {"message": "Left space"}


async def is_default_space(space_id: str, user_id: str) -> bool:
    """Check if the given space is the user's default space."""
    space = await spaces_collection.find_one({"_id": ObjectId(space_id), "owner_id": user_id})
    return bool(space and space.get("is_default"))


async def delete_space(space_id: str, user_id: str) -> dict:
    """Delete a space and all its todos and categories."""
    space = await spaces_collection.find_one({"_id": ObjectId(space_id)})
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    if space.get("owner_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the owner can delete the space")
    if space.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete the Personal space")

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


async def list_space_members(space_id: str, current_user_id: str) -> dict:
    """Return member information based on user's role in the space."""
    space = await spaces_collection.find_one({"_id": ObjectId(space_id)})
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    is_owner = space.get("owner_id") == current_user_id

    member_ids = [ObjectId(mid) for mid in space.get("member_ids", [])]
    members_cursor = auth.users_collection.find({"_id": {"$in": member_ids}})

    members = []
    async for user in members_cursor:
        if is_owner:
            # Owners can see emails and pending invites
            members.append(
                {
                    "id": str(user["_id"]),
                    "email": user["email"],
                    "first_name": user.get("first_name", ""),
                }
            )
        else:
            # Non-owners can only see first names
            members.append(
                {
                    "id": str(user["_id"]),
                    "first_name": user.get("first_name", ""),
                }
            )

    # Only owners can see pending invites
    result = {"members": members}
    if is_owner:
        result["pending_invites"] = space.get("pending_emails", [])

    return result


# Migration to convert conceptual default spaces to actual space documents
async def migrate_default_spaces() -> None:
    """
    One-time migration to convert conceptual default spaces (space_id=None)
    to actual default space documents with proper space_id values.
    """
    try:
        from categories import categories_collection
        from todos import todos_collection

        # Find all users who have todos with space_id=None
        user_ids = set()
        todos_cursor = todos_collection.find({"space_id": None})
        async for todo in todos_cursor:
            if "user_id" in todo:
                user_ids.add(todo["user_id"])
            else:
                logger.warning(f"Todo {todo.get('_id')} missing user_id field, skipping")

        if not user_ids:
            logger.info("No users found with default space data to migrate")
            return

        logger.info(f"Migrating default spaces for {len(user_ids)} users")

        # Create default space for each user and update their data
        for user_id in user_ids:
            # Check if user already has a default space
            existing_default = await spaces_collection.find_one({"owner_id": user_id, "name": "Personal"})

            if existing_default:
                default_space_id = str(existing_default["_id"])
                # Ensure existing default space has is_default flag
                await spaces_collection.update_one({"_id": existing_default["_id"]}, {"$set": {"is_default": True}})
                logger.info(f"User {user_id} already has default space: {default_space_id}")
            else:
                # Create new default space
                default_space = {
                    "name": "Personal",
                    "owner_id": user_id,
                    "member_ids": [user_id],
                    "pending_emails": [],
                    "is_default": True,
                }

                result = await spaces_collection.insert_one(default_space)
                default_space_id = str(result.inserted_id)
                logger.info(f"Created default space {default_space_id} for user {user_id}")

            # Update todos to use the new default space_id
            todos_result = await todos_collection.update_many(
                {"user_id": user_id, "space_id": None}, {"$set": {"space_id": default_space_id}}
            )

            if todos_result.modified_count > 0:
                logger.info(f"Updated {todos_result.modified_count} todos for user {user_id}")

        # Migrate categories from space_id=None to default spaces
        # First, get all default categories
        default_categories_cursor = categories_collection.find({"space_id": None})
        default_categories = []
        async for category in default_categories_cursor:
            default_categories.append(category["name"])

        # Create these categories for each user's default space
        for user_id in user_ids:
            default_space = await spaces_collection.find_one({"owner_id": user_id, "name": "Personal"})

            if default_space:
                default_space_id = str(default_space["_id"])

                for category_name in default_categories:
                    # Check if category already exists for this space
                    existing = await categories_collection.find_one(
                        {"name": category_name, "space_id": default_space_id}
                    )

                    if not existing:
                        await categories_collection.insert_one({"name": category_name, "space_id": default_space_id})

        # Remove the old categories with space_id=None
        categories_result = await categories_collection.delete_many({"space_id": None})
        logger.info(f"Removed {categories_result.deleted_count} categories with space_id=None")

        # Verify migration
        remaining_todos = await todos_collection.count_documents({"space_id": None})
        remaining_categories = await categories_collection.count_documents({"space_id": None})

        if remaining_todos == 0 and remaining_categories == 0:
            logger.info("✅ Default space migration completed successfully")
        else:
            logger.warning(
                f"⚠️ Migration incomplete: {remaining_todos} todos and "
                f"{remaining_categories} categories still have space_id=None"
            )

    except Exception as e:
        logger.error(f"Error migrating default spaces: {str(e)}")
