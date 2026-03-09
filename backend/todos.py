import logging
from datetime import datetime
from typing import Dict, Optional

import auth
from bson import ObjectId
from db import db
from dotenv import load_dotenv
from fastapi import HTTPException
from pydantic import BaseModel, Field
from spaces import user_in_space

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# MongoDB connection provided by shared database module
todos_collection = db.todos


async def init_todo_indexes() -> None:
    """Create indexes used in frequent queries for optimal performance."""
    try:
        # Index by user for quick lookup in the default space
        await todos_collection.create_index("user_id")
        # Index by space for collaborative spaces
        await todos_collection.create_index("space_id")
        await todos_collection.create_index("completed")

        # Compound indexes for common query patterns
        # Most todos queries filter by user_id + space_id together
        await todos_collection.create_index([("user_id", 1), ("space_id", 1)])
        # Also add the reverse compound index for space-first queries
        await todos_collection.create_index([("space_id", 1), ("user_id", 1)])

        # Queries for completed/uncompleted todos within a space
        await todos_collection.create_index([("user_id", 1), ("space_id", 1), ("completed", 1)])

        # Queries sorted by date (most recent first)
        await todos_collection.create_index([("user_id", 1), ("space_id", 1), ("dateAdded", -1)])

        # Queries by category within a space
        await todos_collection.create_index([("user_id", 1), ("space_id", 1), ("category", 1)])

        # Sub-task lookups by parent
        await todos_collection.create_index("parent_id")

        logger.info("Todo indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating todo indexes: {e}")


