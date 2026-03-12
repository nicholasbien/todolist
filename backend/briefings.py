"""Proactive Agent Briefings — morning summaries and stale task nudges.

This module provides two proactive agent behaviours:

1. **Morning briefing** — Reviews open tasks, recent journal entries, and
   completion patterns, then posts a prioritised summary to a new session.
2. **Stale task nudges** — Identifies tasks that have been open for N days
   with no activity and posts a gentle check-in to the task's session.

Both features are triggered by the APScheduler jobs wired up in
``scheduler.py`` and configured via per-user preferences stored on the
user document.
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import openai
from bson import ObjectId

from db import db

logger = logging.getLogger(__name__)

# Collections
users_collection = db.users
todos_collection = db.todos
journals_collection = db.journals

# OpenAI config
openai.api_key = os.getenv("OPENAI_API_KEY")

BRIEFING_AGENT_ID = "briefing-agent"


# ---------------------------------------------------------------------------
# User preference helpers
# ---------------------------------------------------------------------------


async def get_briefing_preferences(user_id: str) -> Dict[str, Any]:
    """Return briefing preferences for a user, with defaults."""
    try:
        user = await users_collection.find_one({"_id": ObjectId(user_id)})
    except Exception:
        user = None
    if not user:
        return {
            "briefing_enabled": False,
            "briefing_hour": 8,
            "briefing_minute": 0,
            "stale_task_days": 3,
            "timezone": "America/New_York",
        }
    return {
        "briefing_enabled": user.get("briefing_enabled", False),
        "briefing_hour": user.get("briefing_hour", 8),
        "briefing_minute": user.get("briefing_minute", 0),
        "stale_task_days": user.get("stale_task_days", 3),
        "timezone": user.get("timezone", "America/New_York"),
    }


async def update_briefing_preferences(
    user_id: str,
    *,
    briefing_enabled: Optional[bool] = None,
    briefing_hour: Optional[int] = None,
    briefing_minute: Optional[int] = None,
    stale_task_days: Optional[int] = None,
    timezone: Optional[str] = None,
) -> Dict[str, Any]:
    """Update briefing preferences on the user document.

    Only provided (non-None) fields are written.
    Returns the full updated preference dict.
    """
    update_fields: Dict[str, Any] = {}
    if briefing_enabled is not None:
        update_fields["briefing_enabled"] = briefing_enabled
    if briefing_hour is not None:
        update_fields["briefing_hour"] = briefing_hour
    if briefing_minute is not None:
        update_fields["briefing_minute"] = briefing_minute
    if stale_task_days is not None:
        update_fields["stale_task_days"] = stale_task_days
    if timezone is not None:
        update_fields["timezone"] = timezone

    if update_fields:
        result = await users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_fields},
        )
        if result.matched_count == 0:
            raise ValueError(f"User {user_id} not found")

    return await get_briefing_preferences(user_id)


# ---------------------------------------------------------------------------
# Data gathering helpers
# ---------------------------------------------------------------------------


async def _get_open_tasks(user_id: str, space_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch open (incomplete) tasks for a user."""
    query: Dict[str, Any] = {"user_id": user_id, "completed": False}
    if space_id:
        query["space_id"] = space_id
    cursor = todos_collection.find(query).sort("dateAdded", -1).limit(100)
    tasks = await cursor.to_list(length=100)
    for t in tasks:
        t["_id"] = str(t["_id"])
    return tasks


