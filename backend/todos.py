import logging
import os
from datetime import datetime
from typing import Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
USE_MOCK_DB = os.getenv("USE_MOCK_DB", "false").lower() == "true"
client = AsyncMongoMockClient() if USE_MOCK_DB else AsyncIOMotorClient(MONGODB_URL)
db = client.todo_db
todos_collection = db.todos


# Pydantic models
class Todo(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    text: str
    link: Optional[str] = None
    category: str
    priority: str
    dateAdded: str
    completed: bool = False
    dateCompleted: Optional[str] = None
    user_id: str

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        allow_population_by_field_name = True


async def create_todo(todo: Todo):
    try:
        # Convert todo to dict and remove the id field
        todo_dict = todo.dict(by_alias=True)
        todo_dict.pop("_id", None)  # Remove _id if it exists

        # Insert the document - MongoDB will automatically generate an _id
        result = await todos_collection.insert_one(todo_dict)

        # Get the inserted document with the new _id
        created_todo = await todos_collection.find_one({"_id": result.inserted_id})
        if not created_todo:
            raise HTTPException(status_code=404, detail="Created todo not found")

        # Convert ObjectId to string
        created_todo["_id"] = str(created_todo["_id"])
        return Todo(**created_todo)
    except Exception as e:
        logger.error(f"Error creating todo: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating todo: {str(e)}")


async def get_todos(user_id: str):
    try:
        todos = []
        query = {"user_id": user_id}
        cursor = todos_collection.find(query)
        async for todo in cursor:
            # Ensure _id is properly converted to string
            todo["_id"] = str(todo["_id"])
            todo_obj = Todo(**todo)
            todos.append(todo_obj)
        return todos
    except Exception as e:
        logger.error(f"Error fetching todos: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching todos: {str(e)}")


async def delete_todo(todo_id: str, user_id: str):
    try:
        # Check if todo_id is valid
        if not todo_id or todo_id == "None" or todo_id == "undefined":
            raise HTTPException(status_code=400, detail="Invalid todo ID")

        try:
            object_id = ObjectId(todo_id)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid todo ID format: {todo_id}")

        # Build query with user_id filter
        query = {"_id": object_id, "user_id": user_id}

        result = await todos_collection.delete_one(query)
        if result.deleted_count == 1:
            return {"message": "Todo deleted successfully"}
        raise HTTPException(status_code=404, detail="Todo not found")
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error deleting todo: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting todo: {str(e)}")


async def complete_todo(todo_id: str, user_id: str):
    try:
        # Check if todo_id is valid
        if not todo_id or todo_id == "None" or todo_id == "undefined":
            raise HTTPException(status_code=400, detail="Invalid todo ID")

        try:
            object_id = ObjectId(todo_id)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid todo ID format: {todo_id}")

        # Build query with user_id filter
        query = {"_id": object_id, "user_id": user_id}

        # First get the current todo to check its completion status
        todo = await todos_collection.find_one(query)
        if not todo:
            raise HTTPException(status_code=404, detail="Todo not found")

        # Toggle the completion status
        new_completed_status = not todo.get("completed", False)

        # Update with different operations based on completion status
        if new_completed_status:
            # Setting as complete - set both fields
            result = await todos_collection.update_one(
                query, {"$set": {"completed": True, "dateCompleted": datetime.now().isoformat()}}
            )
        else:
            # Setting as incomplete - set completed to false and remove dateCompleted
            result = await todos_collection.update_one(
                query, {"$set": {"completed": False}, "$unset": {"dateCompleted": ""}}
            )
        if result.modified_count == 1:
            status = "complete" if new_completed_status else "incomplete"
            return {"message": f"Todo marked as {status}"}
        raise HTTPException(status_code=404, detail="Todo not found")
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error updating todo: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating todo: {str(e)}")


async def update_todo_fields(todo_id: str, updates: dict, user_id: str):
    try:
        # Check if todo_id is valid
        if not todo_id or todo_id == "None" or todo_id == "undefined":
            raise HTTPException(status_code=400, detail="Invalid todo ID")

        try:
            object_id = ObjectId(todo_id)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid todo ID format: {todo_id}")

        # Build query with user_id filter
        query = {"_id": object_id, "user_id": user_id}

        # Update the todo with provided fields
        result = await todos_collection.update_one(query, {"$set": updates})
        if result.modified_count == 1:
            updated_fields = ", ".join(f"{k} to {v}" for k, v in updates.items())
            return {"message": f"Todo updated: {updated_fields}"}
        raise HTTPException(status_code=404, detail="Todo not found")
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error updating todo: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating todo: {str(e)}")


async def health_check():
    try:
        await db.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")
