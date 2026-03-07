# Playwright Offline E2E Runbook

This document describes how to run the Playwright offline sync tests against the real frontend and backend.

## Prerequisites

- Backend running on `http://localhost:8000`
- Frontend running on `http://localhost:3000`
- Playwright installed in `frontend` (`pnpm install` already done)

## Start Backend (Port 8000)

```bash
cd backend
source venv/bin/activate
ENV=development uvicorn app:app --reload --port 8000
```

## Build and Start Frontend (Production)

Build:

```bash
cd frontend
pnpm build
```

Start (force port 3000):

```bash
cd frontend
PORT=3000 pnpm start
```

Note: `pnpm start` may default to `8080`. If `8080` is occupied, you must set `PORT=3000`.

## Run Offline E2E Tests

```bash
cd frontend
pnpm exec playwright test tests/offline/e2e/offline-sync.spec.ts --reporter=line --workers=1
```

## Auth Flow Used by the Tests

The tests use the built-in test account flow:

1. API login with `test@example.com` / `000000`
2. Token injected into `localStorage` via `page.addInitScript`
3. Service worker auth message `SET_AUTH` sent via `MessageChannel`
4. Wait for `AUTH_READY` from the service worker

## Notes

- These tests run against the real backend and frontend (no mocks).
- If you see `EADDRINUSE` on startup, change the `PORT` or stop the process using that port.
