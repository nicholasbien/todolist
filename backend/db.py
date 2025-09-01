import logging
import os

from dotenv import load_dotenv
from mongomock_motor import AsyncMongoMockClient
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database configuration
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
USE_MOCK_DB = os.getenv("USE_MOCK_DB", "false").lower() == "true"

# Connection pool settings for better performance
# These settings optimize for a typical web application workload
MONGO_CLIENT_SETTINGS = {
    "maxPoolSize": 100,  # Maximum number of connections in the pool
    "minPoolSize": 10,  # Minimum number of connections to maintain
    "maxIdleTimeMS": 30000,  # Close connections after 30 seconds of inactivity
    "waitQueueTimeoutMS": 5000,  # Max time to wait for a connection from the pool
    "serverSelectionTimeoutMS": 5000,  # Max time to wait for server selection
    "connectTimeoutMS": 10000,  # Max time for initial connection
    "socketTimeoutMS": 20000,  # Max time for socket operations
    "retryWrites": True,  # Enable automatic retry for write operations
}

# Create MongoDB client with connection pooling
if USE_MOCK_DB:
    client = AsyncMongoMockClient()
    logger.info("Using mock database for testing")
else:
    client = AsyncIOMotorClient(MONGODB_URL, **MONGO_CLIENT_SETTINGS)
    logger.info(f"MongoDB client created with connection pooling - Pool size: {MONGO_CLIENT_SETTINGS['maxPoolSize']}")

# Database instance
db = client.todo_db


async def get_database_info() -> dict:
    """Get database connection and performance information."""
    try:
        # Get database stats
        if not USE_MOCK_DB:
            stats = await db.command("dbstats")
            server_info = await client.server_info()
            return {
                "connected": True,
                "database": db.name,
                "server_version": server_info.get("version", "unknown"),
                "collections": stats.get("collections", 0),
                "data_size": stats.get("dataSize", 0),
                "index_size": stats.get("indexSize", 0),
                "connection_pool_size": MONGO_CLIENT_SETTINGS["maxPoolSize"],
            }
        else:
            return {
                "connected": True,
                "database": "mock_database",
                "server_version": "mock",
                "collections": 0,
                "data_size": 0,
                "index_size": 0,
                "connection_pool_size": "mock",
            }
    except ConnectionFailure as e:
        logger.error(f"Database connection failed: {e}")
        return {"connected": False, "error": str(e)}
    except Exception as e:
        logger.error(f"Error getting database info: {e}")
        return {"connected": False, "error": str(e)}


async def check_database_health() -> bool:
    """Check if database connection is healthy."""
    try:
        if not USE_MOCK_DB:
            # Simple ping to check connection
            await client.admin.command("ping")
        return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False


# Export commonly used collections for easy import
# This centralizes collection access and makes it easier to add indexes
class Collections:
    @property
    def users(self):
        return db.users

    @property
    def sessions(self):
        return db.sessions

    @property
    def todos(self):
        return db.todos

    @property
    def categories(self):
        return db.categories

    @property
    def spaces(self):
        return db.spaces

    @property
    def journals(self):
        return db.journals

    @property
    def chats(self):
        return db.chats


collections = Collections()
