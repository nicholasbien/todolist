# Test and QA Fix Plan

Tracked on: 2026-02-16

## 1. Weather and External API Determinism
- [ ] Replace live OpenWeather assertions with mocked responses or relaxed comparisons (location names/temps).
- [ ] Add fixtures for book recommendations and inspirational quotes so tests don't depend on network or remote data.

## 2. Task Schema Updates
- [ ] Update `TaskAddRequest` usage in tests to include required `category` and any new fields.
- [ ] Revisit validation tests (error handling, schema validation, due date fallbacks) to align with sanitized text flow.

## 3. Agent Streaming + MCP Lifecycle
- [ ] Fix async teardown (`Event loop is closed`) by isolating MCP client per test or adding proper cleanup hooks.
- [ ] Ensure streaming tests emit the minimum number of SSE messages (ready → chunk(s) → done) even under mocks.

## 4. Health & Account Deletion Endpoints
- [ ] Make `/health` resilient—return 200 even if optional downstream services fail.
- [ ] Journal deletion path: guard against event loop closure during cleanup so account deletion tests reach 200.

## 5. Classification & Due-Date Logic
- [ ] Mock OpenAI responses (or add deterministic fixtures) so timing/priority/due-date expectations stop flaking.
- [ ] Reconcile manual date parsing expectations with the current sanitizer (e.g., keep text scrubbed, weekday math).

## 6. Email Chat Filter Test Harness
- [ ] Provide a stub for `answer_question` (or expose the new helper) so monkeypatching works again.

## 7. Frontend Vulnerability + Peer Dependency Cleanup
- [ ] Resolve `react-event-listener` peer warning (replace package or pin React 18-compatible fork).
- [ ] Run `npm audit fix` (and document any remaining high/critical issues) once dependencies are aligned.

## 8. Full Web UI Testing Enablement
- [ ] Provide a controllable browser surface (OpenClaw Browser Relay, Playwright, or remote Chrome) for manual/system tests.
- [ ] Document auth/seed steps so UI smoke tests can be scripted end-to-end.
