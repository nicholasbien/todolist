# Todolist Vision

## What It Is

Todolist is an AI-native task management app built for people who want their tools to work as hard as they do. It combines a clean, offline-first PWA with an AI agent layer and a multi-agent architecture that lets external AI systems (Claude Code, OpenClaw, and others) manage tasks on your behalf.

The app lives at [todolist.nyc](https://app.todolist.nyc).

## Core Purpose

Most todo apps are passive containers. You put things in, you take things out. Todolist is different: it actively participates in your productivity. The AI agent classifies tasks, generates daily email summaries with real insight, and external agents can pick up work items, execute them, and report back through session-based conversations.

The goal is not to replace human judgment but to reduce the friction between deciding to do something and getting it done.

## Current Capabilities

### Task Management
- Create, categorize, and prioritize tasks with AI-powered auto-classification
- Subtask support with nested UI
- Due date tracking with natural language parsing
- Link support with automatic page title fetching
- Drag-and-drop reordering

### AI Agent
- Streaming AI assistant (GPT-5.2) with tool calling for task management, journals, and search
- Daily email summaries that blend structured data with reflective prose
- Customizable email instructions and scheduling per user

### Multi-Agent Architecture
- Session-based task conversations with `agent_id` routing
- External agents (Claude Code, OpenClaw) can claim, work on, and respond to tasks
- MCP server for programmatic access to all app features
- `needs_agent_response` / `has_unread_reply` flags for async workflows

### Collaboration
- Multi-user spaces with invite-by-email
- Space-specific categories and data isolation
- Shared workspaces for teams

### Offline-First PWA
- Full offline functionality via service worker and IndexedDB
- Background sync when connectivity returns
- Installable on mobile (iOS/Android) as a native-feeling app
- iOS Capacitor build for App Store distribution

### Journaling and Insights
- Daily journal entries per space
- Analytics and productivity insights
- Data export in JSON and CSV

## Design Philosophy

**1. AI as a first-class participant, not a bolt-on feature.**
The agent is not a chatbot sidebar. It has direct database access, executes tools, and can be the primary interface for power users who work through Claude Code or other AI systems.

**2. Offline-first, always.**
The app must work without a network connection. Every feature that touches the server has an offline fallback with queued sync. This is non-negotiable.

**3. Simple surface, deep capability.**
The UI should feel like a normal todo app. The multi-agent routing, MCP server, session trajectories, and AI classification all happen beneath the surface. Complexity is for the system, not the user.

**4. Open to external agents.**
The MCP server and session architecture are designed so that any agent system can integrate. Claude Code, OpenClaw, and future systems all use the same primitives: sessions, messages, and `agent_id` routing.

**5. Ship small, ship often.**
Features land in focused PRs. The codebase favors pragmatic solutions over architectural purity. If something works and is maintainable, it ships.

## Future Direction

### Near-Term
- **Voice input/output** for the AI assistant (Web Speech API and OpenAI TTS/STT)
- **Persistent conversation memory** so agent context survives backend restarts
- **Smarter task updates** via natural language ("mark the grocery task done") without needing exact IDs
- **Bulk operations** for power users (complete all in category, batch reschedule)
- **Markdown rendering** in agent responses for better readability

### Medium-Term
- **Task dependencies** with blocking/unblocking and dependency visualization
- **Smart scheduling** that learns from your completion patterns and suggests optimal timing
- **Cross-space intelligence** for comparing productivity across work and personal contexts
- **Multi-model routing** using lighter models for simple queries, heavier models for complex reasoning
- **Proactive notifications** that surface overdue or at-risk tasks without being asked

### Long-Term
- **Calendar integration** for due dates and time-blocked task scheduling
- **Team analytics** with shared productivity dashboards for collaborative spaces
- **Plugin architecture** so third-party tools can register as agents or data sources
- **Local-first sync** using CRDTs for true peer-to-peer collaboration without a central server

## What We Are Not Building

- A project management tool with Gantt charts and resource allocation
- A note-taking app that tries to replace Notion or Obsidian
- An enterprise platform with role-based access control and compliance features

Todolist is a personal and small-team productivity tool. It stays focused on tasks, journals, and the AI that connects them. Scope discipline is a feature.
