#!/bin/bash
# Login to todolist app and get an auth token
# Usage: ./login.sh [API_URL]

API_URL="${1:-${TODOLIST_API_URL:-https://app.todolist.nyc}}"

echo "=== todolist Login ==="
echo "API: $API_URL"
echo ""

read -r -p "Email: " EMAIL
if [ -z "$EMAIL" ]; then
  echo "Error: Email is required"
  exit 1
fi

# Request verification code
echo "Sending verification code..."
SIGNUP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\"}" \
  "$API_URL/auth/signup")

HTTP_CODE=$(echo "$SIGNUP_RESPONSE" | tail -1)
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "Note: Signup returned $HTTP_CODE (may already be registered, continuing...)"
fi

echo "Check your email for a verification code."
echo "(Test account: test@example.com / code: 000000)"
echo ""
read -r -p "Verification code: " CODE

# Login with code
LOGIN_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"code\": \"$CODE\"}" \
  "$API_URL/auth/login")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Login failed. Response: $LOGIN_RESPONSE"
  exit 1
fi

echo ""
echo "Login successful!"
echo ""
echo "Set this environment variable:"
echo "  export TODOLIST_AUTH_TOKEN=\"$TOKEN\""
echo "  export TODOLIST_API_URL=\"$API_URL\""
