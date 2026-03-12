"""Email summary and briefing route handlers."""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import (
    update_user_email_instructions,
    update_user_email_spaces,
    update_user_summary_time,
)
from email_summary import send_daily_summary
from routers.deps import get_current_user
from scheduler import get_scheduler_status, update_schedule_time

logger = logging.getLogger(__name__)

router = APIRouter(tags=["email"])


class UpdateScheduleRequest(BaseModel):
    hour: int
    minute: int
    timezone: str = "America/New_York"
    email_enabled: bool = False


class UpdateInstructionsRequest(BaseModel):
    instructions: str


class UpdateEmailSpacesRequest(BaseModel):
    space_ids: List[str]


class UpdateBriefingRequest(BaseModel):
    briefing_enabled: bool = False
    briefing_hour: int = 8
    briefing_minute: int = 0
    stale_task_days: int = 3
    timezone: str = "America/New_York"


class ContactRequest(BaseModel):
    message: str


@router.post("/email/send-summary")
async def api_send_summary(current_user: dict = Depends(get_current_user)):
    """Send daily summary email to current user."""
    logger.info(f"Manual summary request for user: {current_user['email']}")
    success = await send_daily_summary(
        current_user["user_id"],
        current_user["email"],
        current_user.get("first_name") or "",
        current_user.get("email_instructions", ""),
    )

    if success:
        return {"message": "Summary email sent successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send summary email")


@router.get("/email/scheduler-status")
async def api_scheduler_status():
    """Get scheduler status."""
    return get_scheduler_status()


@router.post("/email/update-schedule")
async def api_update_schedule(
    req: UpdateScheduleRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update daily summary schedule time, timezone, and enabled status."""
    logger.info(
        "Schedule update requested by %s to %02d:%02d %s (enabled: %s)",
        current_user["email"],
        req.hour,
        req.minute,
        req.timezone,
        req.email_enabled,
    )
    await update_user_summary_time(
        current_user["user_id"], req.email_enabled, req.hour, req.minute, req.timezone
    )

    if req.email_enabled:
        update_schedule_time(
            current_user["user_id"],
            current_user["email"],
            current_user.get("first_name", ""),
            req.hour,
            req.minute,
            req.timezone,
        )
    else:
        from scheduler import remove_user_schedule

        remove_user_schedule(current_user["user_id"])
    return {"message": "Schedule updated"}


@router.post("/email/update-instructions")
async def api_update_instructions(
    req: UpdateInstructionsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update custom summary instructions for the current user."""
    logger.info("Instructions update requested by %s", current_user["email"])
    return await update_user_email_instructions(
        current_user["user_id"], req.instructions
    )


@router.post("/email/update-spaces")
async def api_update_email_spaces(
    req: UpdateEmailSpacesRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update which spaces are included in the user's daily summary emails."""
    logger.info("Email spaces update requested by %s", current_user["email"])
    return await update_user_email_spaces(current_user["user_id"], req.space_ids)


# ---------------------------------------------------------------------------
# Proactive Agent Briefings
# ---------------------------------------------------------------------------


@router.get("/briefings/preferences")
async def api_get_briefing_preferences(
    current_user: dict = Depends(get_current_user),
):
    """Get the current user's briefing preferences."""
    from briefings import get_briefing_preferences

    return await get_briefing_preferences(current_user["user_id"])


@router.post("/briefings/preferences")
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


@router.post("/briefings/trigger")
async def api_trigger_briefing(
    current_user: dict = Depends(get_current_user),
):
    """Manually trigger a morning briefing for the current user (for testing)."""
    from briefings import post_morning_briefing

    session_id = await post_morning_briefing(current_user["user_id"])
    if session_id:
        return {"ok": True, "session_id": session_id}
    raise HTTPException(status_code=500, detail="Failed to generate briefing")


@router.post("/briefings/trigger-nudges")
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


@router.post("/contact")
async def api_contact(
    req: ContactRequest,
    current_user: dict = Depends(get_current_user),
):
    """Send contact message to admin email."""
    try:
        if len(req.message) > 5000:
            raise HTTPException(
                status_code=400, detail="Message too long (max 5000 chars)"
            )

        logger.info("Contact message from %s", current_user["email"])

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
