"""Test script to verify agent response flag behavior."""

import asyncio
from datetime import datetime
from bson import ObjectId

# Import after setting up the path
import sys
sys.path.insert(0, '/data/workspace/todolist/backend')

from db import db
from chat_sessions import append_message, get_pending_sessions

sessions_collection = db.chat_sessions


async def test_append_message_resets_flag():
    """Test that posting an assistant message resets needs_agent_response."""
    
    # Create a test session
    test_session_id = "test_session_" + datetime.utcnow().isoformat()
    user_id = "69acf86990e15c7b59794960"
    
    # Insert a test session with needs_agent_response=True
    await sessions_collection.insert_one({
        "_id": ObjectId(),
        "user_id": user_id,
        "title": "Test session",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "needs_agent_response": True,
        "agent_id": "openclaw",
        "todo_id": "test_todo"
    })
    
    # Get the session ID we just created (find it)
    session = await sessions_collection.find_one({
        "user_id": user_id,
        "title": "Test session"
    })
    session_id = str(session["_id"])
    
    print(f"Created test session: {session_id}")
    print(f"Before - needs_agent_response: {session.get('needs_agent_response')}")
    
    # Query pending sessions before assistant message
    pending_before = await get_pending_sessions(user_id, agent_id="openclaw")
    session_ids_before = [s["_id"] for s in pending_before]
    print(f"Session in pending list before: {session_id in session_ids_before}")
    
    # Post an assistant message (simulating what I do via curl)
    message = await append_message(
        session_id=session_id,
        user_id=user_id,
        role="assistant",
        content="Test response from agent",
        agent_id=None,  # Not passing agent_id like in my curl calls
        interim=False
    )
    
    # Check the session after
    session_after = await sessions_collection.find_one({"_id": ObjectId(session_id)})
    print(f"After - needs_agent_response: {session_after.get('needs_agent_response')}")
    print(f"After - has_unread_reply: {session_after.get('has_unread_reply')}")
    print(f"After - agent_id: {session_after.get('agent_id')}")
    
    # Query pending sessions after assistant message
    pending_after = await get_pending_sessions(user_id, agent_id="openclaw")
    session_ids_after = [s["_id"] for s in pending_after]
    print(f"Session in pending list after: {session_id in session_ids_after}")
    
    # Cleanup
    await sessions_collection.delete_one({"_id": ObjectId(session_id)})
    print("\nTest complete!")
    
    if session_after.get('needs_agent_response') == False:
        print("✅ PASS: needs_agent_response was correctly set to False")
    else:
        print("❌ FAIL: needs_agent_response is still True!")
        
    if session_id not in session_ids_after:
        print("✅ PASS: Session no longer appears in pending list")
    else:
        print("❌ FAIL: Session still appears in pending list!")


if __name__ == "__main__":
    asyncio.run(test_append_message_resets_flag())
