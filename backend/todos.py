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
    agent_id: Optional[str] = None
    parent_id: Optional[str] = None  # ID of parent todo for sub-tasks
    subtask_ids: list[str] = []  # Ordered array of child todo IDs (on the parent)

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

        # Validate parent_id for sub-tasks
        if todo.parent_id:
            parent = await todos_collection.find_one({"_id": ObjectId(todo.parent_id)})
            if not parent:
                raise HTTPException(status_code=404, detail="Parent todo not found")
            if parent.get("space_id") != final_space_id:
                raise HTTPException(status_code=403, detail="Parent todo not in same space")
            if not parent.get("space_id") and parent.get("user_id") != todo.user_id:
                raise HTTPException(status_code=403, detail="Parent todo not owned by user")
            # Single-level nesting only
            if parent.get("parent_id"):
                raise HTTPException(status_code=400, detail="Cannot create sub-task of a sub-task")

        result = await todos_collection.insert_one(todo_dict)

        # Append new subtask ID to parent's subtask_ids array
        if todo.parent_id:
            await todos_collection.update_one(
                {"_id": ObjectId(todo.parent_id)},
                {"$push": {"subtask_ids": str(result.inserted_id)}},
            )

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
            # If this was a subtask, remove its ID from the parent's subtask_ids
            if todo.get("parent_id"):
                await todos_collection.update_one(
                    {"_id": ObjectId(todo["parent_id"])},
                    {"$pull": {"subtask_ids": todo_id}},
                )
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
            status = "complete" if new_completed_status else "incomplete"
            return {"message": f"Todo marked as {status}", "parent_id": todo.get("parent_id")}
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

        # Ensure parent_id and subtask_ids fields exist on all todos
        result = await todos_collection.update_many(
            {"parent_id": {"$exists": False}},
            {"$set": {"parent_id": None}},
        )
        if result.modified_count > 0:
            logger.info("Migrated %d legacy todos to have parent_id: None", result.modified_count)

        result = await todos_collection.update_many(
            {"subtask_ids": {"$exists": False}},
            {"$set": {"subtask_ids": []}},
        )
        if result.modified_count > 0:
            logger.info("Migrated %d legacy todos to have subtask_ids: []", result.modified_count)
    except Exception as e:
        logger.error(f"Error migrating legacy todos: {str(e)}")


async def get_subtasks(parent_id: str):
    """Get subtasks of a parent todo, ordered by the parent's subtask_ids array."""
    parent = await todos_collection.find_one({"_id": ObjectId(parent_id)})
    ordered_ids = parent.get("subtask_ids", []) if parent else []

    cursor = todos_collection.find({"parent_id": parent_id})
    subtasks = await cursor.to_list(length=100)
    subtask_map = {}
    for s in subtasks:
        s["_id"] = str(s["_id"])
        subtask_map[s["_id"]] = s

    # Return in the order defined by parent's subtask_ids, then any extras
    ordered = [subtask_map.pop(sid) for sid in ordered_ids if sid in subtask_map]
    ordered.extend(subtask_map.values())
    return ordered


async def handle_subtask_completion(todo_id: str, user_id: str):
    """Handle orchestration when a subtask is completed.

    Activates the next subtask's session and posts progress to the
    parent session. The managing agent is responsible for giving the
    final summary and completing the parent task.
    """
    todo = await todos_collection.find_one({"_id": ObjectId(todo_id)})
    if not todo or not todo.get("parent_id"):
        return  # Not a subtask

    parent_id = todo["parent_id"]

    # Import here to avoid circular imports
    from chat_sessions import append_message, find_session_by_todo
    from chat_sessions import sessions_collection as sess_coll

    # Find next uncompleted subtask using parent's subtask_ids order
    parent = await todos_collection.find_one({"_id": ObjectId(parent_id)})
    ordered_ids = parent.get("subtask_ids", []) if parent else []

    # Find current subtask's position and look for the next uncompleted one
    current_idx = ordered_ids.index(todo_id) if todo_id in ordered_ids else -1
    next_subtask = None
    if current_idx >= 0:
        for next_id in ordered_ids[current_idx + 1 :]:
            candidate = await todos_collection.find_one({"_id": ObjectId(next_id), "completed": False})
            if candidate:
                next_subtask = candidate
                break

    if next_subtask:
        # Activate next subtask's session
        next_todo_id = str(next_subtask["_id"])
        next_session = await find_session_by_todo(user_id, next_todo_id)
        if next_session:
            session_id = str(next_session["_id"])
            await sess_coll.update_one(
                {"_id": ObjectId(session_id)},
                {"$set": {"needs_agent_response": True}},
            )
            await append_message(
                session_id,
                user_id,
                "user",
                f"Previous subtask completed: \"{todo.get('text', '')}\". You may now begin this subtask.",
            )
            logger.info(f"Activated next subtask session {session_id} for todo {next_todo_id}")

    # Post progress update to parent session
    subtasks = await get_subtasks(parent_id)
    done_count = sum(1 for s in subtasks if s.get("completed"))
    total_count = len(subtasks)

    parent_session = await find_session_by_todo(user_id, parent_id)
    if parent_session:
        parent_session_id = str(parent_session["_id"])
        if done_count == total_count:
            # All subtasks done — notify managing agent to give final summary
            await append_message(
                parent_session_id,
                user_id,
                "user",
                f"All {total_count} subtasks are now complete. Please review the results and provide a final summary.",
            )
            logger.info(f"All subtasks done — notified parent session {parent_session_id}")
        else:
            # Progress update
            await append_message(
                parent_session_id,
                user_id,
                "user",
                f"Subtask completed: \"{todo.get('text', '')}\" ({done_count}/{total_count} done)",
            )
            logger.info(f"Posted progress to parent session: {done_count}/{total_count}")


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
