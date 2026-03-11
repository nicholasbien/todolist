from datetime import datetime, timedelta
from unittest.mock import AsyncMock

import pytest


async def get_token_and_user(client, email):
    await client.post("/auth/signup", json={"email": email})
    from tests.test_auth import get_verification_code_from_db

    code = await get_verification_code_from_db(email)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    resp = await client.post("/auth/login", json={"email": email, "code": code})
    assert resp.status_code == 200
    data = resp.json()
    return data["token"], data["user"]["id"]


@pytest.mark.asyncio
async def test_email_includes_recent_journals_only(client, test_email, monkeypatch):
    _token, user_id = await get_token_and_user(client, test_email)

    captured: dict = {}

    today = datetime.now()
    recent_entries = [
        {
            "_id": str(i),
            "user_id": user_id,
            "date": (today - timedelta(days=i)).strftime("%Y-%m-%d"),
            "text": f"Recent {i}",
        }
        for i in range(3)
    ]
    old_entries = [
        {
            "_id": f"old{i}",
            "user_id": user_id,
            "date": (today - timedelta(days=8 + i)).strftime("%Y-%m-%d"),
            "text": f"Old {i}",
        }
        for i in range(2)
    ]
    fake_entries = recent_entries + old_entries

    async def fake_get_journal_entries(uid, limit):
        captured["limit"] = limit
        return fake_entries[:limit]

    async def fake_summary(spaces_data, journal_entries, *_args, **_kwargs):
        captured["journals"] = journal_entries
        return "ok"

    monkeypatch.setattr("email_summary.get_journal_entries", fake_get_journal_entries)
    monkeypatch.setattr("email_summary.generate_todo_summary", fake_summary)
    monkeypatch.setattr("email_summary.send_email", AsyncMock(return_value=True))

    from email_summary import send_daily_summary

    await send_daily_summary(user_id, test_email, "")

    assert captured["limit"] == 7
    assert len(captured["journals"]) == 3
    assert all(
        datetime.fromisoformat(j["date"]) >= datetime.now() - timedelta(days=7)
        for j in captured["journals"]
    )
