"""Agent memory route handlers."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from agent_memory import get_recent_memory_logs
from routers.deps import get_current_user

router = APIRouter(tags=["memories"])


@router.get("/memories")
async def api_list_memories(
    space_id: Optional[str] = None,
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List all agent memory facts for the current user/space."""
    from agent_memory import list_memories

    facts = await list_memories(current_user["user_id"], space_id, category)
    return [
        {
            "_id": f.id,
            "key": f.key,
            "value": f.value,
            "category": f.category,
            "agent_id": f.agent_id,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "updated_at": f.updated_at.isoformat() if f.updated_at else None,
        }
        for f in facts
    ]


@router.put("/memories")
async def api_save_memory(
    request: Request,
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Save or update a memory fact."""
    from agent_memory import save_memory

    body = await request.json()
    key = body.get("key", "").strip()
    value = body.get("value", "").strip()
    category = body.get("category")

    if not key or not value:
        raise HTTPException(status_code=400, detail="key and value are required")

    fact = await save_memory(current_user["user_id"], key, value, space_id, category)
    return {"key": fact.key, "value": fact.value, "category": fact.category}


@router.delete("/memories/{memory_id}")
async def api_delete_memory(
    memory_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a specific memory fact by its _id."""
    from agent_memory import delete_memory, delete_memory_by_key

    # Try deleting by ObjectId first, then fall back to key-based delete
    deleted = await delete_memory(memory_id, current_user["user_id"])
    if not deleted:
        deleted = await delete_memory_by_key(current_user["user_id"], memory_id)
    if deleted:
        return {"ok": True}
    raise HTTPException(status_code=404, detail="Memory not found")


@router.delete("/memories")
async def api_delete_all_memories(
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Delete all memory facts for the current user/space."""
    from agent_memory import delete_all_memories

    count = await delete_all_memories(current_user["user_id"], space_id)
    return {"deleted_count": count}


@router.get("/memory-logs")
async def api_get_memory_logs(
    space_id: Optional[str] = None,
    limit: int = 14,
    current_user: dict = Depends(get_current_user),
):
    """Return recent daily memory logs for the current user."""
    sid = space_id or current_user.get("active_space_id", "")
    logs = await get_recent_memory_logs(
        current_user["user_id"], sid, limit=min(limit, 30)
    )
    result = []
    for log in logs:
        result.append(
            {
                "_id": log.id,
                "date": log.date,
                "entries": log.entries,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "updated_at": log.updated_at.isoformat() if log.updated_at else None,
            }
        )
    return result
