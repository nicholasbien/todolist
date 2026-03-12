"""Email summary and scheduling routes."""

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
from scheduler import get_scheduler_status, update_schedule_time

from .dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])


class UpdateScheduleRequest(BaseModel):
    hour: int
    minute: int
    timezone: str = "America/New_York"
    email_enabled: bool = False


class UpdateInstructionsRequest(BaseModel):
    instructions: str


class UpdateEmailSpacesRequest(BaseModel):
    space_ids: List[str]


@router.post("/send-summary")
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


@router.get("/scheduler-status")
async def api_scheduler_status():
    """Get scheduler status."""
    return get_scheduler_status()


@router.post("/update-schedule")
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
    await update_user_summary_time(current_user["user_id"], req.email_enabled, req.hour, req.minute, req.timezone)

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
        # Remove the scheduled job if email is disabled
        from scheduler import remove_user_schedule

        remove_user_schedule(current_user["user_id"])
    return {"message": "Schedule updated"}


@router.post("/update-instructions")
async def api_update_instructions(
    req: UpdateInstructionsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update custom summary instructions for the current user."""
    logger.info("Instructions update requested by %s", current_user["email"])
    return await update_user_email_instructions(current_user["user_id"], req.instructions)


@router.post("/update-spaces")
async def api_update_email_spaces(
    req: UpdateEmailSpacesRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update which spaces are included in the user's daily summary emails."""
    logger.info("Email spaces update requested by %s", current_user["email"])
    return await update_user_email_spaces(current_user["user_id"], req.space_ids)
