from unittest.mock import AsyncMock, patch

import pytest
from tests.test_todos import get_token


@pytest.mark.asyncio
async def test_chat_endpoint(client, test_email):
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Get user's default space
    resp = await client.get("/spaces", headers=headers)
    assert resp.status_code == 200
    spaces = resp.json()
    default_space = next((s for s in spaces if s["is_default"]), None)
    assert default_space is not None

    with patch("app.answer_question", new=AsyncMock(return_value="Hello")):
        from app import conversations

        conversations.clear()
        resp = await client.post(
            "/chat", json={"question": "What's next?", "space_id": default_space["_id"]}, headers=headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["answer"] == "Hello"


@pytest.mark.asyncio
async def test_chat_endpoint_missing_space_id(client, test_email):
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Test that missing space_id returns validation error
    resp = await client.post("/chat", json={"question": "What's next?"}, headers=headers)
    assert resp.status_code == 422  # Validation error
