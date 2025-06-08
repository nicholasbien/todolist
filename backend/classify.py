import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List

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

    start_time = time.time()
    try:
        # Format categories for the prompt
        categories_str = ", ".join(categories)

        logger.info(f"Starting OpenAI API call for text: {text[:30]}...")

        current_dt = datetime.now()
        date_context = f"{current_dt.strftime('%A')}, {current_dt.date().isoformat()}"
        system_prompt = (
            "You are a task organizer. Analyze the task text, remove any date references, "
            "and extract a due date if present. Return a JSON object with fields: "
            "'category', 'priority', 'text' (cleaned task description), and 'dueDate' (YYYY-MM-DD or null). "
            f"Dates should be interpreted relative to {date_context}. Available categories: {categories_str}. "
            "Priority options: High, Medium, Low. Only output valid JSON."
        )

        # Make synchronous call since OpenAI client handles async internally
        completion = client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
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

            return {
                "category": category,
                "priority": result.get("priority", "Low"),
                "dueDate": due_date,
                "text": result.get("text", text),
            }
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response as JSON: {e}")
            logger.error(f"Response content: {completion.choices[0].message.content}")
            return default_response
    except Exception as e:
        logger.error(f"OpenAI API error after {time.time() - start_time:.2f} seconds: {str(e)}")
        return default_response
