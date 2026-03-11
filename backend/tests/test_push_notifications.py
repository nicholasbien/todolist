"""Tests for push notification subscription endpoints."""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.conftest import get_token  # noqa: E402


@pytest.mark.asyncio
async def test_get_vapid_key(client):
    """GET /push/vapid-key returns the configured VAPID public key."""
    resp = await client.get("/push/vapid-key")
    assert resp.status_code == 200
    data = resp.json()
    assert "vapid_public_key" in data


@pytest.mark.asyncio
async def test_subscribe_requires_auth(client):
    """POST /push/subscribe requires authentication."""
    resp = await client.post(
        "/push/subscribe",
        json={
            "endpoint": "https://example.com/push",
            "keys": {"p256dh": "a", "auth": "b"},
        },
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_subscribe_and_unsubscribe(client, test_email):
    """Full subscribe + unsubscribe cycle."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Subscribe
    sub_data = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/test-push-123",
        "keys": {"p256dh": "test-p256dh-key", "auth": "test-auth-key"},
    }
    resp = await client.post("/push/subscribe", json=sub_data, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Subscribe again (should upsert, not duplicate)
    resp = await client.post("/push/subscribe", json=sub_data, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Unsubscribe
    resp = await client.post(
        "/push/unsubscribe",
        json={"endpoint": sub_data["endpoint"]},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Unsubscribe again (already removed)
    resp = await client.post(
        "/push/unsubscribe",
        json={"endpoint": sub_data["endpoint"]},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is False
