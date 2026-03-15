"""Miscellaneous routes: contact, insights, activity feed, export, memories, health."""

import csv
import json
import logging
from io import StringIO
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from activity_feed import get_activity_feed

# Memory feature disabled for initial release
# from agent_memory import get_recent_memory_logs
from journals import journals_collection
from spaces import get_spaces_for_user, user_in_space
from todos import get_todos, health_check, todos_collection

from .dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["misc"])


@router.get("/health")
async def api_health_check():
    logger.info("Health check requested")
    return await health_check()


class ContactRequest(BaseModel):
    message: str


@router.post("/contact")
async def api_contact(
    req: ContactRequest,
    current_user: dict = Depends(get_current_user),
):
    """Send contact message to admin email."""
    try:
        if len(req.message) > 5000:
            raise HTTPException(status_code=400, detail="Message too long (max 5000 chars)")

        logger.info("Contact message from %s", current_user["email"])

        # Import email sending function
        from email_summary import send_contact_message

        await send_contact_message(
            sender_email=current_user["email"],
            sender_name=current_user.get("first_name", ""),
            message=req.message,
        )

        return {"message": "Contact message sent successfully"}
    except Exception as e:
        logger.error(f"Error sending contact message: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send contact message")


@router.get("/insights")
async def get_insights(
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get insights and analytics for user's todos."""
    try:
        from insights_utils import generate_insights

        # Get todos for the specified space or all spaces
        if space_id:
            # Check if user has access to this space
            if not await user_in_space(current_user["user_id"], space_id):
                raise HTTPException(status_code=403, detail="Access denied to this space")
            todos = await get_todos(current_user["user_id"], space_id)
        else:
            # Get todos from all accessible spaces
            spaces = await get_spaces_for_user(current_user["user_id"])
            all_todos = []
            for space in spaces:
                space_todos = await get_todos(current_user["user_id"], space.id)
                all_todos.extend(space_todos)
            todos = all_todos

        # Convert todos to dictionaries if they aren't already
        todo_dicts = []
        for todo in todos:
            if hasattr(todo, "dict"):
                todo_dicts.append(todo.dict(by_alias=True))
            elif hasattr(todo, "__dict__"):
                todo_dicts.append(todo.__dict__)
            else:
                todo_dicts.append(dict(todo))

        # Use shared insights computation logic
        insights = generate_insights(todo_dicts)
        return insights

    except Exception as e:
        logger.error(f"Error getting insights: {e}")
        raise HTTPException(status_code=500, detail="Failed to get insights")


@router.get("/activity-feed")
async def api_get_activity_feed(
    space_id: Optional[str] = None,
    limit: int = 50,
    before: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get a chronological activity feed of all events (tasks, messages, journals)."""
    try:
        events = await get_activity_feed(
            user_id=current_user["user_id"],
            space_id=space_id,
            limit=min(limit, 100),
            before=before,
        )
        return events
    except Exception as e:
        logger.error(f"Error getting activity feed: {e}")
        raise HTTPException(status_code=500, detail="Failed to get activity feed")


@router.get("/export")
async def export_data(
    data: str,
    space_id: str,
    format: str = "csv",
    current_user: dict = Depends(get_current_user),
):
    """Export user's todos or journal entries in JSON or CSV format."""
    valid_types = {"todos": todos_collection, "journals": journals_collection}
    if data not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid data type")

    if not await user_in_space(current_user["user_id"], space_id):
        raise HTTPException(status_code=403, detail="Not a member of the specified space")

    collection = valid_types[data]
    query = {"user_id": current_user["user_id"], "space_id": space_id}
    cursor = collection.find(query)
    items = await cursor.to_list(length=None)
    for item in items:
        item.pop("_id", None)
        item.pop("user_id", None)
        item.pop("space_id", None)
        item.pop("created_offline", None)
        item["first_name"] = current_user.get("first_name", "")

    if format == "json":
        content = json.dumps(items, indent=2)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={data}.json"},
        )

    if format == "csv":
        if data == "todos":
            fields = [
                "text",
                "category",
                "priority",
                "dateAdded",
                "dueDate",
                "completed",
                "notes",
                "first_name",
            ]
        else:
            fields = ["date", "text", "first_name"]

        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for item in items:
            writer.writerow({field: item.get(field, "") for field in fields})

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={data}.csv"},
        )

    raise HTTPException(status_code=400, detail="Invalid format")


# ── Agent Memory Endpoints (disabled for initial release) ─────────────

_MEMORY_DISABLED_MSG = "Memory feature is disabled"


@router.get("/memories")
async def api_list_memories(
    space_id: Optional[str] = None,
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List all agent memory facts — disabled for initial release."""
    return []


@router.put("/memories")
async def api_save_memory(
    request: Request,
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Save or update a memory fact — disabled for initial release."""
    raise HTTPException(status_code=404, detail=_MEMORY_DISABLED_MSG)


@router.delete("/memories/{memory_id}")
async def api_delete_memory(
    memory_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a specific memory fact — disabled for initial release."""
    raise HTTPException(status_code=404, detail=_MEMORY_DISABLED_MSG)


@router.delete("/memories")
async def api_delete_all_memories(
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Delete all memory facts — disabled for initial release."""
    return {"deleted_count": 0}


@router.get("/memory-logs")
async def api_get_memory_logs(
    space_id: Optional[str] = None,
    limit: int = 14,
    current_user: dict = Depends(get_current_user),
):
    """Return recent daily memory logs — disabled for initial release."""
    return []
