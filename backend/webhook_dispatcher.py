"""Webhook dispatcher for notifying external agents of session events."""
import asyncio
import hashlib
import hmac
import json
import logging
import os
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

# Webhook configuration from environment
WEBHOOK_URL = os.getenv("AGENT_WEBHOOK_URL", "")
WEBHOOK_SECRET = os.getenv("AGENT_WEBHOOK_SECRET", "")
WEBHOOK_TIMEOUT = float(os.getenv("AGENT_WEBHOOK_TIMEOUT", "5"))
WEBHOOK_ENABLED = bool(WEBHOOK_URL)


def _generate_signature(payload: Dict[str, Any]) -> str:
    """Generate HMAC-SHA256 signature for webhook payload."""
    if not WEBHOOK_SECRET:
        return ""
    body = json.dumps(payload, separators=(",", ":"), default=str)
    return hmac.new(
        WEBHOOK_SECRET.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()


async def _dispatch_webhook(event: str, payload: Dict[str, Any]) -> bool:
    """Send webhook to external agent system."""
    if not WEBHOOK_ENABLED or not WEBHOOK_URL:
        return False

    full_payload = {
        "event": event,
        "timestamp": datetime.utcnow().isoformat(),
        **payload,
    }

    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": _generate_signature(full_payload),
        "X-Webhook-Event": event,
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                WEBHOOK_URL,
                json=full_payload,
                headers=headers,
                timeout=WEBHOOK_TIMEOUT,
            )
            if response.status_code == 200:
                logger.info(f"Webhook {event} dispatched successfully")
                return True
            else:
                logger.warning(f"Webhook {event} returned {response.status_code}")
                return False
    except Exception as e:
        logger.error(f"Webhook {event} dispatch failed: {e}")
        return False


async def notify_session_created(
    session_id: str,
    user_id: str,
    title: str,
    todo_id: Optional[str] = None,
    space_id: Optional[str] = None,
    message: Optional[str] = None,
) -> bool:
    """Notify external system when new agent session is created."""
    return await _dispatch_webhook("session.created", {
        "session_id": session_id,
        "user_id": user_id,
        "title": title,
        "todo_id": todo_id,
        "space_id": space_id,
        "message": message,
        "needs_agent_response": True,
    })


async def notify_message_posted(
    session_id: str,
    user_id: str,
    role: str,
    content: str,
    agent_id: Optional[str] = None,
) -> bool:
    """Notify external system when new message is posted."""
    # Only notify on user messages that need agent response
    if role != "user":
        return False

    return await _dispatch_webhook("message.posted", {
        "session_id": session_id,
        "user_id": user_id,
        "role": role,
        "content": content,
        "agent_id": agent_id,
        "needs_agent_response": True,
    })


async def notify_session_claimed(
    session_id: str,
    user_id: str,
    agent_id: str,
) -> bool:
    """Notify external system when session is claimed by agent."""
    return await _dispatch_webhook("session.claimed", {
        "session_id": session_id,
        "user_id": user_id,
        "agent_id": agent_id,
    })


async def notify_session_released(
    session_id: str,
    user_id: str,
    agent_id: str,
) -> bool:
    """Notify external system when session is released by agent."""
    return await _dispatch_webhook("session.released", {
        "session_id": session_id,
        "user_id": user_id,
        "agent_id": agent_id,
    })


# Import datetime here to avoid circular imports
from datetime import datetime
