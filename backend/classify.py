import json
import logging
import os
import re
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from categories import DEFAULT_CATEGORIES
from dotenv import load_dotenv
from openai import OpenAI

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
client = OpenAI(api_key=api_key, timeout=5.0, max_retries=0)  # 10 second timeout


def extract_due_date(text: str) -> Tuple[Optional[str], str]:
    """Extract a due date from natural language text.

    Supports simple expressions like "today", "tomorrow" and weekdays
    with optional "next" prefix.

    Returns a tuple of (YYYY-MM-DD or None, cleaned_text).
    """
    lower = text.lower()
    today = datetime.now().date()
    due_date: Optional[str] = None
    cleaned = text

    if re.search(r"\btoday\b", lower):
        due_date = today.isoformat()
        cleaned = re.sub(r"\btoday\b", "", cleaned, flags=re.IGNORECASE).strip()
    elif re.search(r"\btomorrow\b", lower):
        due_date = (today + timedelta(days=1)).isoformat()
        cleaned = re.sub(r"\btomorrow\b", "", cleaned, flags=re.IGNORECASE).strip()
    else:
        days = [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ]
        for i, day in enumerate(days):
            match = re.search(rf"(next\s+)?{day}\b", lower)
            if match:
                weekday = today.weekday()  # Monday=0
                delta = (i - weekday) % 7
                if match.group(1) or delta == 0:
                    delta = delta + 7 if delta == 0 else delta
                due_date = (today + timedelta(days=delta)).isoformat()
                cleaned = re.sub(rf"(next\s+)?{day}\b", "", cleaned, flags=re.IGNORECASE).strip()
                break

    return due_date, cleaned


async def classify_task(text: str, categories: List[str]) -> Dict[str, Any]:
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
        "priority": "Low",
        "dueDate": None,
        "text": text,
    }

    # Use provided categories or default ones if empty
    if not categories:
        categories = DEFAULT_CATEGORIES

    if not text.strip():
        logger.warning("Empty task text provided")
        return default_response

    # We'll rely on the LLM to parse the due date. Heuristics are used only as a fallback
    extracted_due, cleaned_fallback = extract_due_date(text)

    start_time = time.time()
    try:
        # Format categories for the prompt
        categories_str = ", ".join(categories)

        logger.info(f"Starting OpenAI API call for text: {text[:30]}...")

        current_date = datetime.now().isoformat()
        system_prompt = (
            "You are a task organizer. Analyze the task text and return a JSON object with fields: "
            "'category', 'priority', 'text' (cleaned task description with date references removed), "
            "and 'dueDate' (YYYY-MM-DD or null). "
            f"Dates should be interpreted relative to {current_date}. Available categories: {categories_str}. "
            "Priority options: High, Medium, Low. Only output valid JSON."
        )

        # Make synchronous call since OpenAI client handles async internally
        completion = client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f'Task: "{text}"'},
            ],
            temperature=0,
        )

        logger.info(f"OpenAI API call completed in {time.time() - start_time:.2f} seconds")

        try:
            # Safely parse JSON instead of using eval
            content = completion.choices[0].message.content
            logger.info(f"OpenAI response content: {content}")
            result = json.loads(content)

            # Ensure the category is one of the available categories
            category = result.get("category", "General")
            if category not in categories:
                logger.warning(f"Category {category} not in available categories, defaulting to General")
                category = "General"

            due_date = result.get("dueDate")
            if due_date:
                due_date = str(due_date).split("T")[0]

            if not due_date:
                due_date = extracted_due

            cleaned = result.get("text", text).strip() or text
            if cleaned == text and cleaned_fallback != text:
                cleaned = cleaned_fallback

            priority = result.get("priority", "Low")
            if due_date:
                try:
                    days = (datetime.fromisoformat(due_date).date() - datetime.now().date()).days
                    if days <= 1:
                        priority = "High"
                    elif days <= 3 and priority == "Low":
                        priority = "Medium"
                except Exception:
                    pass

            return {
                "category": category,
                "priority": priority,
                "dueDate": due_date,
                "text": cleaned,
            }
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response as JSON: {e}")
            logger.error(f"Response content: {completion.choices[0].message.content}")
            return default_response
    except Exception as e:
        logger.error(f"OpenAI API error after {time.time() - start_time:.2f} seconds: {str(e)}")
        return default_response
