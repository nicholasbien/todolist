import os

from dotenv import load_dotenv
from mongomock_motor import AsyncMongoMockClient
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
USE_MOCK_DB = os.getenv("USE_MOCK_DB", "false").lower() == "true"

client = AsyncMongoMockClient() if USE_MOCK_DB else AsyncIOMotorClient(MONGODB_URL)
db = client.todo_db
