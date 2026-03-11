"""Push notification support via Web Push API.

Stores push subscriptions per user in MongoDB and sends notifications
when agents post to sessions.
"""

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from db import db

logger = logging.getLogger(__name__)

push_subscriptions_collection = db.push_subscriptions

# VAPID keys for Web Push
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:admin@example.com")


async def init_push_subscription_indexes() -> None:
    """Create indexes for push subscriptions collection."""
    try:
        await push_subscriptions_collection.create_index("user_id")
        # Unique index on endpoint to avoid duplicate subscriptions
        await push_subscriptions_collection.create_index(
            "endpoint",
            unique=True,
        )
        logger.info("Push subscription indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating push subscription indexes: {e}")


async def save_push_subscription(user_id: str, subscription: Dict[str, Any]) -> str:
    """Save or update a push subscription for a user.

    Returns the subscription document ID.
    """
    endpoint = subscription.get("endpoint", "")
    if not endpoint:
        raise ValueError("Subscription must include an endpoint")

    now = datetime.utcnow()
    doc = {
        "user_id": user_id,
        "endpoint": endpoint,
        "keys": subscription.get("keys", {}),
        "expiration_time": subscription.get("expirationTime"),
        "created_at": now,
        "updated_at": now,
    }

    # Upsert by endpoint (one subscription per browser)
    result = await push_subscriptions_collection.update_one(
        {"endpoint": endpoint},
        {"$set": {**doc, "updated_at": now}, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )

    if result.upserted_id:
        return str(result.upserted_id)

    existing = await push_subscriptions_collection.find_one({"endpoint": endpoint})
    return str(existing["_id"]) if existing else ""


async def delete_push_subscription(user_id: str, endpoint: str) -> bool:
    """Remove a push subscription."""
    result = await push_subscriptions_collection.delete_one(
        {"user_id": user_id, "endpoint": endpoint}
    )
    return result.deleted_count > 0


async def get_user_subscriptions(user_id: str) -> List[Dict[str, Any]]:
    """Get all push subscriptions for a user."""
    cursor = push_subscriptions_collection.find({"user_id": user_id})
    items = await cursor.to_list(length=50)
    for item in items:
        item["_id"] = str(item["_id"])
    return items


async def send_push_notification(
    user_id: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
) -> int:
    """Send a push notification to all of a user's subscriptions.

    Returns the number of successfully sent notifications.
    """
    if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
        logger.warning("VAPID keys not configured; skipping push notification")
        return 0

    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("pywebpush not installed; skipping push notification")
        return 0

    subscriptions = await get_user_subscriptions(user_id)
    if not subscriptions:
        return 0

    payload = json.dumps(
        {
            "title": title,
            "body": body,
            "data": data or {},
        }
    )

    sent_count = 0
    stale_endpoints = []

    for sub in subscriptions:
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": sub.get("keys", {}),
        }
        if sub.get("expiration_time"):
            subscription_info["expirationTime"] = sub["expiration_time"]

        try:
            webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
            )
            sent_count += 1
        except WebPushException as e:
            # 410 Gone or 404 means the subscription is no longer valid
            if hasattr(e, "response") and e.response is not None:
                status = (
                    e.response.status_code if hasattr(e.response, "status_code") else 0
                )
                if status in (404, 410):
                    stale_endpoints.append(sub["endpoint"])
                    logger.info(
                        f"Removing stale push subscription: {sub['endpoint'][:60]}..."
                    )
                    continue
            logger.error(f"Failed to send push notification: {e}")
        except Exception as e:
            logger.error(f"Unexpected error sending push notification: {e}")

    # Clean up stale subscriptions
    for endpoint in stale_endpoints:
        await push_subscriptions_collection.delete_one({"endpoint": endpoint})

    return sent_count


async def notify_agent_reply(
    user_id: str,
    session_id: str,
    session_title: str,
    agent_id: Optional[str] = None,
    content_preview: Optional[str] = None,
) -> int:
    """Send a push notification for an agent reply to a session.

    Returns the number of notifications sent.
    """
    agent_label = agent_id or "Agent"
    title = f"{agent_label} replied"
    body = (
        content_preview[:150] if content_preview else f'New reply in "{session_title}"'
    )

    data = {
        "type": "agent_reply",
        "session_id": session_id,
        "url": f"/?session={session_id}",
    }

    return await send_push_notification(user_id, title, body, data)
