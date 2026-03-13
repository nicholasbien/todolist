# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-13

### Added

- **Task management** with categories, priorities, due dates, and drag-and-drop reordering
- **Active/Completed tabs** with show-more pagination for task lists
- **Built-in AI assistant** (Claude-powered) with streaming chat, per-agent session persistence, and tool use
- **Journal / daily notes** with auto-save and offline support
- **Offline-first PWA** with IndexedDB queue, background sync, and service worker
- **Multi-space organization** for separating personal, work, and other contexts
- **Email summaries and reminders** via scheduled briefings
- **Activity feed** for tracking changes across spaces
- **Mobile app support** via Capacitor (iOS)
- **MCP server** for AI agent integration
- **Session-based chat** with substring search and text indexing
- **Security headers middleware** (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- **Rate limiting** on authentication endpoints (signup, login) to prevent abuse
- **Docker Compose** setup for self-hosting
- **Pre-commit hooks** with black, isort, flake8, autoflake, and mypy

### Security

- Email-based passwordless authentication with verification codes
- JWT session tokens with expiry and cleanup
- CORS restricted to configured origins
- Rate limiting on public auth endpoints (5 requests/minute per IP)
