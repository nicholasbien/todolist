#!/usr/bin/env python3
"""
Daily todo summary email functionality
"""
import json
import logging
import os
import smtplib
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import openai
from bson import ObjectId
from dotenv import load_dotenv
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


def create_summary_prompt(
    todos_json: str, user_name: str = "there", custom_instructions: str = "", user_timezone: str = "America/New_York"
) -> str:
    """Create a prompt for generating a daily todo summary."""
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

Given the following JSON data of todos, create a warm, encouraging daily summary email.

Todo Data:
{todos_json}

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
{custom_instructions}

Format as plain text email content (no HTML, no subject line).
"""


async def generate_todo_summary(
    todos: list, user_name: str = "there", custom_instructions: str = "", user_timezone: str = "America/New_York"
) -> str:
    """
    Use OpenAI to generate a personalized todo summary.
    """
    try:
        # Convert todos to JSON for the prompt
        todos_json = json.dumps(todos, indent=2, default=str)

        prompt = create_summary_prompt(todos_json, user_name, custom_instructions, user_timezone)

        # Use OpenAI to generate the summary
        client = openai.AsyncOpenAI(api_key=openai.api_key)
        response = await client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful personal assistant creating daily todo summaries.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=500,
            temperature=0.7,
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"Error generating summary with OpenAI: {e}")
        # Fallback to a simple summary
        return create_simple_summary(todos, user_name)


def create_simple_summary(todos: list, user_name: str = "there") -> str:
    """
    Create a simple fallback summary without AI.
    """
    completed = [t for t in todos if t.get("completed", False)]
    pending = [t for t in todos if not t.get("completed", False)]

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
            due = datetime.fromisoformat(str(todo["dueDate"])).strftime("%b %d")
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
        test_emails = ["pytest@example.com", "test@example.com", "pytest2@example.com"]
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
        # Get user's todos
        todos = await get_todos(user_id)

        if custom_instructions is None:
            from auth import users_collection

            user = await users_collection.find_one({"_id": ObjectId(user_id)})
            custom_instructions = user.get("email_instructions", "") if user else ""
            user_timezone = user.get("timezone", "America/New_York") if user else "America/New_York"
        else:
            # If custom_instructions is provided, we still need to get timezone
            from auth import users_collection

            user = await users_collection.find_one({"_id": ObjectId(user_id)})
            user_timezone = user.get("timezone", "America/New_York") if user else "America/New_York"

        # Convert todos to dict format for processing
        todos_dict = [todo.dict() if hasattr(todo, "dict") else todo for todo in todos]

        # Filter out invalid todos (those without dateAdded)
        valid_todos_dict = [todo for todo in todos_dict if todo.get("dateAdded")]
        logger.info(f"Filtered {len(todos_dict) - len(valid_todos_dict)} todos with missing dateAdded")

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

        # Sort completed todos by dateAdded (most recent first) - same as UI
        def completed_sort_key(todo):
            date_added = todo.get("dateAdded")
            try:
                added_dt = datetime.fromisoformat(date_added.replace("Z", "+00:00"))
                return -added_dt.timestamp()  # Negative for descending order (most recent first)
            except (ValueError, AttributeError):
                return 0

        completed_todos.sort(key=completed_sort_key)

        # Take up to 40 uncompleted and up to 20 completed tasks
        limited_todos = uncompleted_todos[:40] + completed_todos[:20]

        # Generate summary
        display_name = user_name or user_email.split("@")[0]
        summary = await generate_todo_summary(limited_todos, display_name, custom_instructions or "", user_timezone)

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
