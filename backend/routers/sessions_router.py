"""Agent session messaging routes."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from chat_sessions import append_message
from chat_sessions import create_session as create_chat_session
from chat_sessions import find_session_by_todo, mark_session_read

from .dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["sessions"])


class CreateSessionRequest(BaseModel):
    space_id: Optional[str] = None
    title: Optional[str] = None
    todo_id: Optional[str] = None
    initial_message: Optional[str] = None
    initial_role: str = "user"
    agent_id: Optional[str] = None


class PostMessageRequest(BaseModel):
    role: str = "user"
    content: str
    agent_id: Optional[str] = None
    interim: bool = False
    needs_human_response: bool = False


@router.post("/sessions")
async def api_create_agent_session(req: CreateSessionRequest, current_user: dict = Depends(get_current_user)):
    """Create a new messaging session, optionally linked to a todo."""
    user_id = current_user["user_id"]

    # If todo_id provided, check for existing session
    if req.todo_id:
        existing = await find_session_by_todo(user_id, req.todo_id)
        if existing:
            existing["session_id"] = existing.get("_id")
            return existing

    title = req.title or req.initial_message or "New session"
    session_id = await create_chat_session(user_id, req.space_id, title, todo_id=req.todo_id, agent_id=req.agent_id)

    # Post initial message if provided
    if req.initial_message:
        await append_message(session_id, user_id, req.initial_role, req.initial_message)

    session = await find_session_by_todo(user_id, req.todo_id) if req.todo_id else None
    if not session:
        from bson import ObjectId as _ObjId

        from chat_sessions import sessions_collection

        doc = await sessions_collection.find_one({"_id": _ObjId(session_id)})
        if doc:
            doc["_id"] = str(doc["_id"])
            session = doc

    # Include session_id in response for frontend compatibility
    if session:
        session["session_id"] = session.get("_id") or session_id

    return session


@router.post("/sessions/{session_id}/messages")
async def api_post_session_message(
    session_id: str,
    req: PostMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    """Post a message to a session."""
    user_id = current_user["user_id"]
    message = await append_message(
        session_id,
        user_id,
        req.role,
        req.content,
        req.agent_id,
        interim=req.interim,
        needs_human_response=req.needs_human_response,
    )
    return {"ok": True, "message": message}


@router.post("/sessions/{session_id}/mark-read")
async def api_mark_session_read(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Mark a session's agent replies as read."""
    ok = await mark_session_read(session_id, current_user["user_id"])
    return {"ok": ok}
