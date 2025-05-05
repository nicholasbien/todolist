import os
import json
import logging
from openai import OpenAI
from dotenv import load_dotenv
from typing import List, Dict, Any
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

# Get API key and validate it exists
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    logger.error("OPENAI_API_KEY not found in environment variables!")
    raise ValueError("OPENAI_API_KEY not found in environment variables!")

# Initialize OpenAI client with timeout
client = OpenAI(
    api_key=api_key,
    timeout=5.0,  # 10 second timeout
    max_retries=0
)

async def classify_task(text: str, categories: List[str] = None) -> Dict[str, Any]:
    """
    Classify a task using OpenAI's API to determine category and priority.
    
    Args:
        text: The task text to classify
        categories: List of available categories for classification
        
    Returns:
        dict: A dictionary containing category and priority
    """
    default_response = {"category": "General", "priority": "Low"}
    
    # Default categories if none provided
    if categories is None:
        categories = ["Work", "Personal", "Shopping", "Finance", "Health", "General"]
    
    if not text.strip():
        logger.warning("Empty task text provided")
        return default_response
        
    start_time = time.time()
    try:
        # Format categories for the prompt
        categories_str = ", ".join(categories)
        
        logger.info(f"Starting OpenAI API call for text: {text[:30]}...")
        
        # Make synchronous call since OpenAI client handles async internally
        completion = client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=[
                {
                    "role": "system",
                    "content": f"You are a task organizer. Analyze the task and categorize it. Respond with a JSON object containing 'category' and 'priority'. Available categories: {categories_str}. Priority options: High, Medium, Low. Only output valid JSON."
                },
                {
                    "role": "user",
                    "content": f'Task: "{text}"'
                }
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
                
            return {
                "category": category,
                "priority": result.get("priority", "Low")
            }
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response as JSON: {e}")
            logger.error(f"Response content: {completion.choices[0].message.content}")
            return default_response
    except Exception as e:
        logger.error(f"OpenAI API error after {time.time() - start_time:.2f} seconds: {str(e)}")
        return default_response
