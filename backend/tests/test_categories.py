"""Tests for categories API endpoints."""

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
async def test_get_categories_default(client, test_email):
    """Get categories returns at least 'General' by default."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/categories", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()
    assert "General" in categories


@pytest.mark.asyncio
async def test_add_category(client, test_email):
    """Add a new category and verify it appears in the list."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/categories", json={"name": "Work"}, headers=headers
    )
    assert resp.status_code == 200

    resp = await client.get("/categories", headers=headers)
    assert "Work" in resp.json()


@pytest.mark.asyncio
async def test_add_duplicate_category(client, test_email):
    """Adding a category that already exists returns 400."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/categories", json={"name": "DupCat"}, headers=headers)
    resp = await client.post("/categories", json={"name": "DupCat"}, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_rename_category(client, test_email):
    """Rename a category and verify the old name is gone."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/categories", json={"name": "OldName"}, headers=headers)
    resp = await client.put(
        "/categories/OldName", json={"new_name": "NewName"}, headers=headers
    )
    assert resp.status_code == 200

    cats = (await client.get("/categories", headers=headers)).json()
    assert "NewName" in cats
    assert "OldName" not in cats


@pytest.mark.asyncio
async def test_rename_nonexistent_category(client, test_email):
    """Renaming a nonexistent category returns 404."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(
        "/categories/NoSuchCat", json={"new_name": "X"}, headers=headers
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_category(client, test_email):
    """Delete a category and verify it's removed."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/categories", json={"name": "ToDelete"}, headers=headers)
    resp = await client.delete("/categories/ToDelete", headers=headers)
    assert resp.status_code == 200

    cats = (await client.get("/categories", headers=headers)).json()
    assert "ToDelete" not in cats


@pytest.mark.asyncio
async def test_delete_nonexistent_category(client, test_email):
    """Deleting a nonexistent category returns 404."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.delete("/categories/NoSuchCat", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_categories_require_auth(client):
    """Category endpoints require authentication."""
    resp = await client.get("/categories")
    assert resp.status_code == 401
