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


@pytest.mark.asyncio
async def test_make_space_private_removes_members(client, test_email, test_email2):
    token1 = await get_token(client, test_email)
    headers1 = {"Authorization": f"Bearer {token1}"}

    create_resp = await client.post("/spaces", json={"name": "Secret"}, headers=headers1)
    assert create_resp.status_code == 200
    space_id = create_resp.json()["_id"]

    # Invite second user and have them join
    await client.post(
        f"/spaces/{space_id}/invite",
        json={"emails": [test_email2]},
        headers=headers1,
    )

    token2 = await get_token(client, test_email2)
    headers2 = {"Authorization": f"Bearer {token2}"}

    resp = await client.get("/spaces", headers=headers2)
    assert any(s["_id"] == space_id for s in resp.json())

    # Make the space private
    upd = await client.put(
        f"/spaces/{space_id}",
        json={"collaborative": False},
        headers=headers1,
    )
    assert upd.status_code == 200

    resp2 = await client.get("/spaces", headers=headers2)
    assert all(s["_id"] != space_id for s in resp2.json())

    cat_resp = await client.get(f"/categories?space_id={space_id}", headers=headers2)
    assert cat_resp.status_code == 403


@pytest.mark.asyncio
async def test_private_clears_pending_invites(client, test_email, test_email3):
    token1 = await get_token(client, test_email)
    headers1 = {"Authorization": f"Bearer {token1}"}

    create_resp = await client.post("/spaces", json={"name": "Temp"}, headers=headers1)
    space_id = create_resp.json()["_id"]

    await client.post(
        f"/spaces/{space_id}/invite",
        json={"emails": [test_email3]},
        headers=headers1,
    )

    await client.put(
        f"/spaces/{space_id}",
        json={"collaborative": False},
        headers=headers1,
    )

    token3 = await get_token(client, test_email3)
    headers3 = {"Authorization": f"Bearer {token3}"}

    resp = await client.get("/spaces", headers=headers3)
    assert all(s["_id"] != space_id for s in resp.json())


@pytest.mark.asyncio
async def test_list_space_members(client, test_email, test_email2):
    token1 = await get_token(client, test_email)
    headers1 = {"Authorization": f"Bearer {token1}"}

    create_resp = await client.post("/spaces", json={"name": "Roster"}, headers=headers1)
    space_id = create_resp.json()["_id"]

    await client.post(
        f"/spaces/{space_id}/invite",
        json={"emails": [test_email2]},
        headers=headers1,
    )

    token2 = await get_token(client, test_email2)
    headers2 = {"Authorization": f"Bearer {token2}"}

    members_resp = await client.get(f"/spaces/{space_id}/members", headers=headers2)
    assert members_resp.status_code == 200
    data = members_resp.json()
    emails = [m["email"] for m in data["members"]]
    assert test_email in emails
    assert test_email2 in emails
