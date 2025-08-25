#!/usr/bin/env python3
"""
Daily todo summary email functionality
"""
import json
import logging
import os
import random
import smtplib
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, List, Optional

import openai
from bson import ObjectId
from dotenv import load_dotenv
from journals import get_journal_entries
from todos import get_todos

# Load environment variables
load_dotenv()

# SMTP configuration
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
FROM_EMAIL = os.getenv("FROM_EMAIL")

# OpenAI configuration
openai.api_key = os.getenv("OPENAI_API_KEY")

logger = logging.getLogger(__name__)


def format_date_with_relative(date_str: str) -> str:
    """Return absolute date with relative offset like "in 3 days" or "2 weeks ago"."""
    try:
        dt = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
    except Exception:
        return str(date_str)

    now = datetime.now(dt.tzinfo)
    delta_days = (dt.date() - now.date()).days

    def _future(days: int) -> str:
        if days == 1:
            return "in 1 day"
        if days < 7:
            return f"in {days} days"
        if days < 30:
            weeks = days // 7
            return f"in {weeks} week" + ("s" if weeks > 1 else "")
        months = days // 30
        return f"in {months} month" + ("s" if months > 1 else "")

    def _past(days: int) -> str:
        if days == 1:
            return "1 day ago"
        if days < 7:
            return f"{days} days ago"
        if days < 30:
            weeks = days // 7
            return f"{weeks} week" + ("s" if weeks > 1 else "") + " ago"
        months = days // 30
        return f"{months} month" + ("s" if months > 1 else "") + " ago"

    if delta_days > 0:
        rel = _future(delta_days)
    elif delta_days < 0:
        rel = _past(-delta_days)
    else:
        rel = "today"

    absolute = dt.strftime("%b %d, %Y")
    return f"{absolute} ({rel})"


def load_haiku_collection() -> List[str]:
    """Load the haiku collection from JSON file."""
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        # Try large collection first, fall back to small one
        large_haiku_file = os.path.join(current_dir, "haiku_collection_large.json")
        small_haiku_file = os.path.join(current_dir, "haiku_collection.json")

        haiku_file = large_haiku_file if os.path.exists(large_haiku_file) else small_haiku_file

        with open(haiku_file, "r", encoding="utf-8") as f:
            haikus = json.load(f)

        logger.info(f"Loaded {len(haikus)} haikus from {os.path.basename(haiku_file)}")
        return haikus
    except Exception as e:
        logger.error(f"Error loading haiku collection: {e}")
        # Fallback classic haiku if file can't be loaded (from the collection we know works)
        return [
            "An old silent pond...\nA frog jumps into the pond,\nsplash! Silence again.",
            "In the cicada's cry\nNo sign can foretell\nHow soon it must die.",
            "No one travels\nAlong this way but I,\nThis autumn evening.",
            "From time to time\nThe clouds give rest\nTo the moon-beholders.",
            "Autumn moonlight-\na worm digs silently\ninto the chestnut.",
            "Lightning flash-\nwhat I thought were faces\nare plumes of pampas grass.",
            "First winter rain-\neven the monkey\nseems to want a raincoat.",
            "The summer grasses\nAll that remains\nOf brave soldiers dreams",
            "My life, -\nHow much more of it remains?\nThe night is brief.",
            "Consider me\nAs one who loved poetry\nAnd persimmons.",
            "Over the wintry\nforest, winds howl in rage\nwith no leaves to blow.",
            "The lamp once out\nCool stars enter\nThe window frame.",
            "The crow has flown away:\nswaying in the evening sun,\na leafless tree.",
            "O snail\nClimb Mount Fuji,\nBut slowly, slowly!",
            "What a strange thing!\nto be alive\nbeneath cherry blossoms.",
        ]


def get_random_haiku() -> str:
    """Get a random haiku from the collection that doesn't contain 'tasks'."""
    haikus = load_haiku_collection()
    return random.choice(haikus)


def get_default_buddhist_instructions() -> str:
    """Return default Buddhist monk instructions for users who haven't set custom instructions."""
    return """

Write like a Buddhist monk. Include a life lesson and famous Buddhist quote or koan.

At the end, highlight the top 5 items that need my attention as a numbered list. For each item, put
the todo text on the same numbered line and place any details (like priority or due date) on the
line below without bullet points or hyphens. Indent two spaces and begin directly with the detail
label (e.g., "Priority: High"). This avoids Gmail formatting issues.
"""


