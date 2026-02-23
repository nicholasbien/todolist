# Production Deployment Guide - MCP Todo Application

## Overview

This guide covers deploying the AI-powered todo application with MCP (Model Context Protocol) integration to production environments.

## Architecture Components

### Production Stack
- **Frontend**: Next.js 14 application with PWA capabilities
- **Backend**: FastAPI with MongoDB database
- **AI Integration**: OpenAI GPT-4.1 with MCP tool integration
- **Database**: MongoDB (local or MongoDB Atlas)
- **Authentication**: JWT-based session management

### External Dependencies
- **OpenAI API**: GPT-4.1 access required
- **MongoDB**: Database hosting (local, Atlas, or cloud provider)
- **Node.js**: Runtime environment for MCP servers
- **TypeScript**: Compilation for production builds

## Environment Configuration

### Frontend Environment Variables

**Required `.env.local` (Development) / `.env.production` (Production):**
```bash
# Build Configuration
NEXT_PUBLIC_APP_URL=https://your-domain.com
CAPACITOR_BUILD=false

# Node Environment
NODE_ENV=production
```

### Backend Environment Variables

**Required `.env` (Backend):**
```bash
# Database Configuration
MONGODB_URL=mongodb://localhost:27017
# OR for MongoDB Atlas:
# MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/database

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here

# Security Configuration
JWT_SECRET_KEY=your-very-secure-jwt-secret-key
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS Configuration
ALLOWED_ORIGINS=https://your-frontend-domain.com,http://localhost:3000

# Email Configuration (optional)
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASSWORD=your-email-password

# Application Configuration
DEBUG=false
LOG_LEVEL=INFO
```

### Runtime Environment (MCP Servers)
These are automatically set by the agent system during runtime:
```bash
AUTH_TOKEN=<jwt-token-from-request>
CURRENT_SPACE_ID=<user-space-identifier>
NODE_ENV=production
```

## Deployment Options

### Option 1: Traditional VPS/Cloud Server

#### System Requirements
- **CPU**: 2+ cores
- **RAM**: 4GB+ (8GB recommended for concurrent users)
- **Storage**: 20GB+ SSD
- **OS**: Ubuntu 20.04+ or similar Linux distribution
- **Node.js**: v18+ with npm
- **Python**: 3.8+ for backend
- **MongoDB**: 5.0+ (local or remote)

#### Installation Steps

1. **System Setup:**
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python 3.8+
sudo apt install python3 python3-pip python3-venv -y

# Install MongoDB (if local)
sudo apt install mongodb-server -y
sudo systemctl enable mongodb
sudo systemctl start mongodb

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx for reverse proxy
sudo apt install nginx -y
```

2. **Application Deployment:**
```bash
# Clone repository
git clone <your-repo-url>
cd todolist

# Deploy Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with production values

# Deploy Frontend
cd ../frontend
npm install
npm run build
```

3. **Process Management (PM2):**
```bash
# Backend process
cd backend
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'todo-backend',
    cwd: '/path/to/your/app/backend',
    script: 'python',
    args: 'app.py',
    interpreter: '/path/to/your/app/backend/venv/bin/python',
    env: {
      NODE_ENV: 'production'
    },
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    autorestart: true,
    max_restarts: 3,
    min_uptime: '10s'
  }]
}
EOF

# Frontend process
cd ../frontend
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'todo-frontend',
    cwd: '/path/to/your/app/frontend',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 'max',
    exec_mode: 'cluster',
    watch: false,
    autorestart: true,
    max_restarts: 3,
    min_uptime: '10s'
  }]
}
EOF

# Start applications
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

4. **Nginx Configuration:**
```nginx
# /etc/nginx/sites-available/todo-app
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration (use Certbot for Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeout for AI operations
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }

    # Static assets optimization
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Option 2: Docker Deployment

#### Docker Configuration

**Frontend Dockerfile:**
```dockerfile
# Dockerfile (in frontend directory)
FROM node:18-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM node:18-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /app
ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
```

**Backend Dockerfile:**
```dockerfile
# Dockerfile (in backend directory)
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create non-root user
RUN useradd --create-home --shell /bin/bash app
RUN chown -R app:app /app
USER app

EXPOSE 8000

CMD ["python", "app.py"]
```

**Docker Compose:**
```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - backend
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - MONGODB_URL=${MONGODB_URL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
    depends_on:
      - mongodb
    restart: unless-stopped

  mongodb:
    image: mongo:5.0
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=${MONGO_ROOT_USERNAME}
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD}
    restart: unless-stopped

volumes:
  mongodb_data:
```

**Deployment Commands:**
```bash
# Create .env file with production values
cp .env.example .env
# Edit .env with production values

# Build and start containers
docker-compose up -d --build

# View logs
docker-compose logs -f

# Update application
git pull
docker-compose up -d --build
```

### Option 3: Cloud Platform Deployment

#### Vercel (Frontend) + Railway (Backend)

**Vercel Configuration (vercel.json):**
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "env": {},
  "functions": {
    "pages/api/agent/stream.ts": {
      "maxDuration": 300
    }
  },
  "headers": [
    {
      "source": "/api/agent/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    }
  ]
}
```

**Railway Configuration (railway.json):**
```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pip install -r requirements.txt"
  },
  "deploy": {
    "startCommand": "python app.py",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300
  }
}
```

## Production Optimizations

### Performance Optimization

1. **Next.js Build Optimization:**
```javascript
// next.config.js additions
module.exports = {
  // Enable compression
  compress: true,

  // Optimize images
  images: {
    domains: ['your-domain.com'],
    formats: ['image/webp', 'image/avif'],
  },

  // Bundle analysis
  webpack(config) {
    if (process.env.ANALYZE) {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'server',
          openAnalyzer: true,
        })
      )
    }
    return config
  }
}
```

