#!/usr/bin/env python3
"""
Script to print out the entire todo database in a readable format.
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import json
from datetime import datetime

# Load environment variables
load_dotenv()

async def print_database():
    # MongoDB connection
    MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client.todo_db
    
    print("=" * 60)
    print("TODO DATABASE CONTENTS")
    print("=" * 60)
    print(f"Connected to: {MONGODB_URL}")
    print(f"Database: todo_db")
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
            print(f"ID: {todo['_id']}")
            print(f"Text: {todo['text']}")
            print(f"Category: {todo['category']}")
            print(f"Priority: {todo['priority']}")
            print(f"Date Added: {todo['dateAdded']}")
            print(f"Completed: {todo['completed']}")
            if 'dateCompleted' in todo:
                print(f"Date Completed: {todo['dateCompleted']}")
            else:
                print("Date Completed: Not set")
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
            print(f"- {category['name']}")
    
    print("\n" + "=" * 60)
    
    # Close the connection
    client.close()

if __name__ == "__main__":
    asyncio.run(print_database())