def create_summary_prompt(
    spaces_json: str,
    user_name: str = "there",
    custom_instructions: str = "",
    user_timezone: str = "America/New_York",
    haiku: str = "",
    journal_entries_json: str = "",
) -> str:
    """Create a prompt for generating a daily todo summary with space context."""
    # Localize date to user's timezone
    import pytz  # type: ignore

    try:
        tz = pytz.timezone(user_timezone)
        current_datetime = datetime.now(tz)
        current_date = current_datetime.strftime("%A, %B %d, %Y")
    except Exception:
        # Fallback to New York timezone if timezone is invalid
        try:
            tz = pytz.timezone("America/New_York")
            current_date = datetime.now(tz).strftime("%A, %B %d, %Y")
        except Exception:
            # Final fallback to UTC
            current_date = datetime.now().strftime("%A, %B %d, %Y")

    return f"""You are a helpful personal assistant creating a daily todo summary email.

Today's date: {current_date}

Given the following JSON data of todos organized by collaboration space,
and recent journal entries, create a warm, encouraging daily summary email.

Todo Data (grouped by space):
{spaces_json}

Recent Journal Entries:
{journal_entries_json}

Instructions:
1. Address the user as "{user_name}" if provided, otherwise use "there"
2. Create a friendly, motivational tone
3. **IMPORTANT**: Focus primarily on tasks completed in the last day (check "dateCompleted" field).
   Ignore tasks completed before yesterday - they're included for context but shouldn't be highlighted.
4. Pay attention to the "dateAdded" field in each todo to understand timing and
   the "dueDate" field for upcoming deadlines:
   - Celebrate recently completed tasks (completed yesterday or today only)
   - Identify pending tasks that are getting old/stale
   - Highlight urgent items or those with approaching due dates
   - When present, use the "dateAddedRelative", "dateCompletedRelative", and "dueDateRelative" fields
     which combine absolute dates with relative phrases like "3 days ago" or "in 1 week"
5. **PRIORITY ATTENTION**: Pay special attention to "High" priority tasks in the pending list.
   Always mention high priority tasks prominently and encourage action on them.
6. Organize todos by:
   - Recently completed tasks from last day (celebrate achievements!)
   - Pending tasks by priority (High, Medium, Low) - emphasize High priority items
   - Group by categories where relevant
7. Provide insights like:
   - Total tasks completed vs pending (focus on recent completions)
   - Number of high priority tasks that need attention
   - Most productive category
   - Tasks that need attention due to age or priority
   - Recent momentum and progress patterns
8. Keep it concise but personal (2-3 paragraphs max)
9. End with a motivational note for the day ahead
10. If referring to tasks in a specific space, only mention todos from that space
11. Close with a brief Buddhist koan to encourage reflection
{custom_instructions}

12. At the very end, add this EXACT haiku from a classical Japanese master.
    CRITICAL: Use ONLY this haiku - do NOT write any other haiku or poetry:

{haiku}

13. After the haiku above, add exactly ONE emoji that best matches the themes, mood, or imagery
    from this list:
   - Nature: 🌸🍃🌺🍂🌱🌼🌻🌷🌹🌿🌳🌲🌴🌾🌵
   - Sky/Weather: 🌙⭐🌅🌊🌄🌈☀️🌤️⛅🌥️❄️💧🌟✨
   - Zen/Spiritual: 🧘🕯️🪷🎍🎐🪶🪨🏔️🎋🍀

Add the chosen emoji on a separate line after the haiku.

Format as plain text email content (no HTML, no subject line).
"""


async def generate_todo_summary(
    spaces_data: list,
    journal_entries_data: Optional[List[dict]] = None,
    user_name: str = "there",
    custom_instructions: str = "",
    user_timezone: str = "America/New_York",
) -> str:
    """Use OpenAI to generate a personalized todo summary."""
    try:
        # Convert spaces and their todos to JSON for the prompt
        spaces_json = json.dumps(spaces_data, indent=2, default=str)

        journal_entries_json = (
            json.dumps(journal_entries_data, indent=2, default=str) if journal_entries_data is not None else "[]"
        )

        # Get a haiku to include in the prompt so AI can choose matching emoji
        haiku = get_random_haiku()
        prompt = create_summary_prompt(
            spaces_json, user_name, custom_instructions, user_timezone, haiku, journal_entries_json
        )

        # Use OpenAI to generate the summary
        client = openai.AsyncOpenAI(api_key=openai.api_key)
        response = await client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a helpful personal assistant creating daily todo summaries. "
                        "Use ONLY the exact haiku provided in the prompt - never create additional poetry or haiku."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=600,  # Increased slightly for haiku + emoji
            temperature=1,
        )

        summary = response.choices[0].message.content.strip()

        return summary

    except Exception as e:
        logger.error(f"Error generating summary with OpenAI: {e}")
        # Fallback to a simple summary
        return create_simple_summary(spaces_data, user_name)


