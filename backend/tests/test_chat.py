from unittest.mock import AsyncMock, patch

import pytest
from tests.test_todos import get_token


@pytest.mark.asyncio
async def test_chat_endpoint(client, test_email):
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}
    with patch("app.answer_question", new=AsyncMock(return_value="Hello")):
        resp = await client.post("/chat", json={"question": "What's next?"}, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["answer"] == "Hello"
