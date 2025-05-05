from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import logging
import json

# Import the classification function and todo management
from classify import classify_task
from todos import (
    Todo,
    get_todos,
    create_todo,
    delete_todo,
    complete_todo,
    health_check
)
from categories import (
    Category,
    get_categories,
    add_category,
    delete_category,
    init_default_categories
)

# Set up logging with more detail
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Todo List API")

# Enable CORS - specifically for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods including DELETE and PUT
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
        logger.info(f"Starting classification for text: {request.text[:30]}...")
        result = await classify_task(request.text, request.categories)
        logger.info(f"Classification completed with result: {result}")
        return result
    except Exception as e:
        logger.error(f"Error in classification: {str(e)}")
        return {"category": "General", "priority": "Low"}

# Add todo management endpoints
@app.get("/todos", response_model=List[Todo])
async def api_get_todos():
    logger.info("Fetching all todos")
    result = await get_todos()
    logger.info(f"Fetched {len(result)} todos")
    return result

@app.post("/todos", response_model=Todo)
async def api_create_todo(request: Request):
    try:
        # Log the raw request body for debugging
        body = await request.json()
        logger.info(f"Received todo creation request: {json.dumps(body)}")
        
        # Create Todo object from request data
        todo = Todo(**body)
        logger.info(f"Created Todo object: {todo}")
        
        # Create the todo in the database
        result = await create_todo(todo)
        logger.info(f"Todo created successfully: {result}")
        return result
    except Exception as e:
        logger.error(f"Error creating todo: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating todo: {str(e)}")

@app.delete("/todos/{todo_id}")
async def api_delete_todo(todo_id: str):
    logger.info(f"Deleting todo with ID: {todo_id}")
    return await delete_todo(todo_id)

@app.put("/todos/{todo_id}/complete")
async def api_complete_todo(todo_id: str):
    logger.info(f"Marking todo as complete with ID: {todo_id}")
    return await complete_todo(todo_id)

@app.get("/health")
async def api_health_check():
    logger.info("Health check requested")
    return await health_check()

@app.on_event("startup")
async def startup_event():
    """Initialize default categories on startup if they don't exist."""
    await init_default_categories()

# Category management endpoints
@app.get("/categories", response_model=List[str])
async def api_get_categories():
    """Get all categories."""
    logger.info("Fetching all categories")
    return await get_categories()

@app.post("/categories")
async def api_add_category(category: Category):
    """Add a new category."""
    logger.info(f"Adding new category: {category.name}")
    return await add_category(category)

@app.delete("/categories/{name}")
async def api_delete_category(name: str):
    """Delete a category."""
    logger.info(f"Deleting category: {name}")
    return await delete_category(name)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 