#!/usr/bin/env python3
"""
Test script for authentication system.
Run this after starting the FastAPI server.
"""

import requests

BASE_URL = "http://localhost:8000"


def test_signup(email):
    """Test user signup - should send verification code."""
    print(f"\n🔹 Testing signup for {email}")

    response = requests.post(f"{BASE_URL}/auth/signup", json={"email": email})

    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

    if response.status_code == 200:
        print("✅ Signup successful - check console for verification code")
        return True
    else:
        print("❌ Signup failed")
        return False


def test_login(email, code):
    """Test user login with verification code."""
    print(f"\n🔹 Testing login for {email} with code {code}")

    response = requests.post(
        f"{BASE_URL}/auth/login", json={"email": email, "code": code}
    )

    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Response: {result}")

    if response.status_code == 200 and "token" in result:
        print("✅ Login successful")
        return result["token"]
    else:
        print("❌ Login failed")
        return None


def test_auth_me(token):
    """Test getting current user info."""
    print("\n🔹 Testing /auth/me endpoint")

    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers)

    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

    if response.status_code == 200:
        print("✅ Auth/me successful")
        return True
    else:
        print("❌ Auth/me failed")
        return False


def test_create_todo(token, text, category="Test", priority="Medium"):
    """Test creating a todo with authentication."""
    print(f"\n🔹 Testing todo creation: '{text}'")

    headers = {"Authorization": f"Bearer {token}"}
    todo_data = {
        "text": text,
        "category": category,
        "priority": priority,
        "dateAdded": "2025-06-06T22:30:00Z",
        "completed": False,
    }

    response = requests.post(f"{BASE_URL}/todos", json=todo_data, headers=headers)

    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Response: {result}")

    if response.status_code == 200 and "_id" in result:
        print("✅ Todo creation successful")
        return result["_id"]
    else:
        print("❌ Todo creation failed")
        return None


def test_get_todos(token):
    """Test getting todos with authentication."""
    print("\n🔹 Testing get todos")

    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/todos", headers=headers)

    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Found {len(result)} todos")

    if response.status_code == 200:
        print("✅ Get todos successful")
        for todo in result:
            print(f"  - {todo['text']} (user: {todo['user_id']})")
        return result
    else:
        print("❌ Get todos failed")
        return []


def test_unauthorized_access():
    """Test that endpoints require authentication."""
    print("\n🔹 Testing unauthorized access")

    # Try to get todos without token
    response = requests.get(f"{BASE_URL}/todos")
    print(f"GET /todos without auth: {response.status_code}")

    # Try with invalid token
    headers = {"Authorization": "Bearer invalid-token"}
    response = requests.get(f"{BASE_URL}/todos", headers=headers)
    print(f"GET /todos with invalid token: {response.status_code}")

    if response.status_code == 401:
        print("✅ Unauthorized access properly blocked")
        return True
    else:
        print("❌ Should have returned 401")
        return False


def test_logout(token):
    """Test logout functionality."""
    print("\n🔹 Testing logout")

    headers = {"Authorization": f"Bearer {token}"}
    response = requests.post(f"{BASE_URL}/auth/logout", headers=headers)

    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

    if response.status_code == 200:
        print("✅ Logout successful")

        # Try to use the token after logout
        print("🔹 Testing token after logout")
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        print(f"Auth/me after logout: {response.status_code}")

        if response.status_code == 401:
            print("✅ Token properly invalidated")
            return True
        else:
            print("❌ Token should be invalid after logout")
            return False
    else:
        print("❌ Logout failed")
        return False


def run_complete_test():
    """Run the complete authentication test suite."""
    print("🚀 Starting Authentication Test Suite")
    print("=" * 50)

    # Test data
    test_email = "test@example.com"

    # Step 1: Signup
    if not test_signup(test_email):
        print("❌ Test suite failed at signup")
        return

    # Step 2: Get verification code (manual step)
    print("\n📧 Check the server console for the verification code")
    code = input("Enter the verification code: ").strip()

    # Step 3: Login
    token = test_login(test_email, code)
    if not token:
        print("❌ Test suite failed at login")
        return

    # Step 4: Test authenticated endpoints
    test_auth_me(token)

    # Step 5: Test todo creation and retrieval
    test_create_todo(token, "Test authentication todo")
    test_get_todos(token)

    # Step 6: Test unauthorized access
    test_unauthorized_access()

    # Step 7: Test user isolation (create second user)
    print("\n🔹 Testing user isolation")
    test_email2 = "test2@example.com"
    if test_signup(test_email2):
        print("📧 Check console for second verification code")
        code2 = input("Enter the second verification code: ").strip()
        token2 = test_login(test_email2, code2)

        if token2:
            print("🔹 User 2 todos (should be empty):")
            user2_todos = test_get_todos(token2)

            print("🔹 User 1 todos (should have our test todo):")
            test_get_todos(token)

            if len(user2_todos) == 0:
                print("✅ User isolation working correctly")
            else:
                print("❌ User isolation failed - users can see each other's todos")

    # Step 8: Test logout
    test_logout(token)

    print("\n🎉 Authentication test suite completed!")


if __name__ == "__main__":
    run_complete_test()