# Pydantic models
class Todo(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    text: str
    link: Optional[str] = None
    category: str = "General"
    priority: str = "Medium"
    dateAdded: str
    dueDate: Optional[str] = None
    sortOrder: Optional[int] = None
    notes: Optional[str] = None
    completed: bool = False
    dateCompleted: Optional[str] = None
    user_id: str
    first_name: Optional[str] = None
    space_id: Optional[str] = None
    created_offline: bool = False
    creator_type: str = "user"  # "user" or "agent"
    parent_id: Optional[str] = None  # ID of parent todo for sub-tasks

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        populate_by_name = True


async def create_todo(todo: Todo):
    try:
        todo_dict = todo.dict(by_alias=True)
        todo_dict.pop("_id", None)

        # If no space_id provided, assign to user's default space
        if not todo.space_id:
            from spaces import spaces_collection

            default_space = await spaces_collection.find_one({"owner_id": todo.user_id, "is_default": True})
            if default_space:
                todo_dict["space_id"] = str(default_space["_id"])

        # Check space access using the final space_id (either provided or assigned)
        final_space_id = todo_dict.get("space_id")
        if final_space_id and not await user_in_space(todo.user_id, final_space_id):
            raise HTTPException(status_code=403, detail="Not in space")

        # Validate parent_id belongs to same user/space
        if todo.parent_id:
            parent = await todos_collection.find_one({"_id": ObjectId(todo.parent_id)})
            if not parent:
                raise HTTPException(status_code=404, detail="Parent todo not found")
            if parent.get("space_id") != final_space_id:
                raise HTTPException(status_code=403, detail="Parent todo not in same space")
            if not parent.get("space_id") and parent.get("user_id") != todo.user_id:
                raise HTTPException(status_code=403, detail="Parent todo not owned by user")
            # Prevent nested sub-tasks (only one level)
            if parent.get("parent_id"):
                raise HTTPException(status_code=400, detail="Cannot create sub-task of a sub-task")

        result = await todos_collection.insert_one(todo_dict)

        # Get the inserted document with the new _id
        created_todo = await todos_collection.find_one({"_id": result.inserted_id})
        if not created_todo:
            raise HTTPException(status_code=404, detail="Created todo not found")

        # Convert ObjectId to string
        created_todo["_id"] = str(created_todo["_id"])

        # Add user's first name for collaborative spaces
        try:
            user = await auth.users_collection.find_one({"_id": ObjectId(created_todo["user_id"])})
            if user:
                created_todo["first_name"] = user.get("first_name", "")
        except Exception:
            created_todo["first_name"] = ""

        return Todo(**created_todo)
    except Exception as e:
        logger.error(f"Error creating todo: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating todo: {str(e)}")


async def get_todos(user_id: str, space_id: Optional[str] | None = None):
    try:
        todos = []
        query: Dict[str, Optional[str]] = {"space_id": space_id}
        if space_id:
            try:
                is_member = await user_in_space(user_id, space_id)
                if not is_member:
                    raise HTTPException(status_code=403, detail="Not in space")
            except HTTPException as e:
                # If it's a 404 (space not found), convert to 403 for security
                if e.status_code == 404:
                    raise HTTPException(status_code=403, detail="Not in space")
                # If it's already 403, re-raise as is
                raise
            except Exception:
                # Any other error should be treated as access denied
                raise HTTPException(status_code=403, detail="Not in space")
            # In collaborative spaces, show todos from ALL members
            # Don't filter on user
        else:
            # In default space, only show user's own todos
            query["user_id"] = user_id
        cursor = todos_collection.find(query)
        raw_todos = await cursor.to_list(length=None)

        # Lookup all users in one query to avoid N+1 pattern
        user_ids = {ObjectId(t["user_id"]) for t in raw_todos}
        user_map = {}
        if user_ids:
            async for u in auth.users_collection.find({"_id": {"$in": list(user_ids)}}):
                user_map[str(u["_id"])] = u.get("first_name", "")

        for todo in raw_todos:
            todo["_id"] = str(todo["_id"])
            todo["first_name"] = user_map.get(todo["user_id"], "")
            todos.append(Todo(**todo))

        return todos
    except HTTPException:
        # Re-raise HTTP exceptions (like 403) without conversion
        raise
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

        query = {"_id": object_id}
        todo = await todos_collection.find_one(query)
        if not todo:
            raise HTTPException(status_code=404, detail="Todo not found")
        if todo.get("space_id") and not await user_in_space(user_id, todo["space_id"]):
            raise HTTPException(status_code=403, detail="Not in space")
        result = await todos_collection.delete_one(query)
        if result.deleted_count == 1:
            # Cascade delete: remove all sub-tasks if this was a parent
            await todos_collection.delete_many({"parent_id": todo_id})
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

        query = {"_id": object_id}
        todo = await todos_collection.find_one(query)
        if not todo:
            raise HTTPException(status_code=404, detail="Todo not found")
        if todo.get("space_id") and not await user_in_space(user_id, todo["space_id"]):
            raise HTTPException(status_code=403, detail="Not in space")

        # First get the current todo to check its completion status

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
            # Auto-complete logic for sub-tasks
            # Scope parent query to same space to prevent cross-user manipulation
            if todo.get("parent_id"):
                parent_query = {"_id": ObjectId(todo["parent_id"])}
                if todo.get("space_id"):
                    parent_query["space_id"] = todo["space_id"]
                else:
                    parent_query["user_id"] = user_id

                if new_completed_status:
                    # Check if all sibling sub-tasks are now complete
                    incomplete_siblings = await todos_collection.count_documents(
                        {
                            "parent_id": todo["parent_id"],
                            "completed": False,
                        }
                    )
                    if incomplete_siblings == 0:
                        await todos_collection.update_one(
                            parent_query,
                            {"$set": {"completed": True, "dateCompleted": datetime.now().isoformat()}},
                        )
                else:
                    # Uncompleting a sub-task → uncomplete parent if it was auto-completed
                    await todos_collection.update_one(
                        {**parent_query, "completed": True},
                        {"$set": {"completed": False}, "$unset": {"dateCompleted": ""}},
                    )

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
        logger.info(f"UPDATE DEBUG - todo_id: {todo_id}, updates: {updates}, user_id: {user_id}")

        # Check if todo_id is valid
        if not todo_id or todo_id == "None" or todo_id == "undefined":
            raise HTTPException(status_code=400, detail="Invalid todo ID")

        try:
            object_id = ObjectId(todo_id)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid todo ID format: {todo_id}")

        query = {"_id": object_id}
        todo = await todos_collection.find_one(query)
        if not todo:
            raise HTTPException(status_code=404, detail="Todo not found")
        if todo.get("space_id") and not await user_in_space(user_id, todo["space_id"]):
            raise HTTPException(status_code=403, detail="Not in space")

        result = await todos_collection.update_one(query, {"$set": updates})
        if result.matched_count == 1:
            # Get the updated todo document
            updated_todo = await todos_collection.find_one({"_id": object_id})
            if updated_todo:
                # Convert ObjectId to string
                updated_todo["_id"] = str(updated_todo["_id"])

                # Add user's first name for collaborative spaces
                try:
                    user = await auth.users_collection.find_one({"_id": ObjectId(updated_todo["user_id"])})
                    if user:
                        updated_todo["first_name"] = user.get("first_name", "")
                except Exception:
                    updated_todo["first_name"] = ""

                return Todo(**updated_todo)
            else:
                raise HTTPException(status_code=404, detail="Updated todo not found")
        raise HTTPException(status_code=404, detail="Todo not found")
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error updating todo - Exception type: {type(e)}, Exception args: {e.args}, Exception: {repr(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating todo: {repr(e)}")


# Migrate legacy todos to have space_id field
async def migrate_legacy_todos() -> None:
    try:
        # Update all todos that don't have space_id field to have space_id: None
        result = await todos_collection.update_many({"space_id": {"$exists": False}}, {"$set": {"space_id": None}})
        if result.modified_count > 0:
            logger.info("Migrated %d legacy todos to have space_id: None", result.modified_count)
    except Exception as e:
        logger.error(f"Error migrating legacy todos: {str(e)}")


async def health_check():
    try:
        # Try ping first, fall back to listing collections for mock DBs
        try:
            await db.command("ping")
        except (TypeError, AttributeError, NotImplementedError):
            # mongomock doesn't support db.command; verify connectivity another way
            await db.list_collection_names()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")