def create_simple_summary(spaces_data: list, user_name: str = "there") -> str:
    """Create a simple fallback summary without AI."""
    # Flatten todos from all spaces
    all_todos = []
    for space in spaces_data:
        all_todos.extend(space.get("todos", []))

    completed = [t for t in all_todos if t.get("completed", False)]
    pending = [t for t in all_todos if not t.get("completed", False)]

    high_priority = [t for t in pending if t.get("priority", "").lower() == "high"]
    due_soon = [
        t
        for t in pending
        if t.get("dueDate") and datetime.fromisoformat(str(t["dueDate"])) <= datetime.now() + timedelta(days=1)
    ]

    summary = f"""Good morning {user_name}!

Here's your daily todo summary:

✅ Completed: {len(completed)} tasks
📋 Pending: {len(pending)} tasks
🔥 High Priority: {len(high_priority)} tasks
⏰ Due Soon: {len(due_soon)} tasks

"""

    if high_priority:
        summary += "High priority tasks for today:\n"
        for todo in high_priority[:3]:  # Show top 3
            summary += f"  • {todo.get('text', 'Unknown task')}\n"
        summary += "\n"

    if due_soon:
        summary += "Tasks due soon:\n"
        for todo in due_soon[:3]:
            due = format_date_with_relative(todo["dueDate"])
            summary += f"  • {todo.get('text', 'Unknown task')} (due {due})\n"
        summary += "\n"

    summary += "Have a productive day ahead! 🚀"

    return summary


async def send_email(to_email: str, subject: str, body: str) -> bool:
    """
    Send an email using SMTP.
    """
    try:
        # Block test emails from being sent
        test_emails = [
            "pytest@example.com",
            "test@example.com",
            "pytest2@example.com",
            "pytest3@example.com",
        ]
        if to_email.lower() in [email.lower() for email in test_emails]:
            logger.info(f"Blocked email send to test address: {to_email}")
            return True  # Return True to avoid breaking tests

        if not SMTP_USERNAME or not SMTP_PASSWORD or not FROM_EMAIL:
            logger.error("Email credentials not configured")
            return False

        msg = MIMEMultipart()
        msg["From"] = FROM_EMAIL
        msg["To"] = to_email
        msg["Subject"] = subject

        msg.attach(MIMEText(body, "plain"))

        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.sendmail(FROM_EMAIL, to_email, msg.as_string())
        server.quit()

        logger.info(f"Summary email sent successfully to {to_email}")
        return True

    except Exception as e:
        # Log sanitized error (don't expose SMTP details)
        error_type = type(e).__name__
        if "authentication" in str(e).lower():
            logger.error(f"Email authentication failed for {to_email}")
        elif "connection" in str(e).lower():
            logger.error(f"Email connection failed for {to_email}")
        else:
            logger.error(f"Email send failed for {to_email}: {error_type}")
        return False


