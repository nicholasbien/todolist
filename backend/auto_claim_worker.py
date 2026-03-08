"""Background worker that polls for pending sessions and auto-responds.

Runs as an asyncio background task inside the FastAPI process.
Handles simple messages directly; leaves coding tasks for external agents.
"""

import asyncio
import logging
import os
import re

from auth import users_collection
from chat_sessions import append_message, claim_session, get_pending_sessions, get_session_trajectory, release_session

logger = logging.getLogger(__name__)

AGENT_ID = os.getenv("AUTO_CLAIM_AGENT_ID", "auto-claim-worker")
POLL_INTERVAL = int(os.getenv("AUTO_CLAIM_POLL_INTERVAL", "15"))
AGENT_USER_EMAIL = os.getenv("AGENT_USER_EMAIL", "")

# Simple keyword-based classification
CODING_KEYWORDS = re.compile(r"\b(bug|fix|implement|code|deploy|refactor|api|endpoint|database)\b", re.I)
CODE_SIGNALS = re.compile(r"(\b\w+\.(js|ts|py|tsx|jsx|json)\b|`[^`]+`|/[-_a-z0-9]+/)", re.I)


def classify(text: str) -> str:
    """Return 'coding' or 'simple'."""
    if CODING_KEYWORDS.search(text):
        return "coding"
    if CODE_SIGNALS.search(text):
        return "coding"
    return "simple"


def build_simple_response(message: str) -> str:
    """Generate a response for simple messages."""
    low = message.lower()

    if re.search(r"\b(hello|hi|hey)\b", low):
        return "Hello! I picked up your session and I'm ready to help. " "Share the task details and I'll handle it."
    if re.search(r"\bwho\b", low):
        return (
            "I'm the automated todolist assistant. I handle simple requests "
            "directly and route coding tasks to a developer agent."
        )
    if re.search(r"\b(test)\b", low):
        return "Test received! The auto-claim system is working."
    if "?" in low:
        preview = message[:400]
        return f'I received your question: "{preview}". ' "If you need a code-focused answer, please add more detail."

    preview = message[:400]
    return f'I received: "{preview}". How can I help further?'


def get_last_user_message(trajectory: dict) -> str:
    """Extract the last user message from a session trajectory."""
    messages = trajectory.get("display_messages", [])
    for msg in reversed(messages):
        if msg.get("role") == "user" and msg.get("content", "").strip():
            return msg["content"].strip()
    return ""


async def process_session(session: dict, user_id: str) -> None:
    """Claim, classify, respond to, and release a single session."""
    session_id = session["_id"]

    claimed = await claim_session(session_id, user_id, AGENT_ID)
    if not claimed:
        return

    try:
        trajectory = await get_session_trajectory(session_id, user_id)
        if not trajectory:
            logger.warning(f"No trajectory for session {session_id}")
            return

        message = get_last_user_message(trajectory)
        if not message:
            message = session.get("last_message", session.get("title", ""))

        classification = classify(message)
        logger.info(f"Session {session_id}: classified as {classification}, " f"message: {message[:80]!r}")

        if classification == "coding":
            # Leave for external agent (OpenClaw/Claude Code via MCP)
            response = (
                "I see this needs coding work. I've flagged it for the developer agent. "
                "It will pick this up shortly."
            )
        else:
            response = build_simple_response(message)

        await append_message(session_id, user_id, "assistant", response)
        logger.info(f"Session {session_id}: responded ({classification})")

    except Exception as e:
        logger.error(f"Session {session_id}: processing failed: {e}")
        try:
            await append_message(
                session_id,
                user_id,
                "assistant",
                f"I hit an error processing this session: {e}. Please try again.",
            )
        except Exception:
            pass
    finally:
        try:
            await release_session(session_id, user_id, AGENT_ID)
        except Exception as e:
            logger.error(f"Session {session_id}: release failed: {e}")


async def poll_once(user_id: str) -> None:
    """Check for pending sessions and process the first unclaimed one."""
    try:
        pending = await get_pending_sessions(user_id)
        if not pending:
            return

        # Pick first unclaimed session
        for session in pending:
            agent = session.get("agent_id")
            if not agent or agent == AGENT_ID:
                await process_session(session, user_id)
                return  # One at a time to avoid flooding

    except Exception as e:
        logger.error(f"Auto-claim poll failed: {e}")


async def run_worker() -> None:
    """Main worker loop — runs until cancelled."""
    if not AGENT_USER_EMAIL:
        logger.info("AUTO_CLAIM: disabled (AGENT_USER_EMAIL not set)")
        return

    # Wait for DB to be ready
    await asyncio.sleep(5)

    # Find the agent user
    user = await users_collection.find_one({"email": AGENT_USER_EMAIL})
    if not user:
        logger.error(f"AUTO_CLAIM: user not found: {AGENT_USER_EMAIL}")
        return

    user_id = str(user["_id"])
    logger.info(f"AUTO_CLAIM: started (user={AGENT_USER_EMAIL}, " f"interval={POLL_INTERVAL}s, agent_id={AGENT_ID})")

    while True:
        await poll_once(user_id)
        await asyncio.sleep(POLL_INTERVAL)
