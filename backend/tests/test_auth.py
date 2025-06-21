#!/usr/bin/env python3
"""
Pytest-compatible authentication tests.
Run with: pytest tests/test_auth.py -v

Note: Tests that require authentication tokens are marked as integration tests
and may require manual verification codes in some cases.
"""

from datetime import datetime

import pytest
import pytest_asyncio

# Requests is no longer needed when using TestClient


async def get_verification_code_from_db(email):
    """Get verification code directly from database for automated testing."""
    try:
        # Use the same mock database connection as the FastAPI app
        import auth

        users_collection = auth.users_collection

        user = await users_collection.find_one({"email": email})

        if user and user.get("verification_code"):
            return user["verification_code"]
        return None
    except Exception as e:
        print(f"Database connection error: {e}")
        return None


@pytest_asyncio.fixture
async def verification_code(test_email):
    """Get verification code from database."""
    code = await get_verification_code_from_db(test_email)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    return code


@pytest_asyncio.fixture
async def verification_code2(test_email2):
    """Get verification code for second user from database."""
    code = await get_verification_code_from_db(test_email2)
    if not code:
        pytest.skip("Could not retrieve verification code from database")
    return code


class TestAuthentication:
    """Authentication system tests."""

    @pytest.mark.asyncio
    async def test_signup_success(self, client, test_email):
        """Test user signup sends verification code."""
        response = await client.post("/auth/signup", json={"email": test_email})

        assert response.status_code == 200
        result = response.json()
        assert "message" in result

    @pytest.mark.asyncio
    async def test_signup_invalid_email(self, client):
        """Test signup with invalid email fails."""
        response = await client.post("/auth/signup", json={"email": "invalid-email"})

        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_login_invalid_code(self, client, test_email):
        """Test login with invalid verification code fails."""
        # First signup
        signup_response = await client.post("/auth/signup", json={"email": test_email})
        assert signup_response.status_code == 200

        # Try login with invalid code
        response = await client.post("/auth/login", json={"email": test_email, "code": "invalid-code"})

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_auth_me_no_token(self, client):
        """Test /auth/me without token fails."""
        response = await client.get("/auth/me")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_auth_me_invalid_token(self, client):
        """Test /auth/me with invalid token fails."""
        headers = {"Authorization": "Bearer invalid-token"}
        response = await client.get("/auth/me", headers=headers)

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_unauthorized_todo_access(self, client):
        """Test that todo endpoints require authentication."""
        # Try to get todos without token
        response = await client.get("/todos")
        assert response.status_code == 401

        # Try with invalid token
        headers = {"Authorization": "Bearer invalid-token"}
        response = await client.get("/todos", headers=headers)
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_health_endpoint(self, client):
        """Test health check endpoint."""
        response = await client.get("/health")
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_root_endpoint(self, client):
        """Test root endpoint."""
        response = await client.get("/")
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
        signup_response = await client.post("/auth/signup", json={"email": test_email})
        assert signup_response.status_code == 200

        # Get verification code from database
        code = await get_verification_code_from_db(test_email)
        if not code:
            pytest.skip("Could not retrieve verification code from database")

        # Login
        login_response = await client.post("/auth/login", json={"email": test_email, "code": code})
        assert login_response.status_code == 200
        result = login_response.json()
        assert "token" in result
        token = result["token"]

        # Test auth/me
        headers = {"Authorization": f"Bearer {token}"}
        me_response = await client.get("/auth/me", headers=headers)
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
        create_response = await client.post("/todos", json=todo_data, headers=headers)
        assert create_response.status_code == 200
        todo = create_response.json()
        todo_id = todo["_id"]

        # Get todos from default space
        # Note: After migration, todos are stored in actual default spaces, not space_id=None
        # So we need to get the user's default space ID to fetch todos
        spaces_response = await client.get("/spaces", headers=headers)
        assert spaces_response.status_code == 200
        spaces = spaces_response.json()

        # Find the default space
        default_space = next((s for s in spaces if s.get("is_default", False)), None)
        assert default_space is not None, "User should have a default space"

        # Get todos from the default space
        get_response = await client.get(f"/todos?space_id={default_space['_id']}", headers=headers)
        assert get_response.status_code == 200
        todos = get_response.json()
        assert len(todos) >= 1
        assert any(t["_id"] == todo_id for t in todos)

        # Complete todo
        complete_response = await client.put(f"/todos/{todo_id}/complete", headers=headers)
        assert complete_response.status_code == 200

        # Delete todo
        delete_response = await client.delete(f"/todos/{todo_id}", headers=headers)
        assert delete_response.status_code == 200

        # Logout
        logout_response = await client.post("/auth/logout", headers=headers)
        assert logout_response.status_code == 200

        # Verify token is invalid after logout
        me_after_logout = await client.get("/auth/me", headers=headers)
        assert me_after_logout.status_code == 401

    @pytest.mark.asyncio
    async def test_user_has_default_space_on_login(self, client, test_email):
        """Test that user automatically gets a default space when they log in."""
        # Sign up
        signup_response = await client.post("/auth/signup", json={"email": test_email})
        assert signup_response.status_code == 200

        # Get verification code
        code = await get_verification_code_from_db(test_email)
        if not code:
            pytest.skip("Could not retrieve verification code")

        # Login
        login_response = await client.post("/auth/login", json={"email": test_email, "code": code})
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Check that user has spaces and at least one is a default space
        spaces_response = await client.get("/spaces", headers=headers)
        assert spaces_response.status_code == 200
        spaces = spaces_response.json()

        # User should have at least one space
        assert len(spaces) >= 1

        # First space should be the default space
        default_space = spaces[0]
        assert default_space["name"] == "Personal"
        assert default_space["is_default"] is True
        assert default_space["owner_id"]  # Should have an owner_id

    @pytest.mark.asyncio
    async def test_first_todo_assigned_to_default_space(self, client, test_email):
        """Test that user's first todo gets assigned to their default space."""
        # Sign up and login
        await client.post("/auth/signup", json={"email": test_email})
        code = await get_verification_code_from_db(test_email)
        if not code:
            pytest.skip("Could not retrieve verification code")

        login_response = await client.post("/auth/login", json={"email": test_email, "code": code})
        token = login_response.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get user's default space
        spaces_response = await client.get("/spaces", headers=headers)
        spaces = spaces_response.json()
        default_space = spaces[0]  # First space should be default
        default_space_id = default_space["_id"]

        # Create a todo (should automatically go to default space)
        todo_data = {
            "text": "Test todo",
            "category": "General",
            "priority": "Medium",
            "dateAdded": "2024-01-01T00:00:00Z",
            "completed": False,
        }

        create_response = await client.post("/todos", json=todo_data, headers=headers)
        assert create_response.status_code == 200

        # Get todos and verify it's in the default space
        todos_response = await client.get(f"/todos?space_id={default_space_id}", headers=headers)
        assert todos_response.status_code == 200
        todos = todos_response.json()

        assert len(todos) == 1
        assert todos[0]["text"] == "Test todo"
        assert todos[0]["space_id"] == default_space_id

    @pytest.mark.asyncio
    async def test_user_isolation(self, client, test_email, test_email2):
        """Test that users can only see their own todos."""
        # Create first user
        await client.post("/auth/signup", json={"email": test_email})
        code1 = await get_verification_code_from_db(test_email)
        if not code1:
            pytest.skip("Could not retrieve verification code for user 1")

        login1_response = await client.post("/auth/login", json={"email": test_email, "code": code1})
        assert login1_response.status_code == 200
        token1 = login1_response.json()["token"]

        # Create second user
        await client.post("/auth/signup", json={"email": test_email2})
        code2 = await get_verification_code_from_db(test_email2)
        if not code2:
            pytest.skip("Could not retrieve verification code for user 2")

        login2_response = await client.post("/auth/login", json={"email": test_email2, "code": code2})
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
        await client.post("/todos", json=todo_data, headers=headers1)

        # User 2 should not see User 1's todos
        headers2 = {"Authorization": f"Bearer {token2}"}
        user2_todos = await client.get("/todos", headers=headers2)
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
