# Environment Setup Guide

This guide covers all environment variables needed for both frontend and backend deployments.

## Backend Environment Variables (`backend/.env`)

### Required Variables

#### OpenAI API
```bash
OPENAI_API_KEY=sk-proj-xxxxx
```
- **Purpose**: Powers AI features (task classification, agent, chatbot)
- **Get it from**: https://platform.openai.com/api-keys
- **Required for**: All AI functionality

#### MongoDB Database
```bash
MONGODB_URL=mongodb://localhost:27017  # Local
# OR
MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/database  # Cloud
```
- **Purpose**: Database connection for storing todos, users, spaces, etc.
- **Local development**: Use `mongodb://localhost:27017`
- **Production**: Use MongoDB Atlas connection string
- **Get it from**: https://cloud.mongodb.com/

#### JWT Authentication
```bash
JWT_SECRET=your-secure-random-string
```
- **Purpose**: Signs and verifies session tokens
- **Generate with**: `openssl rand -base64 32`
- **Security**: Keep this secret and rotate regularly

#### Weather API
```bash
OPENWEATHER_API_KEY=xxxxx
```
- **Purpose**: Weather data for agent weather queries
- **Get it from**: https://openweathermap.org/api
- **Free tier**: 1000 calls/day

### Optional Variables

#### Email Notifications
```bash
FROM_EMAIL=your-email@gmail.com
SMTP_PASSWORD=your-app-specific-password
```
- **Purpose**: Send verification codes via email
- **Without these**: Codes print to console (fine for development)
- **Gmail setup**:
  1. Enable 2-factor authentication
  2. Generate app password at https://myaccount.google.com/apppasswords
  3. Use app password as SMTP_PASSWORD

#### Web Search
```bash
BRAVE_API_KEY=xxxxx
```
- **Purpose**: Web search functionality in agent
- **Get it from**: https://brave.com/search/api/
- **Free tier**: 2000 queries/month

#### Email Server Settings (defaults provided)
```bash
SMTP_SERVER=smtp.gmail.com  # Default
SMTP_PORT=587               # Default
```

## Frontend Environment Variables (`frontend/.env.local`)

### Required Variables

```bash
# OpenAI API (same key as backend)
OPENAI_API_KEY=sk-proj-xxxxx

# Backend URL (for Next.js server-side)
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000  # Local
# OR
NEXT_PUBLIC_BACKEND_URL=https://your-backend.railway.app  # Production
```

## Quick Setup Script

Create a script to quickly set up environment files:

```bash
#!/bin/bash
# setup-env.sh

# Backend .env
cat > backend/.env << EOF
OPENAI_API_KEY=your-key-here
MONGODB_URL=mongodb://localhost:27017
JWT_SECRET=$(openssl rand -base64 32)
OPENWEATHER_API_KEY=your-key-here
FROM_EMAIL=
SMTP_PASSWORD=
BRAVE_API_KEY=
EOF

# Frontend .env.local
cat > frontend/.env.local << EOF
OPENAI_API_KEY=your-key-here
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
EOF

echo "Environment files created. Please update with your actual API keys."
```

## Production Deployment

### Railway.app
Set environment variables in Railway dashboard:
1. Go to your service settings
2. Click "Variables"
3. Add each variable

### Vercel (Frontend)
Set environment variables in Vercel dashboard:
1. Go to Project Settings > Environment Variables
2. Add variables for Production/Preview/Development

### Docker
Use `.env` files with docker-compose:
```yaml
services:
  backend:
    env_file: ./backend/.env
  frontend:
    env_file: ./frontend/.env.local
```

## Security Best Practices

1. **Never commit `.env` files** - They're in `.gitignore`
2. **Use `.env.example`** as a template (no real values)
3. **Rotate secrets regularly** especially JWT_SECRET
4. **Use different keys** for development and production
5. **Restrict API key permissions** where possible
6. **Monitor API usage** to detect leaks early

## Troubleshooting

### "Email not configured" warning
- Add `FROM_EMAIL` and `SMTP_PASSWORD` to backend `.env`
- Or continue using console output for development

### "MongoDB connection failed"
- Check `MONGODB_URL` format
- Ensure MongoDB is running (local)
- Verify network access (cloud)

### "OpenAI API error"
- Verify API key is valid
- Check billing/usage limits
- Ensure key has correct permissions

### "JWT verification failed"
- Ensure `JWT_SECRET` matches between restarts
- Check token expiration settings
- Clear browser localStorage if needed
