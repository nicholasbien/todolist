"""Background worker that acknowledges pending sessions.

Runs as an asyncio background task inside the FastAPI process.
Posts a quick acknowledgment so the user knows their message was received,
then leaves the session for the main agent (Claude Code / OpenClaw via MCP)
to pick up and do the actual work.
"""

import asyncio
import logging
import os

from auth import users_collection
from chat_sessions import append_message, get_pending_sessions, get_session_trajectory, trajectories_collection

logger = logging.getLogger(__name__)

POLL_INTERVAL = int(os.getenv("AUTO_CLAIM_POLL_INTERVAL", "15"))
AGENT_USER_EMAIL = os.getenv("AGENT_USER_EMAIL", "")

ACK_MESSAGE = "Got it — your message has been received. " "The agent will pick this up shortly."


def get_last_user_message(trajectory: dict) -> str:
    messages = trajectory.get("display_messages", [])
    for msg in reversed(messages):
        if msg.get("role") == "user" and msg.get("content", "").strip():
            return msg["content"].strip()
    return ""


def already_acknowledged(trajectory: dict) -> bool:
    """Check if the last assistant message is already our ack."""
    messages = trajectory.get("display_messages", [])
    for msg in reversed(messages):
        if msg.get("role") == "assistant":
            return True
        if msg.get("role") == "user":
            return False
    return False


async def acknowledge_session(session: dict, user_id: str) -> None:
    session_id = session["_id"]

    trajectory = await get_session_trajectory(session_id, user_id)
    if not trajectory:
        return

    if already_acknowledged(trajectory):
        return

    message = get_last_user_message(trajectory)
    if not message:
        return

    await append_message(session_id, user_id, "assistant", ACK_MESSAGE)

    # Re-set needs_agent_response so a real agent still picks this up.
    # The ack is just a courtesy message — the session still needs work.
    await trajectories_collection.update_one(
        {"session_id": session_id, "user_id": user_id},
        {"$set": {"needs_agent_response": True}},
    )
    logger.info(f"ACK session {session_id}: {message[:80]!r}")


async def poll_once(user_id: str) -> None:
    try:
        pending = await get_pending_sessions(user_id)
        for session in pending:
            if not session.get("agent_id"):
                await acknowledge_session(session, user_id)
    except Exception as e:
        logger.error(f"Auto-ack poll failed: {e}")


async def run_worker() -> None:
    if not AGENT_USER_EMAIL:
        logger.info("AUTO_ACK: disabled (AGENT_USER_EMAIL not set)")
        return

    await asyncio.sleep(5)

    user = await users_collection.find_one({"email": AGENT_USER_EMAIL})
    if not user:
        logger.error(f"AUTO_ACK: user not found: {AGENT_USER_EMAIL}")
        return

    user_id = str(user["_id"])
    logger.info(f"AUTO_ACK: started (user={AGENT_USER_EMAIL}, interval={POLL_INTERVAL}s)")

    while True:
        await poll_once(user_id)
        await asyncio.sleep(POLL_INTERVAL)
