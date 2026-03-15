# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-15

### Added

- **Task management** with categories, priorities, due dates, and drag-and-drop reordering
- **Active/Completed tabs** with show-more pagination for task lists
- **Built-in AI assistant** with streaming chat, per-agent session persistence, and tool use
- **Proactive briefings** with morning summaries and stale task nudges
- **Journal / daily notes** with auto-save and offline support
- **Activity feed** showing a chronological timeline of all events
- **Multi-space organization** for separating personal, work, and other contexts
- **Offline-first PWA** with IndexedDB queue, background sync, and service worker
- **Email summaries and reminders** with configurable schedule, timezone, and per-space selection
- **Session-based chat** with substring search and text indexing
- **Mobile app support** via Capacitor (iOS)
- **MCP server** for AI agent integration
- **Docker Compose** setup for self-hosting
- **CI workflow** with backend lint/type-check and frontend type-check/build

### Security

- Email-based passwordless authentication with verification codes
- JWT session tokens with expiry and automatic cleanup
- CORS restricted to configured origins
- Rate limiting on authentication endpoints
- Security headers middleware (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- Pre-commit hooks with black, isort, flake8, autoflake, and mypy
