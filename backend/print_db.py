#!/usr/bin/env python3
"""
Script to print out the entire todo database in a readable format.
"""
import asyncio

from db import MONGODB_URL, client, db
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


async def print_database():
    # Use shared database connection

    print("=" * 60)
    print("TODO DATABASE CONTENTS")
    print("=" * 60)
    print(f"Connected to: {MONGODB_URL}")
    print("Database: todo_db")
    print()

    # Print todos collection
    print("TODOS COLLECTION:")
    print("-" * 40)
    todos_collection = db.todos
    todos_count = await todos_collection.count_documents({})
    print(f"Total todos: {todos_count}")
    print()

    if todos_count > 0:
        async for todo in todos_collection.find().sort("dateAdded", 1):
            print(f"Document {todo['_id']}:")
            print("All fields:")
            for field, value in todo.items():
                print(f"  {field}: {value}")
            print("-" * 40)

    # Print categories collection
    print("\nCATEGORIES COLLECTION:")
    print("-" * 40)
    categories_collection = db.categories
    categories_count = await categories_collection.count_documents({})
    print(f"Total categories: {categories_count}")
    print()

    if categories_count > 0:
        async for category in categories_collection.find().sort("name", 1):
            print(f"Document {category['_id']}:")
            print("All fields:")
            for field, value in category.items():
                print(f"  {field}: {value}")
            print("-" * 20)

    # Print users collection (if it exists)
    print("\nUSERS COLLECTION:")
    print("-" * 40)
    users_collection = db.users
    users_count = await users_collection.count_documents({})
    print(f"Total users: {users_count}")
    print()

    if users_count > 0:
        async for user in users_collection.find().sort("email", 1):
            print(f"Document {user['_id']}:")
            print("All fields:")
            for field, value in user.items():
                print(f"  {field}: {value}")
            print("-" * 20)

    # List all collections in the database
    print("\nALL COLLECTIONS IN DATABASE:")
    print("-" * 40)
    collection_names = await db.list_collection_names()
    for collection_name in collection_names:
        collection = db[collection_name]
        count = await collection.count_documents({})
        print(f"- {collection_name}: {count} documents")

    print("\n" + "=" * 60)

    # Close the connection
    client.close()


if __name__ == "__main__":
    asyncio.run(print_database())
