"""Tests for journal API endpoints."""

import pytest

from tests.test_auth import get_verification_code_from_db


async def get_token(client, email):
    await client.post("/auth/signup", json={"email": email})
    code = await get_verification_code_from_db(email)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    resp = await client.post("/auth/login", json={"email": email, "code": code})
    assert resp.status_code == 200
    return resp.json()["token"]


@pytest.mark.asyncio
async def test_create_journal_entry(client, test_email):
    """Create a journal entry and verify it returns correctly."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/journals",
        json={"date": "2026-03-12", "text": "Today was productive."},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["date"] == "2026-03-12"
    assert data["text"] == "Today was productive."


@pytest.mark.asyncio
async def test_get_journal_by_date(client, test_email):
    """Get a journal entry by specific date."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/journals",
        json={"date": "2026-03-10", "text": "Monday entry"},
        headers=headers,
    )

    resp = await client.get("/journals?date=2026-03-10", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["text"] == "Monday entry"


@pytest.mark.asyncio
async def test_get_journal_no_date_returns_list(client, test_email):
    """Get journals without date returns a list of recent entries."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/journals",
        json={"date": "2026-03-09", "text": "Entry 1"},
        headers=headers,
    )
    await client.post(
        "/journals",
        json={"date": "2026-03-10", "text": "Entry 2"},
        headers=headers,
    )

    resp = await client.get("/journals", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 2


@pytest.mark.asyncio
async def test_update_existing_journal_entry(client, test_email):
    """Posting to same date updates the existing entry rather than creating new one."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/journals",
        json={"date": "2026-03-11", "text": "Original text"},
        headers=headers,
    )
    resp = await client.post(
        "/journals",
        json={"date": "2026-03-11", "text": "Updated text"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["text"] == "Updated text"

    # Verify only one entry for this date
    get_resp = await client.get("/journals?date=2026-03-11", headers=headers)
    assert get_resp.json()["text"] == "Updated text"


@pytest.mark.asyncio
async def test_delete_journal_entry(client, test_email):
    """Delete a journal entry by ID."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    create_resp = await client.post(
        "/journals",
        json={"date": "2026-03-08", "text": "To be deleted"},
        headers=headers,
    )
    entry_id = create_resp.json()["_id"]

    resp = await client.delete(f"/journals/{entry_id}", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_nonexistent_journal(client, test_email):
    """Deleting a journal entry that doesn't exist returns 404."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.delete("/journals/000000000000000000000000", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_journal_text_length_limit(client, test_email):
    """Journal text longer than 50000 chars is rejected."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    long_text = "x" * 50001
    resp = await client.post(
        "/journals",
        json={"date": "2026-03-12", "text": long_text},
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_journals_require_auth(client):
    """Journal endpoints require authentication."""
    resp = await client.get("/journals")
    assert resp.status_code == 401
