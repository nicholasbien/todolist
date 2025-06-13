import json
import logging
import os
from typing import List

from dotenv import load_dotenv
from openai import OpenAI

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables!")

client = OpenAI(api_key=api_key, timeout=5.0, max_retries=0)


async def answer_question(question: str, todos: List[dict]) -> str:
    """Use OpenAI to answer a question about the provided todos."""
    try:
        system_prompt = (
            "You are a helpful assistant who answers questions about the user's todo list. "
            "Use the following JSON data to inform your responses:\n" + json.dumps(todos)
        )
        completion = client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question},
            ],
            temperature=0,
        )
        return completion.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"OpenAI chat error: {e}")
        raise
