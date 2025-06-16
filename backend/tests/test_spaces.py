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


async def create_test_space(client, token, name="Test Space"):
    """Helper to create a test space and return its ID"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.post("/spaces", json={"name": name}, headers=headers)
    assert resp.status_code == 200
    return resp.json()["_id"]


@pytest.mark.asyncio
async def test_create_space(client, test_email, test_email2):
    token1 = await get_token(client, test_email)
    headers1 = {"Authorization": f"Bearer {token1}"}

    create_resp = await client.post("/spaces", json={"name": "Collab"}, headers=headers1)
    assert create_resp.status_code == 200
    space_id = create_resp.json()["_id"]

    invite_resp = await client.post(
        f"/spaces/{space_id}/invite",
        json={"emails": [test_email2]},
        headers=headers1,
    )
    assert invite_resp.status_code == 200

    token2 = await get_token(client, test_email2)
    headers2 = {"Authorization": f"Bearer {token2}"}

    list_resp = await client.get("/spaces", headers=headers2)
    assert list_resp.status_code == 200
    spaces = list_resp.json()
    assert any(s["_id"] == space_id for s in spaces)


@pytest.mark.asyncio
async def test_edit_space(client, test_email, test_email2):
    token1 = await get_token(client, test_email)
    headers1 = {"Authorization": f"Bearer {token1}"}

    create_resp = await client.post("/spaces", json={"name": "Team"}, headers=headers1)
    assert create_resp.status_code == 200
    space_id = create_resp.json()["_id"]

    update_resp = await client.put(f"/spaces/{space_id}", json={"name": "Team Updated"}, headers=headers1)
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Team Updated"

    invite_resp = await client.post(
        f"/spaces/{space_id}/invite",
        json={"emails": [test_email2]},
        headers=headers1,
    )
    assert invite_resp.status_code == 200

    token2 = await get_token(client, test_email2)
    headers2 = {"Authorization": f"Bearer {token2}"}

    list_resp = await client.get("/spaces", headers=headers2)
    assert list_resp.status_code == 200
    spaces = list_resp.json()
    assert any(s["_id"] == space_id for s in spaces)