async def send_daily_summary(
    user_id: str, user_email: str, user_name: str = "", custom_instructions: str | None = None
) -> bool:
    """
    Generate and send daily summary for a specific user.
    """
    try:
        from auth import users_collection
        from spaces import get_spaces_for_user

        user = await users_collection.find_one({"_id": ObjectId(user_id)})

        # Get user's todos for all spaces
        spaces = await get_spaces_for_user(user_id)
        if user and user.get("email_spaces"):
            allowed = set(user.get("email_spaces", []))
            spaces = [s for s in spaces if s.is_default or s.id in allowed]
        spaces_data = []
        all_todos = []
        for space in spaces:
            space_todos = await get_todos(user_id, space.id)
            todos_dict = [t.dict() if hasattr(t, "dict") else t for t in space_todos]
            relative: List[dict] = []
            for t in todos_dict:
                t_copy = dict(t)
                if t_copy.get("dueDate"):
                    t_copy["dueDateRelative"] = format_date_with_relative(t_copy["dueDate"])
                if t_copy.get("dateAdded"):
                    t_copy["dateAddedRelative"] = format_date_with_relative(t_copy["dateAdded"])
                if t_copy.get("dateCompleted"):
                    t_copy["dateCompletedRelative"] = format_date_with_relative(t_copy["dateCompleted"])
                t_copy["_space"] = space.name
                relative.append(t_copy)
                all_todos.append(t_copy)
            spaces_data.append({"space": space.name, "todos": relative})

        # Get recent journal entries from the past week (max 7)
        recent_journals = await get_journal_entries(user_id, limit=7)
        one_week_ago = (datetime.utcnow() - timedelta(days=7)).date()
        journal_entries: List[dict] = []
        for j in recent_journals:
            j_dict = j.dict() if hasattr(j, "dict") else j
            date_str = j_dict.get("date")
            try:
                entry_date = datetime.fromisoformat(date_str).date()
            except Exception:
                continue
            if entry_date < one_week_ago:
                continue
            entry = {
                "date": date_str,
                "dateRelative": format_date_with_relative(date_str),
                "text": j_dict.get("text", ""),
                "space_id": j_dict.get("space_id"),
            }
            journal_entries.append(entry)

        if custom_instructions is None:
            custom_instructions = user.get("email_instructions", "") if user else ""

        # Always include Buddhist monk instructions in addition to any custom instructions
        buddhist_instructions = get_default_buddhist_instructions()
        if custom_instructions.strip():
            # Combine Buddhist monk instructions with custom instructions after
            custom_instructions = buddhist_instructions + "\n" + custom_instructions
        else:
            # Use only Buddhist monk instructions if no custom ones
            custom_instructions = buddhist_instructions

        user_timezone = user.get("timezone", "America/New_York") if user else "America/New_York"

        # Filter out invalid todos (those without dateAdded)
        valid_todos_dict = [todo for todo in all_todos if todo.get("dateAdded")]
        logger.info(f"Filtered {len(all_todos) - len(valid_todos_dict)} todos with missing dateAdded")

        # Separate completed and uncompleted tasks from valid todos
        completed_todos = [todo for todo in valid_todos_dict if todo.get("completed", False)]
        uncompleted_todos = [todo for todo in valid_todos_dict if not todo.get("completed", False)]

        # Sort uncompleted todos using same logic as UI: priority first, then most recent dateAdded
        def uncompleted_sort_key(todo):
            # First sort by priority (High > Medium > Low)
            priority_order = {"High": 3, "Medium": 2, "Low": 1}
            priority_value = priority_order.get(todo.get("priority"), 0)

            # Then sort by dateAdded (most recent first)
            date_added = todo.get("dateAdded")
            try:
                added_dt = datetime.fromisoformat(date_added.replace("Z", "+00:00"))
                return (-priority_value, -added_dt.timestamp())  # Negative for descending order
            except (ValueError, AttributeError):
                return (-priority_value, 0)

        uncompleted_todos.sort(key=uncompleted_sort_key)

        # Sort completed todos by dateCompleted (most recent first)
        def completed_sort_key(todo):
            date_completed = todo.get("dateCompleted") or todo.get("dateAdded")
            try:
                completed_dt = datetime.fromisoformat(date_completed.replace("Z", "+00:00"))
                return -completed_dt.timestamp()  # Negative for descending order
            except (ValueError, AttributeError):
                return 0

        completed_todos.sort(key=completed_sort_key)

        # Take up to 40 uncompleted and up to 20 completed tasks
        limited = uncompleted_todos[:40] + completed_todos[:20]

        # Regroup limited todos by space
        limited_by_space: Dict[str, List[dict]] = {}
        for todo in limited:
            space_name = todo.pop("_space", "Personal")
            limited_by_space.setdefault(space_name, []).append(todo)
        limited_spaces = [{"space": name, "todos": items} for name, items in limited_by_space.items()]

        # Generate summary
        display_name = user_name or user_email.split("@")[0]
        summary = await generate_todo_summary(
            limited_spaces, journal_entries, display_name, custom_instructions or "", user_timezone
        )

        # Create subject with date in user's timezone
        import pytz  # type: ignore

        try:
            tz = pytz.timezone(user_timezone)
            today = datetime.now(tz).strftime("%A, %B %d, %Y")
        except Exception:
            # Fallback to New York timezone if timezone is invalid
            try:
                tz = pytz.timezone("America/New_York")
                today = datetime.now(tz).strftime("%A, %B %d, %Y")
            except Exception:
                # Final fallback to UTC
                today = datetime.now().strftime("%A, %B %d, %Y")
        subject = f"📋 Your Daily Todo Summary - {today}"

        # Send email
        return await send_email(user_email, subject, summary)

    except Exception as e:
        logger.error(f"Failed to send daily summary to {user_email}: {e}")
        return False


async def send_contact_message(sender_email: str, sender_name: str, message: str) -> bool:
    """Send a contact message to the admin email."""
    try:
        # Format the contact message
        subject = f"📞 Contact Form Message from {sender_name or sender_email}"

        email_body = f"""
Hello,

You have received a new contact form message from your todolist.nyc application.

**From:** {sender_name or 'User'} ({sender_email})
**Sent:** {datetime.now().strftime('%B %d, %Y at %I:%M %p')}

**Message:**
{message}

---
This message was sent from the contact form on todolist.nyc
        """.strip()

        # Send email to the admin (FROM_EMAIL)
        if not FROM_EMAIL:
            logger.error("FROM_EMAIL not configured - cannot send contact message")
            return False
        return await send_email(FROM_EMAIL, subject, email_body)

    except Exception as e:
        logger.error(f"Failed to send contact message from {sender_email}: {e}")
        return False
