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
    async def test_user_data_consistency_between_login_and_auth_me(self, client, test_email):
        """Test that login and /auth/me return consistent user data structures.

        This test would have caught the bug where login returned 'id' field
        but /auth/me returned 'user_id' field, causing frontend authentication issues.
        """
        # Sign up
        signup_response = await client.post("/auth/signup", json={"email": test_email})
        assert signup_response.status_code == 200

        # Get verification code
        code = await get_verification_code_from_db(test_email)
        if not code:
            pytest.skip("Could not retrieve verification code")

        # Login and get user data
        login_response = await client.post("/auth/login", json={"email": test_email, "code": code})
        assert login_response.status_code == 200
        login_data = login_response.json()
        assert "token" in login_data
        assert "user" in login_data

        login_user = login_data["user"]
        token = login_data["token"]

        # Call /auth/me and get user data
        headers = {"Authorization": f"Bearer {token}"}
        me_response = await client.get("/auth/me", headers=headers)
        assert me_response.status_code == 200
        me_user = me_response.json()

        # Critical: Both responses should have the same user ID field names
        # This prevents frontend from breaking when it expects consistent field names
        assert "id" in login_user, "Login response should have 'id' field"
        assert "id" in me_user, "/auth/me response should have 'id' field"
        assert login_user["id"] == me_user["id"], "User IDs should match"

        # Both should have the same core fields
        assert login_user["email"] == me_user["email"]
        assert login_user.get("first_name") == me_user.get("first_name")

        # Both should have the same optional fields (or both should not have them)
        for field in [
            "summary_hour",
            "summary_minute",
            "email_instructions",
            "timezone",
            "email_enabled",
            "email_spaces",
        ]:
            login_value = login_user.get(field)
            me_value = me_user.get(field)
            assert login_value == me_value, f"Field '{field}' should match: login={login_value}, me={me_value}"

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

    @pytest.mark.asyncio
    async def test_account_deletion(self, client, test_email):
        """Test that account deletion removes all user data."""
        # Sign up and login
        await client.post("/auth/signup", json={"email": test_email})
        code = await get_verification_code_from_db(test_email)
        if not code:
            pytest.skip("Could not retrieve verification code")

        login_response = await client.post("/auth/login", json={"email": test_email, "code": code})
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        user_id = login_response.json()["user"]["id"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get default space
        spaces_response = await client.get("/spaces", headers=headers)
        spaces = spaces_response.json()
        default_space = spaces[0]
        default_space_id = default_space["_id"]

        # Create some todos
        todo1 = await client.post(
            "/todos",
            json={
                "text": "Test todo 1",
                "category": "Test",
                "priority": "High",
                "dateAdded": datetime.now().isoformat(),
                "completed": False,
            },
            headers=headers,
        )
        assert todo1.status_code == 200

        todo2 = await client.post(
            "/todos",
            json={
                "text": "Test todo 2",
                "category": "Work",
                "priority": "Medium",
                "dateAdded": datetime.now().isoformat(),
                "completed": False,
            },
            headers=headers,
        )
        assert todo2.status_code == 200

        # Create a journal entry
        journal_response = await client.post(
            "/journals",
            json={"date": "2024-01-01", "text": "Test journal entry", "space_id": default_space_id},
            headers=headers,
        )
        assert journal_response.status_code == 200

        # Create a custom category
        category_response = await client.post(
            "/categories", json={"name": "CustomCategory", "space_id": default_space_id}, headers=headers
        )
        assert category_response.status_code == 200

        # Create an additional space
        new_space_response = await client.post("/spaces", json={"name": "Test Space"}, headers=headers)
        assert new_space_response.status_code == 200

        # Verify data exists
        todos_response = await client.get(f"/todos?space_id={default_space_id}", headers=headers)
        assert todos_response.status_code == 200
        todos_before = todos_response.json()
        assert len(todos_before) == 2

        categories_response = await client.get(f"/categories?space_id={default_space_id}", headers=headers)
        assert categories_response.status_code == 200
        categories_before = categories_response.json()
        assert len(categories_before) >= 1  # At least our custom category

        # Delete the account
        delete_response = await client.delete("/auth/me", headers=headers)
        assert delete_response.status_code == 200
        delete_result = delete_response.json()

        # Verify deletion stats
        assert "message" in delete_result
        assert "deleted" in delete_result
        deleted = delete_result["deleted"]
        assert deleted["todos"] == 2
        assert deleted["journals"] == 1
        assert deleted["spaces"] >= 1  # At least the custom space we created
        assert deleted["sessions"] >= 1  # At least the current session

        # Verify the session token is now invalid
        me_response = await client.get("/auth/me", headers=headers)
        assert me_response.status_code == 401

        # Verify user cannot log back in (user account deleted)
        login_again = await client.post("/auth/login", json={"email": test_email, "code": code})
        # The code is now invalid since the user was deleted
        assert login_again.status_code in [400, 404]

        # Verify all user data is deleted from database
        import auth
        from db import collections
        from spaces import spaces_collection

        # Check user is deleted
        user = await auth.users_collection.find_one({"_id": user_id})
        assert user is None

        # Check todos are deleted
        todos = await collections.todos.find({"user_id": user_id}).to_list(length=100)
        assert len(todos) == 0

        # Check journals are deleted (journals store user_id as ObjectId)
        from bson import ObjectId

        try:
            user_object_id = ObjectId(user_id)
            journals = await collections.journals.find({"user_id": user_object_id}).to_list(length=100)
            assert len(journals) == 0
        except Exception:
            # If user_id is not a valid ObjectId, skip journal check
            pass

        # Check spaces owned by user are deleted
        owned_spaces = await spaces_collection.find({"owner_id": user_id}).to_list(length=100)
        assert len(owned_spaces) == 0

        # Check sessions are deleted
        sessions = await auth.sessions_collection.find({"user_id": user_object_id}).to_list(length=100)
        assert len(sessions) == 0


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
