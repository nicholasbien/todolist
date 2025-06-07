#!/bin/bash

# Todo List App Deployment Script for Railway
echo "🚀 Deploying Todo List App to Railway..."

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is required but not installed"
    echo "Install it with: npm install -g @railway/cli"
    exit 1
fi

# Check if logged in to Railway
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway"
    echo "Run: railway login"
    exit 1
fi

echo "📦 Building and deploying backend..."
railway up --service backend

echo "📦 Building and deploying frontend..."
railway up --service todolist

echo "✅ Deployment complete!"
echo ""
echo "🔗 Your services should be available at:"
echo "Backend:  https://your-backend-service.railway.app"
echo "Frontend: https://your-frontend-service.railway.app"
echo ""
echo "⚠️  Don't forget to set environment variables in Railway dashboard:"
echo "Backend:  MONGODB_URL, OPENAI_API_KEY, SMTP_*, JWT_SECRET"
echo "Frontend: OPENAI_API_KEY, NEXT_PUBLIC_API_URL"
