# Self-Hosting Strategy for todolist

> **Status:** Planning / RFC
> **Date:** 2026-03-12
> **Goal:** Make self-hosting the *primary* way users run todolist, with an optional hosted tier later.

---

## Table of Contents

1. [Vision](#1-vision)
2. [Current Architecture Summary](#2-current-architecture-summary)
3. [Deployment Options](#3-deployment-options)
   - 3a. Local Docker Compose (recommended starting point)
   - 3b. Railway Template (one-click cloud)
   - 3c. Vercel Frontend + Separate Backend
   - 3d. Single VPS / VM
4. [Docker Image Strategy](#4-docker-image-strategy)
5. [Environment Variables Reference](#5-environment-variables-reference)
6. [Security Considerations](#6-security-considerations)
7. [VPN Compatibility](#7-vpn-compatibility)
8. [Agent / MCP Connectivity](#8-agent--mcp-connectivity)
9. [Data Ownership & Migration](#9-data-ownership--migration)
10. [Code Changes Required](#10-code-changes-required)
11. [Phased Rollout Plan](#11-phased-rollout-plan)

---

## 1. Vision

todolist should be **self-host-first**. Every user owns their data — either on their local machine or on infrastructure they control (cloud VM, Railway, etc.). The architecture already lends itself to this:

- The backend is a stateless FastAPI app that talks to MongoDB.
- The frontend is a Next.js app that can be built as static files or run as a Node server.
- The MCP server is a standalone Node process that just needs a backend URL + auth token.
- The offline-first PWA with IndexedDB means the app already works without a persistent server connection.

Later, a **managed/hosted tier** can be offered for users who do not want to manage infrastructure, but the self-hosted path should always be first-class.

---

## 2. Current Architecture Summary

```
┌─────────────────┐       ┌──────────────────┐       ┌──────────┐
│  Next.js Frontend│──────▶│  FastAPI Backend  │──────▶│ MongoDB  │
│  (Railway/Vercel)│       │  (Railway)        │       │ (Atlas)  │
│                  │       │                   │       │          │
│  - Service Worker│       │  - Auth (JWT)     │       └──────────┘
│  - IndexedDB     │       │  - Todos CRUD     │
│  - PWA offline   │       │  - Agent/Chat     │
│  - Proxy → API   │       │  - Scheduler      │
└─────────────────┘       │  - CORS config    │
                           └──────────────────┘
                                    ▲
                           ┌────────┴────────┐
                           │  MCP Server      │
                           │  (Claude Desktop) │
                           │  TODOLIST_API_URL │
                           │  TODOLIST_AUTH_TOKEN│
                           └─────────────────┘
```

**Key technical facts from the codebase:**

| Component | Tech | Config |
|-----------|------|--------|
| Frontend | Next.js 14, React 18, Tailwind, Capacitor (iOS) | `BACKEND_URL`, `NEXT_PUBLIC_BACKEND_URL` |
| Backend | FastAPI, Motor (async MongoDB), APScheduler | `MONGODB_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `CORS_ORIGINS` |
| Database | MongoDB (Motor driver, connection pooling) | `MONGODB_URL` — supports local or Atlas |
| Auth | Email + OTP code → JWT session token (30-day rolling) | `JWT_SECRET`, `FROM_EMAIL`, `SMTP_PASSWORD` |
| Agent | FastAPI router at `/agent/*`, SSE streaming | OpenAI API key on backend |
| MCP Server | Node.js, `@modelcontextprotocol/sdk` | `TODOLIST_API_URL`, `TODOLIST_AUTH_TOKEN` |
| Service Worker | Offline-first, routes all API calls through proxy | Routes via `self.location.origin` + proxy path |
| Deployment | Railway (Nixpacks), `railway.json` per service | Currently no Dockerfiles |
| CORS | `CORS_ORIGINS` env var, defaults: `localhost:3141, capacitor://localhost` | Must include self-hosted frontend origin |

---

## 3. Deployment Options

### 3a. Local Docker Compose (Recommended Starting Point)

**Best for:** Developers, privacy-focused users, local-first usage, VPN setups.

```yaml
# docker-compose.yml (to be created)
version: '3.8'

services:
  mongodb:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
    ports:
      - "27017:27017"
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - MONGODB_URL=mongodb://mongodb:27017
      - JWT_SECRET=${JWT_SECRET}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - FROM_EMAIL=${FROM_EMAIL:-}
      - SMTP_PASSWORD=${SMTP_PASSWORD:-}
      - CORS_ORIGINS=http://localhost:3141
    ports:
      - "8141:8141"
    depends_on:
      - mongodb
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      - BACKEND_URL=http://backend:8141
      - NEXT_PUBLIC_BACKEND_URL=http://localhost:8141
    ports:
      - "3141:3141"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  mongo_data:
```

**User experience:**
```bash
git clone https://github.com/yourorg/todolist.git
cd todolist
cp .env.example .env   # fill in JWT_SECRET, OPENAI_API_KEY
docker compose up -d
# Open http://localhost:3141
```

### 3b. Railway Template (One-Click Cloud Self-Hosting)

**Best for:** Users who want persistent cloud hosting without managing servers.

Railway supports **project templates** that spin up multiple services from a single repo. We already have `railway.json` for both frontend and backend.

**What to create:**
- A `railway.toml` or template definition at the repo root
- Pre-configured service definitions for: Frontend, Backend, MongoDB (Railway plugin)
- Template sets required env vars with prompts

**User experience:**
1. Click "Deploy on Railway" button
2. Railway prompts for `JWT_SECRET`, `OPENAI_API_KEY`, optional `FROM_EMAIL`/`SMTP_PASSWORD`
3. Railway provisions MongoDB plugin automatically
4. Services start and are connected via internal networking
5. User gets a public URL for the frontend

**Railway template structure:**
```toml
# railway.toml (to be created)
[template]
name = "todolist Self-Hosted"
description = "Your own todolist instance with MongoDB"

[[services]]
name = "backend"
source = "backend/"
[services.env]
MONGODB_URL = "${{MongoDB.MONGO_URL}}"
JWT_SECRET = { required = true, description = "Random secret for JWT signing" }
OPENAI_API_KEY = { required = true, description = "OpenAI API key for AI features" }

[[services]]
name = "frontend"
source = "frontend/"
[services.env]
BACKEND_URL = "${{backend.url}}"
NEXT_PUBLIC_BACKEND_URL = "${{backend.url}}"

[[plugins]]
name = "MongoDB"
plugin = "mongodb"
```

### 3c. Vercel Frontend + Separate Backend

**Best for:** Users who want fast global CDN for the frontend with a separate backend.

- Frontend deploys to Vercel (free tier is generous)
- Backend + MongoDB on Railway, Render, Fly.io, or a VPS
- Frontend `BACKEND_URL` points to the backend's public URL

**Considerations:**
- Vercel's serverless functions handle the Next.js API proxy (`pages/api/[...proxy].js`)
- SSE streaming for the agent requires the `next.config.js` rewrite to work (Vercel supports this)
- CORS must include the Vercel domain
- Service worker routes through same-origin proxy, so cross-origin issues are handled

**Setup steps:**
1. Deploy backend to Railway/Render with MongoDB
2. Fork repo, connect to Vercel
3. Set `BACKEND_URL` and `NEXT_PUBLIC_BACKEND_URL` to the backend URL
4. Set `CORS_ORIGINS` on backend to include Vercel URL

### 3d. Single VPS / VM

**Best for:** Users with existing server infrastructure.

Same as Docker Compose, but deployed on a cloud VM (DigitalOcean, Hetzner, AWS EC2, etc.). Add:
- Caddy or nginx as reverse proxy for HTTPS
- Let's Encrypt for SSL certificates
- systemd or Docker Compose for process management

```
# Example Caddyfile
todolist.example.com {
    reverse_proxy localhost:3141
}

api.todolist.example.com {
    reverse_proxy localhost:8141
}
```

---

## 4. Docker Image Strategy

**Recommendation: Separate images for frontend and backend.**

Reasons:
- They have different runtimes (Node.js vs Python)
- They scale independently
- Frontend can optionally be a static export served by nginx
- Matches the existing Railway two-service architecture

### Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8141/health')"

EXPOSE 8141

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8141"]
```

### Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:20-slim AS builder

WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3141
ENV PORT=3141

CMD ["node", "server.js"]
```

> **Note:** The frontend Dockerfile uses Next.js standalone output mode, which requires adding `output: 'standalone'` to `next.config.js` (only when building for Docker, not for Railway/Vercel). This can be controlled via an env var.

### Publishing

- Publish to GitHub Container Registry (ghcr.io) or Docker Hub
- Tag with version numbers and `latest`
- CI/CD builds on each release tag

---

## 5. Environment Variables Reference

### Backend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URL` | Yes | `mongodb://localhost:27017` | MongoDB connection string |
| `JWT_SECRET` | Yes | — | Secret for signing JWT tokens. Generate with `openssl rand -base64 32` |
| `OPENAI_API_KEY` | Yes | — | OpenAI API key for AI/agent features |
| `CORS_ORIGINS` | No | `http://localhost:3141,...` | Comma-separated allowed origins |
| `FROM_EMAIL` | No | — | Email address for sending notifications |
| `SMTP_PASSWORD` | No | — | SMTP app password |
| `SMTP_SERVER` | No | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | No | `587` | SMTP port |
| `BRAVE_API_KEY` | No | — | Brave Search API key (web search features) |
| `OPENWEATHER_API_KEY` | No | — | Weather API key |

### Frontend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BACKEND_URL` | Yes | `http://localhost:8141` | Backend URL for server-side proxy |
| `NEXT_PUBLIC_BACKEND_URL` | Yes | `http://localhost:8141` | Backend URL for client-side SSE |

### MCP Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TODOLIST_API_URL` | Yes | `http://localhost:8141` | Backend API URL |
| `TODOLIST_AUTH_TOKEN` | Yes | — | JWT token for API authentication |

---

## 6. Security Considerations

### 6.1 Risks from Previous Analysis (with Mitigations)

| Risk | Mitigation |
|------|------------|
| **Token theft** (malicious backend steals JWT) | Self-hosted = user controls the backend. For multi-user, use separate JWT secrets per instance |
| **Data poisoning** (fake tasks injected) | User owns the database. No external writes unless explicitly shared |
| **SSRF** (backend URL points to internal services) | For local: not a concern. For cloud: document network isolation best practices |
| **Phishing** (fake login pages) | Users deploy their own frontend — they control the domain |
| **Man-in-the-middle** | Require HTTPS for non-localhost deployments. Document TLS setup |

### 6.2 Self-Hosted Security Checklist

1. **Generate a strong JWT_SECRET** — never use defaults
2. **Use HTTPS** for any non-localhost deployment (Caddy auto-TLS, or Railway/Vercel handle this)
3. **Restrict CORS_ORIGINS** to your actual frontend domain
4. **MongoDB authentication** — enable auth for non-localhost MongoDB:
   ```
   MONGODB_URL=mongodb://user:password@host:27017/todo_db?authSource=admin
   ```
5. **Firewall rules** — only expose ports 3141 (frontend) and optionally 8141 (backend) publicly. MongoDB (27017) should never be publicly accessible
6. **Keep dependencies updated** — especially `fastapi`, `motor`, `next`
7. **Backup MongoDB regularly** — `mongodump` or Atlas automated backups

### 6.3 Auth for Self-Hosted

The current auth system (email + OTP code) works well for self-hosted because:
- Email OTP means no passwords to manage
- JWT sessions are stateless and work across restarts
- 30-day rolling expiry is reasonable

**For local-only use without email:** Consider adding an optional "local mode" that skips email verification (single-user, no SMTP required). This would be controlled by an env var like `AUTH_MODE=local`.

---

## 7. VPN Compatibility

The architecture is fully VPN-compatible because:

1. **All communication is HTTP/HTTPS** — standard protocols that work through any VPN
2. **Service worker routes via same-origin** — the `getBackendUrl()` in `sw.js` uses `self.location.origin`, so it follows wherever the frontend is hosted
3. **No hardcoded URLs** — everything is driven by environment variables
4. **Offline-first** — the IndexedDB + sync queue means the app works even when the VPN drops temporarily

### VPN Deployment Patterns

**Pattern A: Local Docker + VPN (most private)**
```
User's Device → VPN Tunnel → Home Server (Docker Compose)
                               ├── Frontend :3141
                               ├── Backend :8141
                               └── MongoDB :27017
```
- All traffic stays on VPN
- No public exposure
- MCP server connects via VPN tunnel too

**Pattern B: Cloud + VPN (Tailscale/WireGuard)**
```
User's Device → Tailscale → Cloud VM
                              ├── Frontend :3141 (Tailscale IP only)
                              ├── Backend :8141 (Tailscale IP only)
                              └── MongoDB :27017 (localhost only)
```
- Services only accessible via Tailscale network
- No public ports needed
- Zero-config TLS via Tailscale HTTPS

**Pattern C: Public cloud with VPN as extra layer**
```
User's Device → Internet → Railway/Vercel (HTTPS)
                    │
                    └── VPN → Agent/MCP Server → Backend API
```
- Frontend/Backend are publicly accessible (with auth)
- VPN adds extra security layer for agent connections

---

## 8. Agent / MCP Connectivity

### How the Agent System Works Today

1. The **MCP server** (`mcp-server/`) runs locally alongside Claude Desktop
2. It connects to the backend via `TODOLIST_API_URL` + `TODOLIST_AUTH_TOKEN`
3. The **in-app agent** (`backend/agent/`) uses SSE streaming at `/agent/stream`
4. The frontend proxies `/agent/stream` via Next.js rewrite to avoid CORS issues

### Self-Hosted Agent Connectivity

For self-hosted instances, the MCP server just needs to point to the correct backend:

```json
{
  "mcpServers": {
    "todolist": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "TODOLIST_API_URL": "https://your-backend.example.com",
        "TODOLIST_AUTH_TOKEN": "your_jwt_token"
      }
    }
  }
}
```

**For VPN setups:**
```json
{
  "TODOLIST_API_URL": "http://10.0.0.5:8141"
}
```

**For local Docker:**
```json
{
  "TODOLIST_API_URL": "http://localhost:8141"
}
```

### Agent Security for Self-Hosted

- The MCP server authenticates with a JWT token — same as any user session
- For multi-user self-hosted, each user generates their own agent token
- Agent traffic goes through the same HTTPS/VPN channel as the frontend
- The `OPENAI_API_KEY` on the backend means AI calls go directly from backend to OpenAI — the user's key, their billing

---

## 9. Data Ownership & Migration

### Export

The backend already has an `/export` endpoint that returns all user data. This should be enhanced to support:
- Full JSON export (todos, journals, categories, spaces, chat sessions)
- MongoDB `mongodump` for full database backup
- Scheduled automated backups

### Import / Migration

To move between instances (e.g., from local to cloud, or from hosted to self-hosted):

1. **Export** from source instance via API or `mongodump`
2. **Import** to target instance via `mongorestore` or a new `/import` endpoint
3. **Re-generate JWT_SECRET** on the new instance (invalidates old sessions)
4. **Update MCP server config** to point to new backend URL

### Future: Federation

Long-term, consider a sync protocol so users can:
- Run local + cloud instances that stay in sync
- Use the offline-first architecture as the foundation

---

## 10. Code Changes Required

### Phase 1: Dockerize (Priority: High)

| Change | File | Effort |
|--------|------|--------|
| Create backend Dockerfile | `backend/Dockerfile` | Small |
| Create frontend Dockerfile | `frontend/Dockerfile` | Small |
| Create docker-compose.yml | `docker-compose.yml` | Small |
| Create `.env.example` at root | `.env.example` | Small |
| Add `output: 'standalone'` option to next.config.js | `frontend/next.config.js` | Trivial |
| Add health check endpoint (if not present) | `backend/app.py` | Check existing |

### Phase 2: Railway Template (Priority: High)

| Change | File | Effort |
|--------|------|--------|
| Create Railway template config | `railway.toml` | Small |
| Add "Deploy on Railway" button to README | `README.md` | Trivial |
| Ensure `CORS_ORIGINS` is easily configurable | Already done via env var | None |

### Phase 3: Local Auth Mode (Priority: Medium)

| Change | File | Effort |
|--------|------|--------|
| Add `AUTH_MODE=local` option | `backend/auth.py` | Medium |
| Skip email verification in local mode | `backend/auth.py` | Medium |
| Auto-create default user in local mode | `backend/auth.py` | Small |
| Frontend: detect local mode, skip login | `frontend/` | Medium |

### Phase 4: Setup Wizard (Priority: Medium)

| Change | File | Effort |
|--------|------|--------|
| First-run setup page (set JWT, OpenAI key) | `frontend/pages/setup.tsx` | Medium |
| Backend endpoint to check if initialized | `backend/app.py` | Small |
| Generate JWT_SECRET automatically if not set | `backend/auth.py` | Small |

### Phase 5: Data Import/Export (Priority: Low)

| Change | File | Effort |
|--------|------|--------|
| Enhance `/export` to include all data types | `backend/app.py` | Medium |
| Add `/import` endpoint | `backend/app.py` | Medium |
| Migration CLI tool | `scripts/migrate.py` | Medium |

---

## 11. Phased Rollout Plan

### Phase 1: Docker + Docker Compose (Week 1-2)
- Create Dockerfiles for frontend and backend
- Create `docker-compose.yml` with MongoDB
- Create root-level `.env.example` with all variables documented
- Test full stack locally via Docker Compose
- Write quickstart guide in README

### Phase 2: Railway Template (Week 2-3)
- Create Railway template configuration
- Test one-click deployment
- Add "Deploy on Railway" button to README
- Document CORS and environment setup

### Phase 3: Published Docker Images (Week 3-4)
- Set up GitHub Actions to build and publish images to ghcr.io
- Tag images with versions
- Update docker-compose.yml to use published images (not local builds)
- Users can now `docker compose up` without cloning the repo

### Phase 4: Local Auth Mode (Week 4-5)
- Implement `AUTH_MODE=local` for single-user local deployments
- No email required — auto-login or simple password
- Makes local Docker setup frictionless

### Phase 5: Setup Wizard + Polish (Week 5-6)
- First-run setup page that guides through configuration
- Health check dashboard showing MongoDB connection, API key status
- Data export/import tools

### Phase 6: Hosted Tier (Future)
- Offer a managed version at `app.todolist.nyc`
- Same codebase, just pre-configured
- Pricing for compute + storage
- Users can always export and move to self-hosted

---

## Appendix A: Quick Reference — Which Option to Choose

| User Profile | Recommended Option | Effort | Monthly Cost |
|---|---|---|---|
| Developer, wants full control | Local Docker Compose | 10 min setup | $0 |
| Non-technical, wants own data | Railway Template | 2 min setup | ~$5-10/mo |
| Wants CDN + global performance | Vercel + Railway | 15 min setup | ~$5-10/mo |
| Has existing VPS | Docker Compose on VPS | 20 min setup | Existing infra |
| Maximum privacy | Local Docker + Tailscale VPN | 30 min setup | $0 |

## Appendix B: Network Ports

| Service | Port | Expose Publicly? |
|---------|------|------------------|
| Frontend (Next.js) | 3141 | Yes (or via reverse proxy on 443) |
| Backend (FastAPI) | 8141 | Only if frontend is on different host |
| MongoDB | 27017 | Never |

## Appendix C: Minimum System Requirements

- **CPU:** 1 core (2 recommended)
- **RAM:** 1 GB (2 GB recommended)
- **Disk:** 1 GB for app + MongoDB data growth
- **OS:** Any that runs Docker (Linux, macOS, Windows with WSL2)
- **Network:** Outbound HTTPS for OpenAI API calls
