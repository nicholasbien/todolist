# flake8: noqa: E501
import logging
import os
import time
from typing import Any, Dict, List

from categories import DEFAULT_CATEGORIES
from dateparse import manual_parse_due_date
from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

# Get API key and validate it exists
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    logger.error("OPENAI_API_KEY not found in environment variables!")
    raise ValueError("OPENAI_API_KEY not found in environment variables!")

# Initialize OpenAI client with timeout
# 4 second timeout - must be less than frontend timeout (5s) to prevent duplicate todos
# If classification times out, we fall back to default classification (General/Medium)
client = OpenAI(api_key=api_key, timeout=4.0, max_retries=0)


# Pydantic model for structured output
class TaskClassification(BaseModel):
    category: str
    priority: str
    text: str
    dueDate: str | None


async def classify_task(text: str, categories: List[str], date_added: str) -> Dict[str, Any]:
    """
    Classify a task using OpenAI's API to determine category and priority.

    Args:
        text: The task text to classify
        categories: List of available categories for classification

    Returns:
        dict: A dictionary containing category and priority
    """
    default_response = {
        "category": "General",
        "priority": "Medium",
        "dueDate": None,
        "text": text,
    }

    # Use provided categories or default ones if empty
    if not categories:
        categories = DEFAULT_CATEGORIES

    if not text.strip():
        logger.warning("Empty task text provided")
        return default_response

    start_time = time.time()
    try:
        # Format categories for the prompt, ensuring General comes first
        if "General" in categories:
            categories_sorted = ["General"] + [c for c in categories if c != "General"]
        else:
            categories_sorted = categories
        categories_str = ", ".join(categories_sorted)

        logger.info(f"Starting OpenAI API call for text: {text[:30]}...")

        # Figure out the day of week from date_added
        try:
            from datetime import datetime

            date_obj = datetime.fromisoformat(date_added)
            day_of_week = date_obj.strftime("%A")
            date_only = date_obj.strftime("%Y-%m-%d")
        except Exception:
            day_of_week = None
            date_only = date_added.split("T")[0] if "T" in date_added else date_added

        system_prompt = f"""You are a task classifier.

Today's date: {day_of_week + ', ' if day_of_week else ''}{date_only}

Classify the task into one of these categories: {categories_str}.
Set priority: High (urgent/critical), Medium (regular), Low (optional).
Remove all date keywords from the text field (words like: today, tomorrow, on, by, due, etc.).

Date extraction rules (use exact dates, not interpretations):
- "today" → {date_only}
- "tomorrow" → the day after {date_only}
- Weekday names (Monday-Sunday) → the soonest upcoming occurrence of that weekday from {date_only} (if today is that weekday, use today; if that weekday has passed this week, use next week)
- Explicit dates (2025-12-15, Dec 15, etc.) → use the exact date provided
- "in X days/weeks" → calculate from {date_only}

Return dueDate in YYYY-MM-DD format or null if no date mentioned."""

        logger.info(f'Full prompt:\n{system_prompt}\n\nUser input: "{text}"')

        # Use Responses API with structured outputs (faster and more reliable)
        response = client.responses.parse(
            model="gpt-4.1-nano",
            input=[{"role": "system", "content": system_prompt}, {"role": "user", "content": f'Task: "{text}"'}],
            text_format=TaskClassification,
            temperature=0,
        )

        logger.info(f"OpenAI API call completed in {time.time() - start_time:.2f} seconds")

        try:
            # Structured output is automatically parsed into Pydantic model
            result = response.output_parsed
            logger.info(
                f"OpenAI response: category={result.category}, priority={result.priority}, dueDate={result.dueDate}"
            )
            result_dict = {
                "category": result.category,
                "priority": result.priority,
                "dueDate": result.dueDate,
                "text": result.text,
            }

            # Ensure the category is one of the available categories
            category = result_dict.get("category", "General")
            if category not in categories:
                logger.warning(f"Category {category} not in available categories, defaulting to General")
                category = "General"

            due_date, cleaned_text = result_dict.get("dueDate"), result_dict.get("text", text)
            if not due_date:
                fallback_due, fallback_text = manual_parse_due_date(text, date_added)
                if fallback_due:
                    due_date = fallback_due
                    cleaned_text = fallback_text

            return {
                "category": category,
                "priority": result_dict.get("priority") or "Medium",
                "dueDate": due_date,
                "text": cleaned_text,
            }
        except Exception as e:
            logger.error(f"Failed to parse OpenAI response: {e}")
            return default_response
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"OpenAI API error after {elapsed:.2f} seconds: {str(e)}")

        # Check if this was a timeout
        if "timeout" in str(e).lower() or elapsed >= 3.9:  # Near 4s timeout
            logger.warning(
                f"Classification timed out for '{text[:30]}...' after {elapsed:.2f}s, "
                "using default classification (General/Medium) with manual date parsing"
            )

        # Fall back to default classification with manual date parsing
        fallback_due, _ = manual_parse_due_date(text, date_added)
        resp = default_response.copy()
        resp["dueDate"] = fallback_due
        return resp