async def _get_recent_completions(user_id: str, days: int = 7, space_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch tasks completed in the last N days."""
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    query: Dict[str, Any] = {
        "user_id": user_id,
        "completed": True,
        "dateCompleted": {"$gte": cutoff},
    }
    if space_id:
        query["space_id"] = space_id
    cursor = todos_collection.find(query).sort("dateCompleted", -1).limit(50)
    tasks = await cursor.to_list(length=50)
    for t in tasks:
        t["_id"] = str(t["_id"])
    return tasks


async def _get_recent_journals(user_id: str, days: int = 7, space_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch journal entries from the last N days."""
    cutoff_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    query: Dict[str, Any] = {
        "user_id": user_id,
        "date": {"$gte": cutoff_date},
    }
    if space_id:
        query["space_id"] = space_id
    cursor = journals_collection.find(query).sort("date", -1).limit(14)
    entries = await cursor.to_list(length=14)
    for e in entries:
        e["_id"] = str(e["_id"])
    return entries


async def _get_stale_tasks(user_id: str, stale_days: int = 3, space_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Find tasks open for at least ``stale_days`` with no recent activity.

    A task is considered stale if:
    - It is not completed
    - It is not a subtask (no parent_id)
    - It was created more than stale_days ago
    - Its linked session (if any) has not been updated recently
    """
    cutoff = (datetime.utcnow() - timedelta(days=stale_days)).isoformat()
    query: Dict[str, Any] = {
        "user_id": user_id,
        "completed": False,
        "dateAdded": {"$lte": cutoff},
        # Exclude subtasks — only nudge top-level tasks
        "$or": [
            {"parent_id": {"$exists": False}},
            {"parent_id": None},
        ],
    }
    if space_id:
        query["space_id"] = space_id
    cursor = todos_collection.find(query).sort("dateAdded", 1).limit(20)
    tasks = await cursor.to_list(length=20)

    # Filter out tasks whose linked session was recently active
    sessions_collection = db.chat_sessions
    stale: List[Dict[str, Any]] = []
    for t in tasks:
        t["_id"] = str(t["_id"])
        session = await sessions_collection.find_one({"user_id": user_id, "todo_id": t["_id"]})
        if session:
            last_update = session.get("updated_at", datetime.min)
            if isinstance(last_update, datetime) and last_update > datetime.utcnow() - timedelta(days=stale_days):
                continue  # Session was recently active — skip
        stale.append(t)

    return stale


# ---------------------------------------------------------------------------
# Briefing generation
# ---------------------------------------------------------------------------


def _build_briefing_prompt(
    open_tasks: List[Dict[str, Any]],
    recent_completions: List[Dict[str, Any]],
    recent_journals: List[Dict[str, Any]],
    user_name: str = "",
) -> str:
    """Build the system + user prompt for the morning briefing."""
    today = datetime.utcnow().strftime("%A, %B %d, %Y")

    # Format tasks
    task_lines = []
    for t in open_tasks[:30]:  # Cap to avoid huge prompts
        line = f"- {t['text']}"
        if t.get("priority"):
            line += f" (priority: {t['priority']})"
        if t.get("category"):
            line += f" [category: {t['category']}]"
        if t.get("dueDate"):
            line += f" — due: {t['dueDate']}"
        days_old = 0
        try:
            added = datetime.fromisoformat(t["dateAdded"].replace("Z", "+00:00"))
            days_old = (datetime.now(added.tzinfo) - added).days
        except Exception:
            pass
        if days_old > 0:
            line += f" ({days_old}d old)"
        task_lines.append(line)

    completion_lines = []
    for t in recent_completions[:15]:
        completion_lines.append(f"- {t['text']} (completed: {t.get('dateCompleted', 'unknown')})")

    journal_lines = []
    for j in recent_journals[:7]:
        text = j.get("text", "")
        if len(text) > 200:
            text = text[:200] + "..."
        journal_lines.append(f"[{j.get('date', '')}] {text}")

    greeting = f"Good morning{', ' + user_name if user_name else ''}!"

    prompt = f"""You are a proactive task assistant. Today is {today}.

The user has asked for a morning briefing. Based on their open tasks, recent completions, \
and journal entries, produce a concise daily briefing.

Guidelines:
- Start with a brief, friendly greeting
- Highlight the top 3-5 priorities for today (considering due dates, priority, and age)
- Note any patterns (overdue tasks, categories piling up, good streaks of completion)
- If there are journal entries, reference any relevant context
- Keep it concise — aim for 150-250 words
- Use markdown formatting (bold for task names, bullet lists)
- End with an encouraging note

{greeting}

## Open Tasks ({len(open_tasks)} total)
{chr(10).join(task_lines) if task_lines else "No open tasks!"}

## Recently Completed ({len(recent_completions)} in last 7 days)
{chr(10).join(completion_lines) if completion_lines else "None recently"}

## Recent Journal Entries
{chr(10).join(journal_lines) if journal_lines else "No recent journal entries"}
"""
    return prompt


async def generate_morning_briefing(
    user_id: str,
    space_id: Optional[str] = None,
    user_name: str = "",
) -> str:
    """Generate a morning briefing summary using OpenAI.

    Returns the briefing text. The caller is responsible for posting it
    to a session.
    """
    open_tasks = await _get_open_tasks(user_id, space_id)
    recent_completions = await _get_recent_completions(user_id, 7, space_id)
    recent_journals = await _get_recent_journals(user_id, 7, space_id)

    prompt = _build_briefing_prompt(open_tasks, recent_completions, recent_journals, user_name)

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("No OpenAI API key — returning template briefing")
        return _fallback_briefing(open_tasks, recent_completions, user_name)

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a concise, helpful task prioritisation assistant.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=600,
            temperature=0.7,
        )
        return response.choices[0].message.content or _fallback_briefing(open_tasks, recent_completions, user_name)
    except Exception as e:
        logger.error("OpenAI briefing generation failed: %s", e)
        return _fallback_briefing(open_tasks, recent_completions, user_name)


def _fallback_briefing(
    open_tasks: List[Dict[str, Any]],
    recent_completions: List[Dict[str, Any]],
    user_name: str = "",
) -> str:
    """Plain-text fallback when OpenAI is unavailable."""
    today = datetime.utcnow().strftime("%A, %B %d, %Y")
    greeting = f"Good morning{', ' + user_name if user_name else ''}!"
    lines = [
        f"**{greeting}** Here's your briefing for {today}.",
        "",
        f"You have **{len(open_tasks)}** open tasks.",
    ]

    # Show high-priority or overdue tasks
    high_priority = [t for t in open_tasks if t.get("priority") == "High"]
    if high_priority:
        lines.append("")
        lines.append("**High priority:**")
        for t in high_priority[:5]:
            lines.append(f"- {t['text']}")

    overdue = []
    now_str = datetime.utcnow().strftime("%Y-%m-%d")
    for t in open_tasks:
        if t.get("dueDate") and t["dueDate"] < now_str:
            overdue.append(t)
    if overdue:
        lines.append("")
        lines.append("**Overdue:**")
        for t in overdue[:5]:
            lines.append(f"- {t['text']} (due: {t['dueDate']})")

    lines.append("")
    lines.append(f"You completed **{len(recent_completions)}** tasks in the last week. " "Keep up the momentum!")
    return "\n".join(lines)


def generate_stale_task_nudge(task: Dict[str, Any]) -> str:
    """Generate a nudge message for a stale task.

    This is a simple template — no LLM call needed for nudges.
    """
    text = task.get("text", "Untitled task")
    days_old = 0
    try:
        added = datetime.fromisoformat(task["dateAdded"].replace("Z", "+00:00"))
        days_old = (datetime.now(added.tzinfo) - added).days
    except Exception:
        pass

    nudge = f"Hey! Just checking in on **{text}**. " f"This task has been open for {days_old} days. "

    if task.get("dueDate"):
        due = task["dueDate"]
        now_str = datetime.utcnow().strftime("%Y-%m-%d")
        if due < now_str:
            nudge += f"It was due on {due} and is now overdue. "
        else:
            nudge += f"It's due on {due}. "

    nudge += (
        "Would you like to:\n"
        "- Break it into smaller sub-tasks?\n"
        "- Update the due date?\n"
        "- Mark it as complete?\n"
        "- Remove it if it's no longer relevant?\n\n"
        "Just reply and I can help!"
    )
    return nudge


# ---------------------------------------------------------------------------
# Orchestration: post briefings & nudges to sessions
# ---------------------------------------------------------------------------


async def post_morning_briefing(user_id: str, space_id: Optional[str] = None) -> Optional[str]:
    """Generate and post a morning briefing to a new session.

    Returns the session_id or None on failure.
    """
    from chat_sessions import append_message, create_session

    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    user_name = user.get("first_name", "") if user else ""

    briefing_text = await generate_morning_briefing(user_id, space_id, user_name)

    today = datetime.utcnow().strftime("%B %d, %Y")
    title = f"Morning Briefing — {today}"

    session_id = await create_session(
        user_id=user_id,
        space_id=space_id,
        title=title,
        agent_id=BRIEFING_AGENT_ID,
    )

    await append_message(
        session_id=session_id,
        user_id=user_id,
        role="assistant",
        content=briefing_text,
        agent_id=BRIEFING_AGENT_ID,
    )

    logger.info("Posted morning briefing for user %s (session %s)", user_id, session_id)
    return session_id


async def post_stale_task_nudges(
    user_id: str,
    stale_days: int = 3,
    space_id: Optional[str] = None,
) -> List[str]:
    """Find stale tasks and post nudges to their sessions.

    Returns a list of session_ids that received nudges.
    """
    from chat_sessions import append_message, create_session, find_session_by_todo

    stale_tasks = await _get_stale_tasks(user_id, stale_days, space_id)
    nudged_sessions: List[str] = []

    for task in stale_tasks:
        task_id = task["_id"]
        nudge_text = generate_stale_task_nudge(task)

        # Find or create a session for this task
        session = await find_session_by_todo(user_id, task_id)
        if session:
            session_id = session["_id"]
        else:
            session_id = await create_session(
                user_id=user_id,
                space_id=task.get("space_id"),
                title=task.get("text", "Task")[:120],
                todo_id=task_id,
                agent_id=BRIEFING_AGENT_ID,
            )

        await append_message(
            session_id=session_id,
            user_id=user_id,
            role="assistant",
            content=nudge_text,
            agent_id=BRIEFING_AGENT_ID,
        )

        nudged_sessions.append(session_id)
        logger.info("Posted stale nudge for task %s (session %s)", task_id, session_id)

    return nudged_sessions
