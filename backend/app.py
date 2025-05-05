from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import logging

# Import the classification function from classify.py
from classify import classify_task

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Todo List API")

# Enable CORS - specifically for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Specific frontend URL
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

class ClassificationRequest(BaseModel):
    text: str
    categories: Optional[List[str]] = ["Shopping", "Work", "Personal", "Finance", "General"]

@app.get("/")
async def root():
    return {"message": "AI Todo List API is running"}

@app.post("/classify")
async def classify(request: ClassificationRequest):
    """
    Classify a task based on its text description.
    Returns category and priority.
    """
    try:
        logger.info(f"Classifying task: {request.text[:30]}...")
        result = await classify_task(request.text, request.categories)
        logger.info(f"Classification result: {result}")
        return result
    except Exception as e:
        logger.error(f"Error in classification: {str(e)}")
        return {"category": "General", "priority": "Low"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 