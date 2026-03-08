#!/bin/bash
# Setup script for Railway staging environment

set -e

echo "🚀 Setting up Railway staging environment for todolist"
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is required but not installed"
    echo "Install it with: npm install -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway"
    echo "Run: railway login"
    exit 1
fi

echo "✅ Railway CLI authenticated"
echo ""

# Get project info
echo "📋 Current Railway project:"
railway status
echo ""

# Check if staging environment exists
echo "🔍 Checking for existing environments..."
railway environment list

# Ask user if they want to create staging environment
echo ""
read -p "Create staging environment? (y/n): " CREATE_ENV
if [[ $CREATE_ENV == "y" ]]; then
    echo "🌍 Creating staging environment..."
    railway environment create staging || echo "Staging environment may already exist"
fi

echo ""
echo "📦 Staging services setup instructions:"
echo ""
echo "1. Switch to staging environment:"
echo "   railway environment staging"
echo ""
echo "2. Create staging database:"
echo "   railway add --database mongo"
echo ""
echo "3. Deploy backend service:"
echo "   cd backend && railway up --service backend-staging"
echo ""
echo "4. Deploy frontend service:"
echo "   cd frontend && railway up --service frontend-staging"
echo ""
echo "5. Deploy scripts service:"
echo "   cd scripts && railway up --service scripts-staging"
echo ""
echo "6. Get service IDs for GitHub secrets:"
echo "   railway service list"
echo ""
echo "7. Set environment variables for staging services via Railway dashboard"
echo ""

echo "🔧 GitHub Secrets to create:"
echo ""
echo "   RAILWAY_STAGING_TOKEN          - Railway API token (same as production)"
echo "   RAILWAY_STAGING_PROJECT_ID     - Project ID (same as production)"
echo "   RAILWAY_STAGING_ENVIRONMENT    - Staging environment ID"
echo "   RAILWAY_STAGING_BACKEND_SERVICE    - Backend service ID"
echo "   RAILWAY_STAGING_FRONTEND_SERVICE   - Frontend service ID"
echo "   RAILWAY_STAGING_SCRIPTS_SERVICE    - Scripts service ID"
echo ""

echo "📖 See docs/STAGING.md for detailed instructions"
