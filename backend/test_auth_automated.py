#!/usr/bin/env python3
"""
Automated test script for authentication system.
This version tests the system programmatically without user input.
"""
import requests
import json
import asyncio
from auth import signup_user, login_user, verify_session
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "http://localhost:8000"
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")

async def get_verification_code_from_db(email):
    """Get the verification code directly from the database."""
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client.todo_db
    users_collection = db.users
    
    user = await users_collection.find_one({"email": email})
    client.close()
    
    if user and "verification_code" in user:
        return user["verification_code"]
    return None

def test_signup(email):
    """Test user signup - should send verification code."""
    print(f"\n🔹 Testing signup for {email}")
    
    response = requests.post(f"{BASE_URL}/auth/signup", 
                           json={"email": email})
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    
    return response.status_code == 200

def test_login(email, code):
    """Test user login with verification code."""
    print(f"\n🔹 Testing login for {email} with code {code}")
    
    response = requests.post(f"{BASE_URL}/auth/login",
                           json={"email": email, "code": code})
    
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
    print(f"\n🔹 Testing /auth/me endpoint")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"User: {result['email']}")
        print("✅ Auth/me successful")
        return result
    else:
        print(f"Response: {response.json()}")
        print("❌ Auth/me failed")
        return None

def test_create_todo(token, text, category="Test", priority="Medium"):
    """Test creating a todo with authentication."""
    print(f"\n🔹 Testing todo creation: '{text}'")
    
    headers = {"Authorization": f"Bearer {token}"}
    todo_data = {
        "text": text,
        "category": category,
        "priority": priority,
        "dateAdded": "2025-06-06T22:30:00Z",
        "completed": False
    }
    
    response = requests.post(f"{BASE_URL}/todos", 
                           json=todo_data, 
                           headers=headers)
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Created todo ID: {result['_id']}")
        print("✅ Todo creation successful")
        return result["_id"]
    else:
        print(f"Error: {response.json()}")
        print("❌ Todo creation failed")
        return None

def test_get_todos(token, user_email):
    """Test getting todos with authentication."""
    print(f"\n🔹 Testing get todos for {user_email}")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/todos", headers=headers)
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Found {len(result)} todos")
        print("✅ Get todos successful")
        for todo in result:
            print(f"  - {todo['text']} (user: {todo['user_id']})")
        return result
    else:
        print(f"Error: {response.json()}")
        print("❌ Get todos failed")
        return []

def test_unauthorized_access():
    """Test that endpoints require authentication."""
    print(f"\n🔹 Testing unauthorized access")
    
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
    print(f"\n🔹 Testing logout")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.post(f"{BASE_URL}/auth/logout", headers=headers)
    
    print(f"Status: {response.status_code}")
    
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
        print(f"Error: {response.json()}")
        print("❌ Logout failed")
        return False

async def run_automated_test():
    """Run the complete authentication test suite automatically."""
    print("🚀 Starting Automated Authentication Test Suite")
    print("="*60)
    
    test_results = []
    
    # Test data
    test_email1 = "test1@example.com"
    test_email2 = "test2@example.com"
    
    try:
        # Test 1: Signup user 1
        print("\n📧 User 1 Signup")
        result = test_signup(test_email1)
        test_results.append(("User 1 Signup", result))
        if not result:
            return test_results
        
        # Get verification code from database
        code1 = await get_verification_code_from_db(test_email1)
        print(f"Retrieved verification code from DB: {code1}")
        
        # Test 2: Login user 1
        print("\n🔑 User 1 Login")
        token1 = test_login(test_email1, code1)
        test_results.append(("User 1 Login", token1 is not None))
        if not token1:
            return test_results
        
        # Test 3: Test auth/me for user 1
        print("\n👤 User 1 Auth Me")
        user1_info = test_auth_me(token1)
        test_results.append(("User 1 Auth Me", user1_info is not None))
        
        # Test 4: Create todo for user 1
        print("\n📝 User 1 Create Todo")
        todo1_id = test_create_todo(token1, "User 1's test todo")
        test_results.append(("User 1 Create Todo", todo1_id is not None))
        
        # Test 5: Get todos for user 1
        print("\n📋 User 1 Get Todos")
        user1_todos = test_get_todos(token1, test_email1)
        test_results.append(("User 1 Get Todos", len(user1_todos) > 0))
        
        # Test 6: Signup user 2
        print("\n📧 User 2 Signup")
        result = test_signup(test_email2)
        test_results.append(("User 2 Signup", result))
        if result:
            # Get verification code for user 2
            code2 = await get_verification_code_from_db(test_email2)
            print(f"Retrieved verification code from DB: {code2}")
            
            # Test 7: Login user 2
            print("\n🔑 User 2 Login")
            token2 = test_login(test_email2, code2)
            test_results.append(("User 2 Login", token2 is not None))
            
            if token2:
                # Test 8: User isolation - user 2 should see no todos
                print("\n🔒 User Isolation Test")
                user2_todos = test_get_todos(token2, test_email2)
                isolation_works = len(user2_todos) == 0
                test_results.append(("User Isolation", isolation_works))
                
                if isolation_works:
                    print("✅ User isolation working - User 2 sees no todos")
                else:
                    print("❌ User isolation failed - User 2 can see other user's todos")
        
        # Test 9: Unauthorized access
        print("\n🚫 Unauthorized Access Test")
        unauth_blocked = test_unauthorized_access()
        test_results.append(("Unauthorized Access Blocked", unauth_blocked))
        
        # Test 10: Logout
        print("\n🚪 Logout Test")
        logout_success = test_logout(token1)
        test_results.append(("Logout", logout_success))
        
    except Exception as e:
        print(f"❌ Test suite error: {e}")
        test_results.append(("Test Suite Error", False))
    
    # Print summary
    print("\n" + "="*60)
    print("🏁 TEST SUMMARY")
    print("="*60)
    
    passed = 0
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status:<10} {test_name}")
        if result:
            passed += 1
    
    print(f"\nResults: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Authentication system is working correctly.")
    else:
        print("⚠️  Some tests failed. Check the output above for details.")
    
    return test_results

if __name__ == "__main__":
    asyncio.run(run_automated_test())