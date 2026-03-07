# Auto-Claim Session Architecture

## Purpose

The auto-claim system runs as a background worker that polls pending chat sessions, atomically claims one session at a time, routes the work to the correct handler, posts an assistant response, and releases the claim.

Implemented files:
- `scripts/auto-claim-sessions.js`
- `scripts/session-classifier.js`
- `scripts/subagent-spawner.js`

## Processing Flow

1. Poll `GET /agent/sessions/pending` (optionally filtered by `DEFAULT_SPACE_ID`)
2. Pick one eligible session (`unclaimed` or already claimed by this agent)
3. Claim session via `POST /agent/sessions/{id}/claim`
4. Load full session via `GET /agent/sessions/{id}`
5. Classify latest user request (`coding` vs `simple`)
6. Dispatch handler:
   - `coding` -> spawn `codex exec`
   - `simple` -> direct templated response
7. Post assistant message via `POST /agent/sessions/{id}/messages`
8. Release claim via `POST /agent/sessions/{id}/release`

The worker is strictly sequential: it processes at most one session per polling cycle.

## Classification Rules

`session-classifier.js` applies deterministic keyword matching.

Coding keywords:
- `bug`, `fix`, `implement`, `code`, `portfolio`, `calculation`, `deploy`

Simple keywords:
- `who`, `what`, `test`, `hello`, `question`

Tie-break and fallback behavior:
- More/equal coding matches -> `coding`
- More simple matches -> `simple`
- If no explicit keyword matches but code-like signals are present (file paths, file extensions, inline code, API terms) -> `coding`
- Otherwise -> `simple`

## Timeout, Retry, and Logging

### Timeout
- Default handler timeout: `300000ms` (5 minutes)
- Enforced when spawning `codex` for coding sessions

### Retry
- HTTP retries for transient failures (429/5xx/network timeout)
- Subagent retries for coding handler failures
- Exponential-style backoff between attempts

### Logging
- Structured timestamped logs
- Includes session id, classification, retry metadata, and error details

## Environment Variables

Required:
- `TODOLIST_AUTH_TOKEN`

Optional:
- `TODOLIST_API_URL` (default: `http://localhost:8000`)
- `DEFAULT_SPACE_ID` (limits polling scope)
- `AUTO_CLAIM_AGENT_ID` (default: `auto-claim-<hostname>-<pid>`)
- `AUTO_CLAIM_POLL_INTERVAL_MS` (default: `15000`)
- `AUTO_CLAIM_REQUEST_TIMEOUT_MS` (default: `30000`)
- `AUTO_CLAIM_REQUEST_RETRIES` (default: `2`)
- `AUTO_CLAIM_HANDLER_TIMEOUT_MS` (default: `300000`)
- `AUTO_CLAIM_HANDLER_RETRIES` (default: `2`)
- `AUTO_CLAIM_LOG_LEVEL` (`debug|info|warn|error`, default: `info`)

## Run

```bash
node scripts/auto-claim-sessions.js
```

Stop gracefully with `Ctrl+C` (`SIGINT`) or `SIGTERM`.

## Notes

- Posting an assistant message already clears `needs_agent_response` in backend logic; explicit release is still called for safety.
- If the coding handler fails after retries, the worker posts a fallback error response to the session.
