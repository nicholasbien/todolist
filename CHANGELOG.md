# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-13

### Added

- **Task management** with categories, priorities, due dates, and drag-and-drop reordering
- **Active/Completed tabs** with show-more pagination for task lists
- **Recurring tasks** supporting daily, weekly, and monthly repeats
- **Built-in AI assistant** with streaming chat, per-agent session persistence, and tool use
- **Agent memory system** for persistent per-space context across conversations
- **Proactive briefings** with morning summaries and stale task nudges
- **Journal / daily notes** with auto-save and offline support
- **Activity feed** showing a chronological timeline of all events
- **Multi-space organization** for separating personal, work, and other contexts
- **Offline-first PWA** with IndexedDB queue, background sync, and service worker
- **Email summaries and reminders** with configurable schedule, timezone, and per-space selection
- **Session-based chat** with substring search and text indexing
- **Mobile app support** via Capacitor (iOS)
- **MCP server** for AI agent integration
- **Rate limiting** on all authentication endpoints (signup, login, logout, session verify, account delete)
- **Security headers middleware** (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- **Docker Compose** setup for self-hosting
- **Pre-commit hooks** with black, isort, flake8, autoflake, and mypy
- **CI workflow** with backend lint and frontend type-check

### Security

- Email-based passwordless authentication with verification codes
- JWT session tokens with expiry and automatic cleanup
- CORS restricted to configured origins
- Rate limiting on all auth endpoints: signup (3/min), login (5/min), logout (10/min), session verify (30/min), update name (10/min), account delete (3/min)
