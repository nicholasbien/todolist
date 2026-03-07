#!/bin/bash
# Deploy todolist to Railway

cd /data/workspace/todolist

# Create MongoDB first
railway add --database mongo

# Create backend service with env vars
railway add --service todolist-backend \
  --variables "JWT_SECRET=your-jwt-secret-here" \
  --variables "MONGODB_URL=\${{MongoDB.MONGO_URL}}" \
  --repo nicholasbien/todolist

# Create frontend service
railway add --service todolist-frontend \
  --repo nicholasbien/todolist
