HEARTBEAT.md

Goal: handle todolist items routed to `agent_id=openclaw` reliably, with low-noise heartbeat replies.

Scope (strict)
- Use `agent_id=openclaw` routing as the source of truth for actionable sessions.
- Ignore unrelated tasks unless explicitly instructed elsewhere.

Heartbeat runbook (every heartbeat)
1) Runtime sanity check (fast)
- Run `process list`.
- Optional if needed: `ps aux | grep -E "(codex|claude)" | grep -v grep || true`.
- Check subagents via `sessions_list` with `kinds: ["subagent"]`.
- If an urgent runtime fault exists (crash loop, wedged/stuck worker, repeated failures), send a short alert instead of normal quiet output.

2) Pull actionable todolist work
- Query todolist pending sessions using the agent route with explicit agent filter:
  - `GET /agent/sessions/pending?agent_id=openclaw`
- Backend returns sessions claimed by openclaw plus unclaimed sessions.

3) Triage each item into exactly one state
- `PENDING`: no work started yet.
- `IN_PROGRESS`: work has started but final deliverable not ready.
- `DONE_NEEDS_POSTBACK`: deliverable complete but not posted back yet.
- `DONE_POSTED`: final result already posted in the todolist session/thread.

4) Required action by state
- `PENDING`:
  - Start or delegate work.
  - Post a brief “started/in progress” update in the associated todolist session/thread.
  - Ensure item is no longer ambiguous as untouched pending.
- `IN_PROGRESS`:
  - Continue/monitor existing execution; do not restart duplicate work.
  - Post only meaningful progress updates (milestones/blockers), not heartbeat chatter.
- `DONE_NEEDS_POSTBACK`:
  - Post final result in the associated todolist session/thread (concise outcome + key artifact links/IDs).
  - Mark/respond so the item is no longer pending.
- `DONE_POSTED`:
  - No further posting.

5) Completion + postback requirements (mandatory)
- Completion is not done until BOTH are true:
  1. Deliverable is actually complete.
  2. Final result is posted back to the correct todolist session/thread.
- If (1) is true and (2) is false, treat as `DONE_NEEDS_POSTBACK` and post immediately.

6) Noise minimization rules
- No duplicate updates with the same information.
- No “still working” pings unless there is a blocker, ETA change, or milestone.
- If there are no actionable items and no urgent runtime fault, do nothing extra.

Heartbeat response rule
- Default reply exactly: `HEARTBEAT_OK`
- Only deviate for urgent runtime alerts.
