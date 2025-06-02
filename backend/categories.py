import logging
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv
import os

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

# Pydantic model
class Category(BaseModel):
    name: str

async def get_categories() -> List[str]:
    """Get all categories from the database."""
    try:
        cursor = categories_collection.find({}, {"name": 1, "_id": 0})
        categories = []
        async for doc in cursor:
            categories.append(doc["name"])
        return categories
    except Exception as e:
        logger.error(f"Error fetching categories: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching categories: {str(e)}")

async def add_category(category: Category) -> dict:
    """Add a new category to the database."""
    try:
        # Check if category already exists
        existing = await categories_collection.find_one({"name": category.name})
        if existing:
            raise HTTPException(status_code=400, detail="Category already exists")
        
        # Insert new category
        await categories_collection.insert_one({"name": category.name})
        return {"message": f"Category {category.name} added successfully"}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error adding category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error adding category: {str(e)}")

async def delete_category(name: str) -> dict:
    """Delete a category from the database and reassign affected todos to General."""
    try:
        # First check if category exists
        existing = await categories_collection.find_one({"name": name})
        if not existing:
            raise HTTPException(status_code=404, detail="Category not found")
        
        # Update todos that use this category to "General"
        from todos import todos_collection
        update_result = await todos_collection.update_many(
            {"category": name},
            {"$set": {"category": "General"}}
        )
        
        # Delete the category
        result = await categories_collection.delete_one({"name": name})
        
        message = f"Category {name} deleted successfully"
        if update_result.modified_count > 0:
            message += f" and {update_result.modified_count} todos moved to General"
        
        return {"message": message}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error deleting category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting category: {str(e)}")

# Initialize default categories if none exist
async def init_default_categories():
    try:
        count = await categories_collection.count_documents({})
        if count == 0:
            default_categories = ["Work", "Personal", "Shopping", "Finance", "Health", "General"]
            await categories_collection.insert_many([{"name": cat} for cat in default_categories])
            logger.info("Initialized default categories")
    except Exception as e:
        logger.error(f"Error initializing default categories: {str(e)}") 