2. **Database Optimization:**
```javascript
// MongoDB indexes for performance
db.todos.createIndex({ "user_id": 1, "space_id": 1, "completed": 1 })
db.todos.createIndex({ "user_id": 1, "dateAdded": -1 })
db.journals.createIndex({ "user_id": 1, "date": -1 })
db.users.createIndex({ "email": 1 }, { unique: true })
db.sessions.createIndex({ "expires_at": 1 }, { expireAfterSeconds: 0 })
```

3. **Resource Limits:**
```bash
# PM2 resource limits
pm2 start ecosystem.config.js --max-memory-restart 1G
pm2 start ecosystem.config.js --max-restarts 3
```

### Security Hardening

1. **Firewall Configuration:**
```bash
# UFW firewall rules
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

2. **SSL/TLS Setup (Let's Encrypt):**
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

3. **Environment Security:**
```bash
# Restrict file permissions
chmod 600 .env
chmod 600 backend/.env

# Use environment variable management
# Consider tools like HashiCorp Vault or AWS Secrets Manager
```

### Monitoring & Logging

1. **Application Monitoring:**
```javascript
// Add to backend/app.py
import logging
from prometheus_client import Counter, Histogram, generate_latest

# Metrics collection
REQUEST_COUNT = Counter('app_requests_total', 'Total requests')
REQUEST_LATENCY = Histogram('app_request_latency_seconds', 'Request latency')

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}
```

2. **Log Management:**
```bash
# PM2 log management
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 10
pm2 set pm2-logrotate:compress true
```

## Deployment Checklist

### Pre-Deployment
- [ ] Environment variables configured
- [ ] Database indexes created
- [ ] SSL certificates obtained
- [ ] Domain DNS configured
- [ ] OpenAI API key validated
- [ ] Resource limits set

### Deployment
- [ ] Code deployed and built successfully
- [ ] Database migrations run
- [ ] Services started and healthy
- [ ] Reverse proxy configured
- [ ] SSL/HTTPS working
- [ ] API endpoints responding

### Post-Deployment
- [ ] End-to-end functionality tested
- [ ] MCP tools working correctly
- [ ] Performance metrics baseline established
- [ ] Monitoring alerts configured
- [ ] Backup procedures verified
- [ ] Rollback procedure documented

## Scaling Considerations

### Horizontal Scaling
- **Load Balancer**: Nginx, HAProxy, or cloud load balancer
- **Multiple Instances**: PM2 cluster mode for Node.js
- **Database**: MongoDB replica sets or sharding
- **Caching**: Redis for session storage and API caching

### Vertical Scaling
- **CPU**: Scale based on AI processing requirements
- **Memory**: 4-8GB per instance recommended
- **Storage**: SSD recommended for database performance
- **Network**: Monitor bandwidth for streaming operations

## Troubleshooting

### Common Issues

1. **MCP Tools Not Working:**
   - Check OpenAI API key validity
   - Verify tsx executable availability
   - Check Node.js version compatibility
   - Review MCP server process logs

2. **Authentication Failures:**
   - Verify JWT secret key consistency
   - Check token expiration settings
   - Review CORS configuration

3. **Performance Issues:**
   - Monitor MCP server process creation
   - Check database connection pooling
   - Review streaming response efficiency
   - Monitor memory usage during AI operations

4. **Database Connection Issues:**
   - Verify MongoDB connection string
   - Check network connectivity
   - Review authentication credentials
   - Monitor connection pool exhaustion

### Log Locations
- **Frontend**: PM2 logs (`pm2 logs todo-frontend`)
- **Backend**: PM2 logs (`pm2 logs todo-backend`)
- **Nginx**: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
- **System**: `/var/log/syslog`

### Health Checks
```bash
# Frontend health
curl -I http://localhost:3000

# Backend health
curl http://localhost:8000/health

# MCP tool test
curl -s "http://localhost:3000/api/agent/stream?q=test" | head -5

# Database connectivity
mongo --eval "db.adminCommand('ismaster')"
```

## Backup & Recovery

### Database Backup
```bash
# MongoDB backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --out /backups/mongodb_$DATE
tar -czf /backups/mongodb_$DATE.tar.gz /backups/mongodb_$DATE
rm -rf /backups/mongodb_$DATE

# Keep only last 7 days of backups
find /backups -name "mongodb_*.tar.gz" -mtime +7 -delete
```

### Application Backup
```bash
# Application code backup
git archive --format=tar.gz HEAD > /backups/app_$(date +%Y%m%d).tar.gz

# Environment configuration backup
cp .env /backups/env_$(date +%Y%m%d).backup
cp backend/.env /backups/backend_env_$(date +%Y%m%d).backup
```

## Performance Benchmarks

### Expected Performance
- **Response Time**: < 200ms for API requests (excluding AI processing)
- **AI Processing**: 2-10 seconds for complex MCP tool operations
- **Concurrent Users**: 50-100 users per server instance
- **Memory Usage**: 1-2GB per frontend instance, 512MB-1GB per backend instance
- **Database**: < 50ms query response time with proper indexing

### Load Testing
```bash
# Install artillery for load testing
npm install -g artillery

# Basic load test configuration (artillery.yml)
config:
  target: 'https://your-domain.com'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Basic functionality"
    requests:
      - get:
          url: "/"
      - get:
          url: "/api/agent/stream?q=hello"
```

This production deployment guide provides comprehensive coverage for deploying the MCP-integrated todo application in various production environments with proper security, monitoring, and scaling considerations.
