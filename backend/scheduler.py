#!/usr/bin/env python3
"""
Daily email scheduler for todo summaries
"""
import logging
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = None


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

        # Schedule daily at 9:00 AM Eastern Time
        scheduler.add_job(
            daily_summary_job,
            CronTrigger(hour=9, minute=0, timezone="America/New_York"),  # 9:00 AM Eastern
            id="daily_summary",
            max_instances=1,
            replace_existing=True,
        )

        scheduler.start()
        logger.info("Daily summary scheduler started (9:00 AM daily)")

    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")


def stop_scheduler():
    """Stop the scheduler."""
    global scheduler

    if scheduler is not None:
        scheduler.shutdown()
        scheduler = None
        logger.info("Scheduler stopped")


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
