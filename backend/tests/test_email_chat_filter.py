from unittest.mock import AsyncMock, patch

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
async def test_email_space_filtering(client, test_email, monkeypatch):
    token, user_id = await get_token_and_user(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}
    space_a = await create_space(client, token, "A")
    space_b = await create_space(client, token, "B")
    spaces_resp = await client.get("/spaces", headers=headers)
    default_space = next((s["_id"] for s in spaces_resp.json() if s.get("is_default")), None)

    with patch("app.classify_task", new=AsyncMock(return_value={"category": "Gen", "priority": "Low"})):
        await client.post("/todos", json={"text": "t1", "space_id": space_a}, headers=headers)
        await client.post("/todos", json={"text": "t2", "space_id": space_b}, headers=headers)
        if default_space:
            await client.post("/todos", json={"text": "t0", "space_id": default_space}, headers=headers)

    resp = await client.post("/email/update-spaces", json={"space_ids": [space_a]}, headers=headers)
    assert resp.status_code == 200

    captured = {}

    async def fake_summary(spaces_data, *_args, **_kwargs):
        captured["spaces"] = spaces_data
        return "ok"

    monkeypatch.setattr("email_summary.generate_todo_summary", fake_summary)
    monkeypatch.setattr("email_summary.send_email", AsyncMock(return_value=True))

    from email_summary import send_daily_summary

    await send_daily_summary(user_id, test_email, "")
    names = {s["space"] for s in captured["spaces"]}
    assert "A" in names
    assert "B" not in names
    assert "Personal" in names


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
    assert "A" in names
    assert "B" not in names
    assert "Personal" in names
