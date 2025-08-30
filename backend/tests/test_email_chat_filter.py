from unittest.mock import AsyncMock

import pytest
from tests.test_auth import get_verification_code_from_db


async def get_token_and_user(client, email):
    await client.post("/auth/signup", json={"email": email})
    code = await get_verification_code_from_db(email)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    resp = await client.post("/auth/login", json={"email": email, "code": code})
    assert resp.status_code == 200
    data = resp.json()
    return data["token"], data["user"]["id"]


async def create_space(client, token, name="Test Space"):
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.post("/spaces", json={"name": name}, headers=headers)
    assert resp.status_code == 200
    return resp.json()["_id"]


@pytest.mark.asyncio
async def test_chat_space_filtering(client, test_email, monkeypatch):
    token, _user_id = await get_token_and_user(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}
    space_a = await create_space(client, token, "A")
    await create_space(client, token, "B")

    resp = await client.post("/email/update-spaces", json={"space_ids": [space_a]}, headers=headers)
    assert resp.status_code == 200

    captured = {}

    async def fake_answer(question, spaces_data, history):
        captured["spaces"] = spaces_data
        return "hi"

    monkeypatch.setattr("app.answer_question", AsyncMock(side_effect=fake_answer))

    resp = await client.post("/chat", json={"question": "hello", "space_id": space_a}, headers=headers)
    assert resp.status_code == 200
    names = {s["space"] for s in captured["spaces"]}
    assert names == {"A"}
