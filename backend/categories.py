import logging
import os
from typing import List

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
    space_id: str


async def get_categories(space_id: str) -> List[str]:
    """Get all categories for a space."""
    try:
        cursor = categories_collection.find({"space_id": space_id}, {"name": 1, "_id": 0})
        categories = []
        async for doc in cursor:
            categories.append(doc["name"])
        return categories
    except Exception as e:
        logger.error(f"Error fetching categories: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching categories: {str(e)}")


async def add_category(category: Category) -> dict:
    """Add a new category to the database for a space."""
    try:
        existing = await categories_collection.find_one({"name": category.name, "space_id": category.space_id})
        if existing:
            raise HTTPException(status_code=400, detail="Category already exists")

        await categories_collection.insert_one({"name": category.name, "space_id": category.space_id})
        return {"message": f"Category {category.name} added successfully"}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error adding category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error adding category: {str(e)}")


async def delete_category(name: str, space_id: str) -> dict:
    """Delete a category from a space and reassign todos to General."""
    try:
        existing = await categories_collection.find_one({"name": name, "space_id": space_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Category not found")

        from todos import todos_collection

        update_result = await todos_collection.update_many(
            {"category": name, "space_id": space_id}, {"$set": {"category": "General"}}
        )

        delete_result = await categories_collection.delete_one({"name": name, "space_id": space_id})

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


async def rename_category(old_name: str, new_name: str, space_id: str) -> dict:
    """Rename a category within a space and update todos referencing it."""
    try:
        existing = await categories_collection.find_one({"name": old_name, "space_id": space_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Category not found")

        if await categories_collection.find_one({"name": new_name, "space_id": space_id}):
            raise HTTPException(status_code=400, detail="Category with new name already exists")

        await categories_collection.update_one({"name": old_name, "space_id": space_id}, {"$set": {"name": new_name}})

        from todos import todos_collection

        await todos_collection.update_many(
            {"category": old_name, "space_id": space_id}, {"$set": {"category": new_name}}
        )

        return {"message": f"Category {old_name} renamed to {new_name}"}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error renaming category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error renaming category: {str(e)}")


# Initialize default categories for a space if none exist
async def init_default_categories(space_id: str) -> None:
    try:
        count = await categories_collection.count_documents({"space_id": space_id})
        if count == 0:
            await categories_collection.insert_many([{"name": cat, "space_id": space_id} for cat in DEFAULT_CATEGORIES])
            logger.info("Initialized default categories for space %s", space_id)
    except Exception as e:
        logger.error(f"Error initializing default categories: {str(e)}")
