"""Proactive agent briefing routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/briefings", tags=["briefings"])


class UpdateBriefingRequest(BaseModel):
    briefing_enabled: bool = False
    briefing_hour: int = 8
    briefing_minute: int = 0
    stale_task_days: int = 3
    timezone: str = "America/New_York"


@router.get("/preferences")
async def api_get_briefing_preferences(
    current_user: dict = Depends(get_current_user),
):
    """Get the current user's briefing preferences."""
    from briefings import get_briefing_preferences

    return await get_briefing_preferences(current_user["user_id"])


@router.post("/preferences")
async def api_update_briefing_preferences(
    req: UpdateBriefingRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update the current user's briefing preferences and reschedule jobs."""
    from briefings import update_briefing_preferences
    from scheduler import remove_briefing_schedule, update_briefing_schedule

    logger.info(
        "Briefing update requested by %s: enabled=%s hour=%02d:%02d stale_days=%d",
        current_user["email"],
        req.briefing_enabled,
        req.briefing_hour,
        req.briefing_minute,
        req.stale_task_days,
    )

    prefs = await update_briefing_preferences(
        current_user["user_id"],
        briefing_enabled=req.briefing_enabled,
        briefing_hour=req.briefing_hour,
        briefing_minute=req.briefing_minute,
        stale_task_days=req.stale_task_days,
        timezone=req.timezone,
    )

    if req.briefing_enabled:
        update_briefing_schedule(
            current_user["user_id"],
            req.briefing_hour,
            req.briefing_minute,
            req.timezone,
        )
    else:
        remove_briefing_schedule(current_user["user_id"])

    return {"message": "Briefing preferences updated", "preferences": prefs}


@router.post("/trigger")
async def api_trigger_briefing(
    current_user: dict = Depends(get_current_user),
):
    """Manually trigger a morning briefing for the current user (for testing)."""
    from briefings import post_morning_briefing

    session_id = await post_morning_briefing(current_user["user_id"])
    if session_id:
        return {"ok": True, "session_id": session_id}
    raise HTTPException(status_code=500, detail="Failed to generate briefing")


@router.post("/trigger-nudges")
async def api_trigger_nudges(
    current_user: dict = Depends(get_current_user),
):
    """Manually trigger stale task nudges for the current user (for testing)."""
    from briefings import get_briefing_preferences, post_stale_task_nudges

    prefs = await get_briefing_preferences(current_user["user_id"])
    stale_days = prefs.get("stale_task_days", 3)
    nudged = await post_stale_task_nudges(
        current_user["user_id"], stale_days=stale_days
    )
    return {"ok": True, "nudged_sessions": nudged, "count": len(nudged)}
