#!/usr/bin/env python3
"""
Pytest-compatible authentication tests.
Run with: pytest tests/test_auth.py -v

Note: Tests that require authentication tokens are marked as integration tests
and may require manual verification codes in some cases.
"""

import os
from datetime import datetime

import pytest

# Requests is no longer needed when using TestClient


async def get_verification_code_from_db(email):
    """Get verification code directly from database for automated testing."""
    try:
        from dotenv import load_dotenv
        from motor.motor_asyncio import AsyncIOMotorClient

        load_dotenv()
        MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
        client = AsyncIOMotorClient(MONGODB_URL)
        db = client.todo_db
        users_collection = db.users

        user = await users_collection.find_one({"email": email})
        client.close()  # Always close the connection

        if user and user.get("verification_code"):
            return user["verification_code"]
        return None
    except Exception as e:
        print(f"Database connection error: {e}")
        return None


@pytest.fixture
async def verification_code(test_email):
    """Get verification code from database."""
    code = await get_verification_code_from_db(test_email)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    return code


@pytest.fixture
async def verification_code2(test_email2):
    """Get verification code for second user from database."""
    code = await get_verification_code_from_db(test_email2)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    return code


class TestAuthentication:
    """Authentication system tests."""

    def test_signup_success(self, client, test_email):
        """Test user signup sends verification code."""
        response = client.post("/auth/signup", json={"email": test_email})

        assert response.status_code == 200
        result = response.json()
        assert "message" in result

    def test_signup_invalid_email(self, client):
        """Test signup with invalid email fails."""
        response = client.post("/auth/signup", json={"email": "invalid-email"})

        assert response.status_code == 422  # Validation error

    def test_login_invalid_code(self, client, test_email):
        """Test login with invalid verification code fails."""
        # First signup
        signup_response = client.post("/auth/signup", json={"email": test_email})
        assert signup_response.status_code == 200

        # Try login with invalid code
        response = client.post("/auth/login", json={"email": test_email, "code": "invalid-code"})

        assert response.status_code == 400

    def test_auth_me_no_token(self, client):
        """Test /auth/me without token fails."""
        response = client.get("/auth/me")

        assert response.status_code == 401

    def test_auth_me_invalid_token(self, client):
        """Test /auth/me with invalid token fails."""
        headers = {"Authorization": "Bearer invalid-token"}
        response = client.get("/auth/me", headers=headers)

        assert response.status_code == 401

    def test_unauthorized_todo_access(self, client):
        """Test that todo endpoints require authentication."""
        # Try to get todos without token
        response = client.get("/todos")
        assert response.status_code == 401

        # Try with invalid token
        headers = {"Authorization": "Bearer invalid-token"}
        response = client.get("/todos", headers=headers)
        assert response.status_code == 401

    def test_health_endpoint(self, client):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "healthy"

    def test_root_endpoint(self, client):
        """Test root endpoint."""
        response = client.get("/")
        assert response.status_code == 200
        result = response.json()
        assert "message" in result


@pytest.mark.integration
class TestAuthenticationWithDatabase:
    """Integration tests that require database access for verification codes."""

    @pytest.mark.asyncio
    async def test_full_auth_flow(self, client, test_email):
        """Test complete authentication flow."""
        # Signup
        signup_response = await client.apost("/auth/signup", json={"email": test_email})
        assert signup_response.status_code == 200

        # Get verification code from database
        code = await get_verification_code_from_db(test_email)
        if not code:
            pytest.skip("Could not retrieve verification code from database")

        # Login
        login_response = await client.apost("/auth/login", json={"email": test_email, "code": code})
        assert login_response.status_code == 200
        result = login_response.json()
        assert "token" in result
        token = result["token"]

        # Test auth/me
        headers = {"Authorization": f"Bearer {token}"}
        me_response = await client.aget("/auth/me", headers=headers)
        assert me_response.status_code == 200
        user_info = me_response.json()
        assert user_info["email"] == test_email

        # Test todo operations
        todo_data = {
            "text": "Integration test todo",
            "category": "Test",
            "priority": "High",
            "dateAdded": datetime.now().isoformat(),
            "completed": False,
        }

        # Create todo
        create_response = await client.apost("/todos", json=todo_data, headers=headers)
        assert create_response.status_code == 200
        todo = create_response.json()
        todo_id = todo["_id"]

        # Get todos
        get_response = await client.aget("/todos", headers=headers)
        assert get_response.status_code == 200
        todos = get_response.json()
        assert len(todos) >= 1
        assert any(t["_id"] == todo_id for t in todos)

        # Complete todo
        complete_response = await client.aput(f"/todos/{todo_id}/complete", headers=headers)
        assert complete_response.status_code == 200

        # Delete todo
        delete_response = await client.adelete(f"/todos/{todo_id}", headers=headers)
        assert delete_response.status_code == 200

        # Logout
        logout_response = await client.apost("/auth/logout", headers=headers)
        assert logout_response.status_code == 200

        # Verify token is invalid after logout
        me_after_logout = await client.aget("/auth/me", headers=headers)
        assert me_after_logout.status_code == 401

    @pytest.mark.asyncio
    async def test_user_isolation(self, client, test_email, test_email2):
        """Test that users can only see their own todos."""
        # Create first user
        await client.apost("/auth/signup", json={"email": test_email})
        code1 = await get_verification_code_from_db(test_email)
        if not code1:
            pytest.skip("Could not retrieve verification code for user 1")

        login1_response = await client.apost("/auth/login", json={"email": test_email, "code": code1})
        assert login1_response.status_code == 200
        token1 = login1_response.json()["token"]

        # Create second user
        await client.apost("/auth/signup", json={"email": test_email2})
        code2 = await get_verification_code_from_db(test_email2)
        if not code2:
            pytest.skip("Could not retrieve verification code for user 2")

        login2_response = await client.apost("/auth/login", json={"email": test_email2, "code": code2})
        assert login2_response.status_code == 200
        token2 = login2_response.json()["token"]

        # User 1 creates a todo
        headers1 = {"Authorization": f"Bearer {token1}"}
        todo_data = {
            "text": "User 1 todo",
            "category": "Test",
            "priority": "Medium",
            "dateAdded": datetime.now().isoformat(),
            "completed": False,
        }
        await client.apost("/todos", json=todo_data, headers=headers1)

        # User 2 should not see User 1's todos
        headers2 = {"Authorization": f"Bearer {token2}"}
        user2_todos = await client.aget("/todos", headers=headers2)
        assert user2_todos.status_code == 200
        todos = user2_todos.json()
        assert len(todos) == 0  # User 2 should have no todos


class TestEmailFunctionality:
    """Email-related tests (may be skipped in environments without SMTP)."""

    def test_smtp_configuration(self):
        """Test that SMTP configuration is available."""
        import os

        from dotenv import load_dotenv

        load_dotenv()
        smtp_server = os.getenv("SMTP_SERVER")
        smtp_username = os.getenv("SMTP_USERNAME")
        from_email = os.getenv("FROM_EMAIL")

        # These should be configured for email functionality to work
        # But we don't require them for basic app functionality
        if smtp_server and smtp_username and from_email:
            assert smtp_server == "smtp.gmail.com"
            assert "@" in from_email
        else:
            pytest.skip("SMTP configuration not available")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
