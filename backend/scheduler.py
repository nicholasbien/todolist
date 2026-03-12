#!/usr/bin/env python3
"""
Daily email scheduler for todo summaries and proactive agent briefings.
"""

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = None


async def daily_summary_job(user_id: str, email: str, first_name: str = ""):
    """Send daily summary for a specific user."""
    try:
        from email_summary import send_daily_summary

        success = await send_daily_summary(user_id, email, first_name)
        result = {"sent": 1 if success else 0, "failed": 0 if success else 1}
        logger.info("Daily summary job completed for %s: %s", email, result)
    except Exception as e:
        logger.error("Error in daily summary job for %s: %s", email, e)


async def briefing_job(user_id: str):
    """Run morning briefing + stale task nudges for a user."""
    try:
        from briefings import (
            get_briefing_preferences,
            post_morning_briefing,
            post_stale_task_nudges,
        )

        prefs = await get_briefing_preferences(user_id)

        # Post morning briefing
        session_id = await post_morning_briefing(user_id)
        logger.info("Morning briefing posted for user %s: session %s", user_id, session_id)

        # Post stale task nudges
        stale_days = prefs.get("stale_task_days", 3)
        nudged = await post_stale_task_nudges(user_id, stale_days=stale_days)
        logger.info("Stale task nudges posted for user %s: %d tasks", user_id, len(nudged))

    except Exception as e:
        logger.error("Error in briefing job for user %s: %s", user_id, e)


def schedule_user_job(
    user_id: str,
    email: str,
    first_name: str,
    hour: int,
    minute: int,
    timezone: str = "America/New_York",
) -> None:
    """Schedule or reschedule a summary job for a user."""
    global scheduler
    if scheduler is None:
        scheduler = AsyncIOScheduler()
        scheduler.start()

    trigger = CronTrigger(hour=hour, minute=minute, timezone=timezone)
    job_id = f"daily_summary_{user_id}"

    try:
        if scheduler.get_job(job_id):
            scheduler.reschedule_job(job_id, trigger=trigger)
        else:
            scheduler.add_job(
                daily_summary_job,
                trigger,
                id=job_id,
                args=[user_id, email, first_name],
                replace_existing=True,
                max_instances=1,
            )
        logger.info(
            "Scheduled daily summary for %s at %02d:%02d %s",
            email,
            hour,
            minute,
            timezone,
        )
    except Exception as e:
        logger.error("Failed to schedule job for %s: %s", email, e)


def schedule_briefing_job(user_id: str, hour: int, minute: int, timezone: str = "America/New_York") -> None:
    """Schedule or reschedule a briefing job for a user."""
    global scheduler
    if scheduler is None:
        scheduler = AsyncIOScheduler()
        scheduler.start()

    trigger = CronTrigger(hour=hour, minute=minute, timezone=timezone)
    job_id = f"briefing_{user_id}"

    try:
        if scheduler.get_job(job_id):
            scheduler.reschedule_job(job_id, trigger=trigger)
        else:
            scheduler.add_job(
                briefing_job,
                trigger,
                id=job_id,
                args=[user_id],
                replace_existing=True,
                max_instances=1,
            )
        logger.info(
            "Scheduled briefing for user %s at %02d:%02d %s",
            user_id,
            hour,
            minute,
            timezone,
        )
    except Exception as e:
        logger.error("Failed to schedule briefing for %s: %s", user_id, e)


def remove_briefing_schedule(user_id: str) -> None:
    """Remove a user's briefing job."""
    if scheduler is None:
        return

    job_id = f"briefing_{user_id}"
    try:
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
            logger.info("Removed briefing job for user %s", user_id)
    except Exception as e:
        logger.error("Failed to remove briefing job for user %s: %s", user_id, e)


async def _load_jobs():
    from auth import users_collection

    # Load email summary jobs
    cursor = users_collection.find({"is_verified": True, "email_enabled": True})
    async for user in cursor:
        hour = user.get("summary_hour")
        minute = user.get("summary_minute")
        if hour is None or minute is None:
            continue
        schedule_user_job(
            str(user["_id"]),
            user["email"],
            user.get("first_name", ""),
            hour,
            minute,
            user.get("timezone", "America/New_York"),
        )

    # Load briefing jobs
    cursor = users_collection.find({"is_verified": True, "briefing_enabled": True})
    async for user in cursor:
        hour = user.get("briefing_hour", 8)
        minute = user.get("briefing_minute", 0)
        schedule_briefing_job(
            str(user["_id"]),
            hour,
            minute,
            user.get("timezone", "America/New_York"),
        )


def start_scheduler():
    """Start the daily email scheduler."""
    global scheduler

    if scheduler is not None:
        logger.warning("Scheduler already running")
        return

    scheduler = AsyncIOScheduler()
    scheduler.start()
    asyncio.create_task(_load_jobs())
    logger.info("Daily summary scheduler started")


def stop_scheduler():
    """Stop the scheduler."""
    global scheduler

    if scheduler is not None:
        scheduler.shutdown()
        scheduler = None
        logger.info("Scheduler stopped")


def update_schedule_time(
    user_id: str,
    email: str,
    first_name: str,
    hour: int,
    minute: int,
    timezone: str = "America/New_York",
) -> None:
    """Update a user's summary schedule."""
    schedule_user_job(user_id, email, first_name, hour, minute, timezone)


def update_briefing_schedule(user_id: str, hour: int, minute: int, timezone: str = "America/New_York") -> None:
    """Update a user's briefing schedule."""
    schedule_briefing_job(user_id, hour, minute, timezone)


def remove_user_schedule(user_id: str) -> None:
    """Remove a user's scheduled email job."""
    if scheduler is None:
        return

    job_id = f"daily_summary_{user_id}"
    try:
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
            logger.info("Removed scheduled job for user %s", user_id)
    except Exception as e:
        logger.error("Failed to remove job for user %s: %s", user_id, e)


def get_scheduler_status():
    """Get current scheduler status."""

    if scheduler is None:
        return {"status": "stopped", "jobs": []}

    jobs = []
    for job in scheduler.get_jobs():
        jobs.append(
            {
                "id": job.id,
                "next_run": (job.next_run_time.isoformat() if job.next_run_time else None),
                "trigger": str(job.trigger),
            }
        )

    return {"status": "running", "jobs": jobs}
