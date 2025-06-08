#!/usr/bin/env python3
"""
Daily email scheduler for todo summaries
"""
import logging
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# Global scheduler instance and default time
scheduler = None
scheduled_hour = 9
scheduled_minute = 0


async def daily_summary_job():
    """Job function that runs daily to send summary to admin only."""
    try:
        from auth import users_collection

        logger.info("Starting daily summary job...")

        admin_email = os.getenv("ADMIN_EMAIL")
        if not admin_email:
            logger.warning("No ADMIN_EMAIL configured, skipping daily summary")
            return

        # Find admin user
        admin_user = await users_collection.find_one({"email": admin_email, "is_verified": True})
        if not admin_user:
            logger.warning(f"Admin user {admin_email} not found or not verified")
            return

        # Send summary to admin only
        from email_summary import send_daily_summary

        success = await send_daily_summary(str(admin_user["_id"]), admin_user["email"], admin_user.get("first_name"))

        result = {"sent": 1 if success else 0, "failed": 0 if success else 1}
        logger.info(f"Daily summary job completed: {result}")

    except Exception as e:
        logger.error(f"Error in daily summary job: {e}")


def start_scheduler():
    """Start the daily email scheduler."""
    global scheduler

    if scheduler is not None:
        logger.warning("Scheduler already running")
        return

    try:
        scheduler = AsyncIOScheduler()

        # Schedule daily using configured time
        scheduler.add_job(
            daily_summary_job,
            CronTrigger(
                hour=scheduled_hour,
                minute=scheduled_minute,
                timezone="America/New_York",
            ),
            id="daily_summary",
            max_instances=1,
            replace_existing=True,
        )

        scheduler.start()
        logger.info(
            "Daily summary scheduler started (%02d:%02d Eastern)",
            scheduled_hour,
            scheduled_minute,
        )

    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")


def stop_scheduler():
    """Stop the scheduler."""
    global scheduler

    if scheduler is not None:
        scheduler.shutdown()
        scheduler = None
        logger.info("Scheduler stopped")


def update_schedule_time(hour: int, minute: int):
    """Update the daily summary schedule time."""
    global scheduled_hour, scheduled_minute, scheduler

    scheduled_hour = hour
    scheduled_minute = minute

    if scheduler is None:
        start_scheduler()
        return

    try:
        scheduler.reschedule_job(
            "daily_summary",
            trigger=CronTrigger(
                hour=scheduled_hour,
                minute=scheduled_minute,
                timezone="America/New_York",
            ),
        )
        logger.info(
            "Rescheduled daily summary to %02d:%02d Eastern",
            scheduled_hour,
            scheduled_minute,
        )
    except Exception as e:
        logger.error(f"Failed to reschedule daily summary: {e}")


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
