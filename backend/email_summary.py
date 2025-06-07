#!/usr/bin/env python3
"""
Daily todo summary email functionality
"""
import json
import logging
import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import openai
from auth import get_all_users
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


def create_summary_prompt(todos_json: str, user_name: str = "there") -> str:
    """
    Create a prompt for generating a daily todo summary.
    """
    current_date = datetime.now().strftime("%B %d, %Y")
    return f"""You are a helpful personal assistant creating a daily todo summary email.

Today's date: {current_date}

Given the following JSON data of todos, create a warm, encouraging daily summary email.

Todo Data:
{todos_json}

Instructions:
1. Address the user as "{user_name}" if provided, otherwise use "there"
2. Create a friendly, motivational tone
3. Pay attention to the "dateAdded" field in each todo to understand timing:
   - Celebrate recently completed tasks (completed in last few days)
   - Note if tasks have been completed for a while
   - Identify pending tasks that are getting old/stale
   - Highlight urgent items that have been pending for too long
4. Organize todos by:
   - Recently completed tasks (celebrate achievements!)
   - Pending tasks by priority AND age (High, Medium, Low)
   - Group by categories where relevant
5. Provide insights like:
   - Total tasks completed vs pending
   - Most productive category
   - Tasks that need attention due to age
   - Recent momentum and progress patterns
6. Keep it concise but personal (2-3 paragraphs max)
7. End with a motivational note for the day ahead

Format as plain text email content (no HTML, no subject line).
"""


async def generate_todo_summary(todos: list, user_name: str = "there") -> str:
    """
    Use OpenAI to generate a personalized todo summary.
    """
    try:
        # Convert todos to JSON for the prompt
        todos_json = json.dumps(todos, indent=2, default=str)

        prompt = create_summary_prompt(todos_json, user_name)

        # Use OpenAI to generate the summary
        client = openai.AsyncOpenAI(api_key=openai.api_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
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

    summary = f"""Good morning {user_name}!

Here's your daily todo summary:

✅ Completed: {len(completed)} tasks
📋 Pending: {len(pending)} tasks
🔥 High Priority: {len(high_priority)} tasks

"""

    if high_priority:
        summary += "High priority tasks for today:\n"
        for todo in high_priority[:3]:  # Show top 3
            summary += f"  • {todo.get('text', 'Unknown task')}\n"
        summary += "\n"

    summary += "Have a productive day ahead! 🚀"

    return summary


async def send_email(to_email: str, subject: str, body: str) -> bool:
    """
    Send an email using SMTP.
    """
    try:
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


async def send_daily_summary(user_id: str, user_email: str, user_name: str = "") -> bool:
    """
    Generate and send daily summary for a specific user.
    """
    try:
        # Get user's todos
        todos = await get_todos(user_id)

        # Convert todos to dict format for processing
        todos_dict = [todo.dict() if hasattr(todo, "dict") else todo for todo in todos]

        # Generate summary
        display_name = user_name or user_email.split("@")[0]
        summary = await generate_todo_summary(todos_dict, display_name)

        # Create subject with date
        today = datetime.now().strftime("%B %d, %Y")
        subject = f"📋 Your Daily Todo Summary - {today}"

        # Send email
        return await send_email(user_email, subject, summary)

    except Exception as e:
        logger.error(f"Failed to send daily summary to {user_email}: {e}")
        return False


async def send_all_daily_summaries() -> dict:
    """
    Send daily summaries to all users.
    Returns a dict with success/failure counts.
    """
    try:
        users = await get_all_users()
        results: dict = {"sent": 0, "failed": 0, "errors": []}

        for user in users:
            user_id = str(user.get("_id"))
            user_email = user.get("email")
            user_name = user.get("first_name", "")

            if not user_email:
                continue

            success = await send_daily_summary(user_id, user_email, user_name)
            if success:
                results["sent"] += 1
            else:
                results["failed"] += 1
                results["errors"].append(user_email)

        logger.info(f"Daily summaries sent: {results['sent']} success, {results['failed']} failed")
        return results

    except Exception as e:
        logger.error(f"Error sending daily summaries: {e}")
        return {"sent": 0, "failed": 0, "errors": [str(e)]}
