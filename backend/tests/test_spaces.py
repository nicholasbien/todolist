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
async def test_create_space(client, test_email, test_email2):
    token1 = await get_token(client, test_email)
    token2 = await get_token(client, test_email2)

    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    create_resp = await client.post(
        "/spaces",
        json={"name": "Collab", "member_emails": [test_email2]},
        headers=headers1,
    )
    assert create_resp.status_code == 200
    space_id = create_resp.json()["_id"]

    list_resp = await client.get("/spaces", headers=headers2)
    assert list_resp.status_code == 200
    spaces = list_resp.json()
    assert any(s["_id"] == space_id for s in spaces)
