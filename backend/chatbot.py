import json
import logging
import os
from datetime import datetime
from typing import List

from dotenv import load_dotenv
from openai import OpenAI

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables!")

# Allow a bit more time for responses from the assistant
client = OpenAI(api_key=api_key, timeout=15.0, max_retries=0)


async def answer_question(question: str, spaces_data: List[dict], history: List[dict]) -> str:
    """Use OpenAI to answer a question about the provided tasks and journals."""
    try:
        current_date = datetime.now().strftime("%A, %B %d, %Y")
        system_prompt = (
            f"You are a helpful assistant who answers questions about the user's tasks and journal entries. "
            f"Today's date is {current_date}. "
            "Use the following JSON data (organized by space) to inform your responses. "
            "When discussing dates, use relative terms like 'today', 'yesterday', 'tomorrow', "
            "or 'this week' when appropriate. "
            "If the user asks about a specific space, only discuss that space.\n" + json.dumps(spaces_data)
        )
        messages = [{"role": "system", "content": system_prompt}] + history + [{"role": "user", "content": question}]
        completion = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=messages,
            temperature=1,
        )
        return completion.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"OpenAI chat error: {e}")
        raise
