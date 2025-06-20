#!/usr/bin/env python3
"""
Script to clean up duplicate "Default" spaces from the database.

The real default space should be conceptual (space_id = None),
but there may be actual "Default" spaces created in the database
that need to be removed.
"""

import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGODB_URL)
db = client.todo_db
spaces_collection = db.spaces
categories_collection = db.categories
todos_collection = db.todos


async def cleanup_duplicate_defaults():
    """Find and delete duplicate Default spaces."""

    # Find all spaces named "Default"
    cursor = spaces_collection.find({"name": "Default"})
    default_spaces = []
    async for doc in cursor:
        default_spaces.append(doc)

    print(f"Found {len(default_spaces)} spaces named 'Default':")
    for space in default_spaces:
        print(f"  - ID: {space['_id']}, Owner: {space['owner_id']}")

    if not default_spaces:
        print("No duplicate Default spaces found.")
        return

    if len(default_spaces) == 1:
        print("Only one Default space found - checking if it should be deleted...")
        space = default_spaces[0]

        # Check if this space has any todos or categories
        space_id_str = str(space["_id"])
        todo_count = await todos_collection.count_documents({"space_id": space_id_str})
        category_count = await categories_collection.count_documents({"space_id": space_id_str})

        print(f"  - Todos in this space: {todo_count}")
        print(f"  - Categories in this space: {category_count}")

        if todo_count == 0 and category_count == 0:
            print("This Default space is empty and can be safely deleted.")
            confirmation = input("Delete this empty Default space? (y/N): ").strip().lower()
            if confirmation == "y":
                await spaces_collection.delete_one({"_id": space["_id"]})
                print("✅ Deleted empty Default space")
            else:
                print("Skipped deletion")
        else:
            print("This Default space has data. You may want to migrate it manually.")
    else:
        print("Multiple Default spaces found!")
        for i, space in enumerate(default_spaces):
            space_id_str = str(space["_id"])
            todo_count = await todos_collection.count_documents({"space_id": space_id_str})
            category_count = await categories_collection.count_documents({"space_id": space_id_str})
            print(f"  Space {i+1}: ID={space['_id']}, Todos={todo_count}, Categories={category_count}")

        print("\nRecommendation: Keep one with data, delete empty ones")


async def migrate_default_space_data():
    """Migrate any data from Default spaces to the conceptual default (space_id = None)."""

    # Find all spaces named "Default"
    cursor = spaces_collection.find({"name": "Default"})
    default_spaces = []
    async for doc in cursor:
        default_spaces.append(doc)

    for space in default_spaces:
        space_id_str = str(space["_id"])

        # Migrate todos from this space to space_id = None
        result = await todos_collection.update_many({"space_id": space_id_str}, {"$set": {"space_id": None}})
        if result.modified_count > 0:
            print(f"Migrated {result.modified_count} todos from space {space_id_str} to default space")

        # Migrate categories from this space to space_id = None
        result = await categories_collection.update_many({"space_id": space_id_str}, {"$set": {"space_id": None}})
        if result.modified_count > 0:
            print(f"Migrated {result.modified_count} categories from space {space_id_str} to default space")


async def main():
    print("🔍 Checking for duplicate Default spaces...")
    await cleanup_duplicate_defaults()

    print("\n" + "=" * 50)
    choice = input("\nDo you want to migrate data from Default spaces to conceptual default? (y/N): ").strip().lower()

    if choice == "y":
        print("\n📦 Migrating data to conceptual default space...")
        await migrate_default_space_data()

        print("\n🔍 Checking again after migration...")
        await cleanup_duplicate_defaults()

    print("\n✅ Cleanup complete!")


if __name__ == "__main__":
    asyncio.run(main())
