import logging
import os
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel


class CategoryRename(BaseModel):
    new_name: str


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
USE_MOCK_DB = os.getenv("USE_MOCK_DB", "false").lower() == "true"

if USE_MOCK_DB:
    from mongomock_motor import AsyncMongoMockClient

    client = AsyncMongoMockClient()
else:
    client = AsyncIOMotorClient(MONGODB_URL)

db = client.todo_db
categories_collection = db.categories

# Shared default categories
DEFAULT_CATEGORIES = [
    "Work",
    "Personal",
    "Shopping",
    "Finance",
    "Health",
    "General",
]


# Pydantic model
class Category(BaseModel):
    name: str
    space_id: Optional[str] = None


async def get_categories(space_id: Optional[str] = None) -> List[str]:
    """Get all categories for a space, or default space categories if space_id is None."""
    try:
        # Query for categories with matching space_id (including None)
        cursor = categories_collection.find({"space_id": space_id}, {"name": 1, "_id": 0})

        categories = []
        async for doc in cursor:
            categories.append(doc["name"])

        # If no categories found for default space, return default categories
        if space_id is None and not categories:
            return DEFAULT_CATEGORIES.copy()

        return categories
    except Exception as e:
        logger.error(f"Error fetching categories: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching categories: {str(e)}")


async def add_category(category: Category) -> dict:
    """Add a new category to the database for a space."""
    try:
        # Query for existing category
        query = {"name": category.name, "space_id": category.space_id}

        existing = await categories_collection.find_one(query)
        if existing:
            raise HTTPException(status_code=400, detail="Category already exists")

        # Insert category
        doc = {"name": category.name, "space_id": category.space_id}

        await categories_collection.insert_one(doc)
        return {"message": f"Category {category.name} added successfully"}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error adding category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error adding category: {str(e)}")


async def delete_category(name: str, space_id: Optional[str] = None) -> dict:
    """Delete a category from a space and reassign todos to General."""
    try:
        # Query for existing category
        query = {"name": name, "space_id": space_id}

        existing = await categories_collection.find_one(query)
        if not existing:
            raise HTTPException(status_code=404, detail="Category not found")

        # Import todos collection to avoid circular import issues
        from todos import todos_collection

        # Update todos
        todo_query = {"category": name, "space_id": space_id}

        update_result = await todos_collection.update_many(todo_query, {"$set": {"category": "General"}})

        delete_result = await categories_collection.delete_one(query)

        if delete_result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Category not found")

        message = f"Category {name} deleted successfully"
        if update_result.modified_count > 0:
            message += f" and {update_result.modified_count} todos moved to General"

        return {"message": message}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error deleting category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting category: {str(e)}")


async def rename_category(old_name: str, new_name: str, space_id: Optional[str] = None) -> dict:
    """Rename a category within a space and update todos referencing it."""
    try:
        # Query for existing category
        query = {"name": old_name, "space_id": space_id}

        existing = await categories_collection.find_one(query)
        if not existing:
            raise HTTPException(status_code=404, detail="Category not found")

        # Check if new name already exists
        new_query = {"name": new_name, "space_id": space_id}

        if await categories_collection.find_one(new_query):
            raise HTTPException(status_code=400, detail="Category with new name already exists")

        await categories_collection.update_one(query, {"$set": {"name": new_name}})

        # Import todos collection to avoid circular import issues
        from todos import todos_collection

        # Update todos
        todo_query = {"category": old_name, "space_id": space_id}

        await todos_collection.update_many(todo_query, {"$set": {"category": new_name}})

        return {"message": f"Category {old_name} renamed to {new_name}"}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error renaming category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error renaming category: {str(e)}")


# Migrate legacy categories to have space_id field
async def migrate_legacy_categories() -> None:
    try:
        # Update all categories that don't have space_id field to have space_id: None
        result = await categories_collection.update_many({"space_id": {"$exists": False}}, {"$set": {"space_id": None}})
        if result.modified_count > 0:
            logger.info("Migrated %d legacy categories to have space_id: None", result.modified_count)
    except Exception as e:
        logger.error(f"Error migrating legacy categories: {str(e)}")


# Initialize default categories for a space if none exist
async def init_default_categories(space_id: Optional[str] = None) -> None:
    try:
        # Initialize default categories for the specified space_id (including None)
        count = await categories_collection.count_documents({"space_id": space_id})
        if count == 0:
            await categories_collection.insert_many([{"name": cat, "space_id": space_id} for cat in DEFAULT_CATEGORIES])
            logger.info("Initialized default categories for space %s", space_id or "default")
    except Exception as e:
        logger.error(f"Error initializing default categories: {str(e)}")
