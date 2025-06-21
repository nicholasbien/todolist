#!/usr/bin/env python3
"""One-time script to rename default spaces from 'Default' to 'Personal'."""
import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGODB_URL)
db = client.todo_db
spaces_collection = db.spaces


async def rename_spaces():
    result = await spaces_collection.update_many(
        {"name": "Default", "is_default": True}, {"$set": {"name": "Personal"}}
    )
    print(f"Renamed {result.modified_count} spaces from 'Default' to 'Personal'.")


async def main():
    await rename_spaces()
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
