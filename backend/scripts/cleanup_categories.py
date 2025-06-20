#!/usr/bin/env python3
"""
Script to clean up duplicate categories from the database.
"""

import asyncio
import os
from collections import defaultdict

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGODB_URL)
db = client.todo_db
categories_collection = db.categories


async def find_duplicate_categories():
    """Find duplicate categories by name and space_id."""

    # Get all categories
    cursor = categories_collection.find({})
    categories = []
    async for doc in cursor:
        categories.append(doc)

    print(f"Found {len(categories)} total categories")

    # Group by (name, space_id) to find duplicates
    groups = defaultdict(list)
    for cat in categories:
        key = (cat["name"], cat.get("space_id"))
        groups[key].append(cat)

    duplicates = {key: cats for key, cats in groups.items() if len(cats) > 1}

    if not duplicates:
        print("✅ No duplicate categories found!")
        return

    print(f"\n⚠️  Found {len(duplicates)} sets of duplicate categories:")

    for (name, space_id), cats in duplicates.items():
        space_display = f"space_id={space_id}" if space_id else "default space"
        print(f"\n📁 Category '{name}' in {space_display} ({len(cats)} duplicates):")
        for cat in cats:
            print(f"   - ID: {cat['_id']}")

    return duplicates


async def cleanup_duplicates():
    """Remove duplicate categories, keeping only one of each."""

    duplicates = await find_duplicate_categories()
    if not duplicates:
        return

    print("\n🧹 Cleaning up duplicates...")

    total_removed = 0
    for (name, space_id), cats in duplicates.items():
        # Keep the first one, delete the rest
        to_keep = cats[0]
        to_delete = cats[1:]

        space_display = f"space_id={space_id}" if space_id else "default space"
        print(f"\n📁 Category '{name}' in {space_display}:")
        print(f"   ✅ Keeping: {to_keep['_id']}")

        for cat in to_delete:
            result = await categories_collection.delete_one({"_id": cat["_id"]})
            if result.deleted_count > 0:
                print(f"   🗑️  Deleted: {cat['_id']}")
                total_removed += 1
            else:
                print(f"   ❌ Failed to delete: {cat['_id']}")

    print(f"\n✅ Cleanup complete! Removed {total_removed} duplicate categories.")


async def show_category_summary():
    """Show a summary of categories by space."""

    cursor = categories_collection.find({})
    categories = []
    async for doc in cursor:
        categories.append(doc)

    # Group by space_id
    by_space = defaultdict(list)
    for cat in categories:
        space_id = cat.get("space_id")
        by_space[space_id].append(cat["name"])

    print(f"\n📊 Category Summary ({len(categories)} total):")
    for space_id, names in by_space.items():
        space_display = f"Space {space_id}" if space_id else "Default space"
        print(f"   {space_display}: {sorted(names)}")


async def main():
    print("🔍 Checking for duplicate categories...")

    await show_category_summary()

    duplicates = await find_duplicate_categories()

    if duplicates:
        choice = input("\nFound duplicates. Clean them up? (y/N): ").strip().lower()
        if choice == "y":
            await cleanup_duplicates()
            await show_category_summary()
        else:
            print("Skipped cleanup")

    print("\n✅ Done!")


if __name__ == "__main__":
    asyncio.run(main())
