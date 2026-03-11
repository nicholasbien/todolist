"""
Tests for security fixes in PR #298.
Covers CORS, SSRF protection, authorization, input validation,
security headers, and generic error messages.
"""

from datetime import datetime

import pytest
from tests.test_auth import get_verification_code_from_db


async def get_token(client, email):
    await client.post("/auth/signup", json={"email": email})
    code = await get_verification_code_from_db(email)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    login_resp = await client.post("/auth/login", json={"email": email, "code": code})
    assert login_resp.status_code == 200
    return login_resp.json()["token"]


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------


class TestSecurityHeaders:
    @pytest.mark.asyncio
    async def test_security_headers_present(self, client):
        """Responses should include X-Content-Type-Options, X-Frame-Options, Referrer-Policy."""
        resp = await client.get("/health")
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "DENY"
        assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


# ---------------------------------------------------------------------------
# Input length validation
# ---------------------------------------------------------------------------


class TestInputValidation:
    @pytest.mark.asyncio
    async def test_create_todo_empty_text(self, client, test_email):
        """Empty task text should be rejected."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.post(
            "/todos",
            json={"text": "", "dateAdded": datetime.now().isoformat()},
            headers=headers,
        )
        assert resp.status_code == 400
        assert "required" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_create_todo_text_too_long(self, client, test_email):
        """Task text over 2000 chars should be rejected."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.post(
            "/todos",
            json={"text": "x" * 2001, "dateAdded": datetime.now().isoformat()},
            headers=headers,
        )
        assert resp.status_code == 400
        assert "2000" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_create_todo_notes_too_long(self, client, test_email):
        """Notes over 10000 chars should be rejected."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.post(
            "/todos",
            json={
                "text": "Valid task",
                "notes": "n" * 10001,
                "dateAdded": datetime.now().isoformat(),
            },
            headers=headers,
        )
        assert resp.status_code == 400
        assert "10000" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_update_todo_text_too_long(self, client, test_email):
        """Updating a todo with text over 2000 chars should be rejected."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        # Create a valid todo first
        create_resp = await client.post(
            "/todos",
            json={"text": "Short task", "dateAdded": datetime.now().isoformat()},
            headers=headers,
        )
        assert create_resp.status_code == 200
        todo_id = create_resp.json()["_id"]

        resp = await client.put(
            f"/todos/{todo_id}",
            json={"text": "x" * 2001},
            headers=headers,
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_update_todo_category_too_long(self, client, test_email):
        """Updating a todo with category over 100 chars should be rejected."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        create_resp = await client.post(
            "/todos",
            json={"text": "Some task", "dateAdded": datetime.now().isoformat()},
            headers=headers,
        )
        assert create_resp.status_code == 200
        todo_id = create_resp.json()["_id"]

        resp = await client.put(
            f"/todos/{todo_id}",
            json={"category": "c" * 101},
            headers=headers,
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_reorder_too_many_items(self, client, test_email):
        """Reorder with >500 IDs should be rejected."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        fake_ids = [f"{'a' * 24}" for _ in range(501)]
        resp = await client.put(
            "/todos/reorder",
            json={"todoIds": fake_ids},
            headers=headers,
        )
        assert resp.status_code == 400
        assert "Too many" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Authorization — cross-user isolation
# ---------------------------------------------------------------------------


class TestAuthorization:
    @pytest.mark.asyncio
    async def test_cannot_access_other_users_todo(self, client, test_email, test_email2):
        """User 2 should not be able to GET a todo belonging to User 1."""
        token1 = await get_token(client, test_email)
        token2 = await get_token(client, test_email2)

        # User 1 creates a todo
        resp = await client.post(
            "/todos",
            json={"text": "Private task", "dateAdded": datetime.now().isoformat()},
            headers={"Authorization": f"Bearer {token1}"},
        )
        assert resp.status_code == 200
        todo_id = resp.json()["_id"]

        # User 2 tries to view it — should be denied (403) or not found (404)
        resp2 = await client.get(
            f"/todos/{todo_id}",
            headers={"Authorization": f"Bearer {token2}"},
        )
        assert resp2.status_code in (403, 404)

    @pytest.mark.asyncio
    async def test_cannot_update_other_users_todo(self, client, test_email, test_email2):
        """User 2 should not be able to update a todo belonging to User 1."""
        token1 = await get_token(client, test_email)
        token2 = await get_token(client, test_email2)

        resp = await client.post(
            "/todos",
            json={"text": "User1 task", "dateAdded": datetime.now().isoformat()},
            headers={"Authorization": f"Bearer {token1}"},
        )
        assert resp.status_code == 200
        todo_id = resp.json()["_id"]

        resp2 = await client.put(
            f"/todos/{todo_id}",
            json={"text": "Hacked"},
            headers={"Authorization": f"Bearer {token2}"},
        )
        assert resp2.status_code in (403, 404)

    @pytest.mark.asyncio
    async def test_cannot_delete_other_users_todo(self, client, test_email, test_email2):
        """User 2 should not be able to delete a todo belonging to User 1."""
        token1 = await get_token(client, test_email)
        token2 = await get_token(client, test_email2)

        resp = await client.post(
            "/todos",
            json={"text": "Keep me", "dateAdded": datetime.now().isoformat()},
            headers={"Authorization": f"Bearer {token1}"},
        )
        assert resp.status_code == 200
        todo_id = resp.json()["_id"]

        resp2 = await client.delete(
            f"/todos/{todo_id}",
            headers={"Authorization": f"Bearer {token2}"},
        )
        assert resp2.status_code in (403, 404)

    @pytest.mark.asyncio
    async def test_cannot_reorder_other_users_todos(self, client, test_email, test_email2):
        """User 2 should not be able to reorder User 1's todos."""
        token1 = await get_token(client, test_email)
        token2 = await get_token(client, test_email2)

        resp = await client.post(
            "/todos",
            json={"text": "Reorder target", "dateAdded": datetime.now().isoformat()},
            headers={"Authorization": f"Bearer {token1}"},
        )
        assert resp.status_code == 200
        todo_id = resp.json()["_id"]

        resp2 = await client.put(
            "/todos/reorder",
            json={"todoIds": [todo_id]},
            headers={"Authorization": f"Bearer {token2}"},
        )
        assert resp2.status_code == 403


# ---------------------------------------------------------------------------
# SSRF protection
# ---------------------------------------------------------------------------


class TestSSRFProtection:
    @pytest.mark.asyncio
    async def test_blocks_localhost_url(self, client, test_email):
        """URLs pointing to localhost should not be fetched."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.post(
            "/todos",
            json={
                "text": "http://localhost:8080/admin",
                "dateAdded": datetime.now().isoformat(),
            },
            headers=headers,
        )
        # Should still create the todo, but NOT fetch the URL
        assert resp.status_code == 200
        todo = resp.json()
        # The text should remain as the URL (no title fetched)
        assert todo["text"] == "http://localhost:8080/admin"

    @pytest.mark.asyncio
    async def test_blocks_private_ip_url(self, client, test_email):
        """URLs pointing to private IPs (e.g. 127.0.0.1, 10.x, 192.168.x) should not be fetched."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}

        for url in [
            "http://127.0.0.1:9200/_cat/indices",
            "http://10.0.0.1/internal",
            "http://192.168.1.1/admin",
            "http://169.254.169.254/latest/meta-data/",
        ]:
            resp = await client.post(
                "/todos",
                json={"text": url, "dateAdded": datetime.now().isoformat()},
                headers=headers,
            )
            assert resp.status_code == 200
            assert resp.json()["text"] == url, f"Should not fetch title from {url}"

    @pytest.mark.asyncio
    async def test_blocks_internal_hostname(self, client, test_email):
        """URLs with .local or .internal hostnames should be blocked."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.post(
            "/todos",
            json={
                "text": "http://metadata.internal/secret",
                "dateAdded": datetime.now().isoformat(),
            },
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["text"] == "http://metadata.internal/secret"


# ---------------------------------------------------------------------------
# Generic error messages (no internal details leaked)
# ---------------------------------------------------------------------------


class TestGenericErrors:
    @pytest.mark.asyncio
    async def test_create_todo_error_is_generic(self, client, test_email):
        """500 errors should not leak internal details."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        # Send invalid JSON structure that passes initial validation but fails later
        # We can verify the pattern by checking an endpoint that catches Exception
        # The reorder endpoint with invalid ObjectIds will trigger an exception
        resp = await client.put(
            "/todos/reorder",
            json={"todoIds": ["not-a-valid-objectid"]},
            headers=headers,
        )
        # Should get a 500 with generic message (not repr(exception))
        if resp.status_code == 500:
            detail = resp.json().get("detail", "")
            assert "Error reordering todos" == detail or "Error" in detail
            assert "ObjectId" not in detail
            assert "Traceback" not in detail

    @pytest.mark.asyncio
    async def test_update_todo_error_is_generic(self, client, test_email):
        """Update endpoint 500 errors should not reveal internals."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        # Try to update a todo with invalid ID format
        resp = await client.put(
            "/todos/invalid-id-format",
            json={"text": "test"},
            headers=headers,
        )
        # Should be 404 or 500, but never leak exception details
        if resp.status_code == 500:
            detail = resp.json().get("detail", "")
            assert "repr" not in detail.lower()
            assert "Exception" not in detail


# ---------------------------------------------------------------------------
# Journal input validation
# ---------------------------------------------------------------------------


class TestJournalValidation:
    @pytest.mark.asyncio
    async def test_journal_text_too_long(self, client, test_email):
        """Journal entries over 50000 chars should be rejected."""
        token = await get_token(client, test_email)
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.post(
            "/journals",
            json={
                "text": "j" * 50001,
                "date": "2026-03-10",
            },
            headers=headers,
        )
        assert resp.status_code == 400
        assert "50000" in resp.json()["detail"]
