# Vision: The Full Potential of the todolist App

## 1. The Core Insight: This Isn't a Todo App

What we've built isn't a task manager — it's the skeleton of a **personal operating system with an agent bus**.

The architecture already in place tells the story:

- **Sessions** are conversation threads between a user and any number of agents.
- **Agent routing** means the system decides which agent handles a message based on context, not a hardcoded mapping.
- **Spaces** are isolated environments with their own todos, journals, and agent memory.
- **Offline-first sync** means the entire system works without a network, with conflict resolution built in.
- **MCP (Model Context Protocol)** tools give agents structured access to every capability in the system.

A todo app is the *first* workload running on this platform. It is not the platform itself. The platform is an agent-native, offline-capable, personal AI operating system — and every feature we've built is a building block toward that.

---

## 2. Agent Marketplace Built on the Routing Architecture

The agent dropdown and routing system (`is_followup`, `agent_id` claims, pending session enrichment) is not just a UI feature — it's the foundation for an **agent marketplace**.

### What This Enables

- **Third-party agents** can register themselves and declare capabilities (e.g., "I handle calendar scheduling," "I do code review," "I manage grocery lists").
- **Automatic routing** can match user intent to the best agent, not just the last one that spoke.
- **Agent composition** — one agent can delegate subtasks to another, using sessions as the communication channel.
- **Per-space agent configuration** — a "Work" space might have Jira and Slack agents, while a "Home" space has a meal-planning agent and a home-automation agent.

### Actionable Next Steps

- Define an agent manifest schema (name, capabilities, MCP tools it exposes, routing keywords).
- Build an agent registry API that allows registration and discovery.
- Add a marketplace UI where users browse, install, and configure agents per space.

---

## 3. Journal as a Reasoning Layer, Not Just a Diary

The journal component already supports auto-save, offline sync, and per-space isolation. But its real potential is as a **structured reasoning layer** for both users and agents.

### What This Enables

- **Agent-generated insights** — after a week of journal entries, an agent can surface patterns: "You mentioned feeling tired on days you skipped your morning routine."
- **Decision logs** — when an agent takes an action, it writes a journal entry explaining its reasoning. This creates an auditable trail.
- **Linked references** — journal entries can reference todos, sessions, or other entries, creating a knowledge graph.
- **Templates and prompts** — structured journal types (daily review, weekly planning, retrospective) that agents can both generate and consume.

### Actionable Next Steps

- Add metadata fields to journal entries (mood, energy, tags, linked entity IDs).
- Build a journal analysis pipeline that agents can invoke via MCP tools.
- Create a "weekly review" agent that reads journals and todos to generate a summary.

---

## 4. Spaces as Team Workspaces with Shared Agent Memory

Spaces currently isolate todos and journals per user. The natural evolution is **shared spaces** with collaborative agent memory.

### What This Enables

- **Team task management** — multiple users in a space, with agents that understand the full team context.
- **Shared agent memory** — an agent in a team space remembers decisions made by any team member, not just the one talking to it.
- **Role-based access** — admins, contributors, and viewers within a space, with agents respecting permissions.
- **Cross-space intelligence** — an agent can notice that a task in your "Work" space is blocked by something in your "Home" space and suggest reprioritization.

### Actionable Next Steps

- Add a `members` array to the space model with roles and permissions.
- Implement shared session visibility within a space.
- Build agent memory that scopes to a space, not just a user.

---

## 5. Offline-First as a Competitive Moat

The offline-first architecture (IndexedDB queue, FIFO sync, ID mapping, space-specific pending checks) is not just a reliability feature — it's a **competitive moat** that enables capabilities no cloud-only app can match.

### What This Enables

- **Local LLM execution** — when offline, a local model (via Ollama, llama.cpp, or similar) can handle agent requests. The user never loses AI capability, even on a plane.
- **Privacy-first mode** — sensitive spaces can be configured to never sync to the cloud, with all agent processing happening on-device.
- **Edge computing** — the service worker becomes a local agent runtime, processing tasks and syncing results when connectivity returns.
- **Zero-latency interactions** — local-first means the UI never waits for a network round trip. Agent responses from local models feel instant.

### Actionable Next Steps

- Integrate a WebAssembly-based local LLM runtime into the service worker.
- Add a per-space "privacy mode" that restricts sync and forces local processing.
- Build a model manager UI for downloading and configuring local models.

---

## 6. Task Decomposition and Autonomous Execution

The current todo model is flat: a list of items with completion status. The next evolution is **recursive task decomposition with autonomous execution**.

### What This Enables

- **Subtask DAGs** — a todo like "Plan birthday party" decomposes into a directed acyclic graph: venue research, guest list, invitations, catering, decorations — each with their own subtasks.
- **Agent-driven decomposition** — the user states a goal; the agent breaks it into actionable subtasks, estimates effort, and identifies dependencies.
- **Autonomous execution** — for tasks that are fully automatable (e.g., "send reminder emails," "book the restaurant"), the agent executes them directly, posting updates to the session.
- **Progress tracking** — the DAG structure enables real progress bars, critical path analysis, and bottleneck identification.

### Actionable Next Steps

- Add `parent_id` and `depends_on` fields to the todo model.
- Build a tree/graph view for complex tasks.
- Implement an agent workflow that decomposes a high-level goal into subtasks and begins executing automatable ones.

---

## 7. Proactive Agent That Initiates, Not Just Responds

Today, agents only act when a user sends a message. A proactive agent **initiates conversations** based on context.

### What This Enables

- **Morning briefings** — "You have 3 tasks due today. Yesterday you journaled about feeling overwhelmed — want me to reprioritize?"
- **Deadline warnings** — "Your tax filing is due in 3 days and you haven't started the 'gather documents' subtask."
- **Pattern interrupts** — "You've been adding tasks without completing any for the last week. Want to do a review?"
- **Opportunity detection** — "You mentioned wanting to learn Rust. I found a free workshop this Saturday."

### Actionable Next Steps

- Build a scheduled agent runner (cron-like) that evaluates triggers and creates sessions when conditions are met.
- Define a trigger schema (time-based, event-based, pattern-based).
- Add notification preferences so users control how and when proactive agents reach out.

---

## 8. The "Life API" — External Integrations via MCP

MCP tools already give agents access to the todolist system. The next step is **exposing external services** as MCP tools, creating a "Life API."

### What This Enables

- **Calendar integration** — "Schedule a meeting with Sarah next Tuesday" creates a calendar event and a linked todo.
- **Email triage** — an agent reads your inbox, creates todos for action items, and drafts replies.
- **Smart home** — "Turn off the lights when I complete my last task for the day."
- **Finance tracking** — "I spent $45 on groceries" logs to a finance tracker and updates the budget space.
- **Health data** — sleep, exercise, and nutrition data feed into journal insights.

### Actionable Next Steps

- Build an MCP tool registry that supports external tool providers.
- Create OAuth-based integrations for Google Calendar, Gmail, and Slack as proof of concept.
- Design a "connected accounts" UI for managing integrations.

---

## 9. Quantified Self Dashboard

With journals, todos, sessions, and (eventually) external data, the app has a rich dataset about the user's life. A **quantified self dashboard** surfaces this data visually.

### What This Enables

- **Productivity analytics** — tasks completed per day/week, average completion time, most productive hours.
- **Mood and energy tracking** — from journal entries and explicit check-ins, visualized over time.
- **Goal progress** — long-term goals broken into milestones with trend lines.
- **Agent effectiveness** — which agents are most helpful, how often their suggestions are accepted, time saved.
- **Correlation discovery** — "You complete 40% more tasks on days you journal in the morning."

### Actionable Next Steps

- Build an analytics API that aggregates data across todos, journals, and sessions.
- Create a dashboard page with configurable widgets.
- Implement an insights agent that periodically generates observations from the data.

---

## 10. The Big Picture

Zoom all the way out and here's what we're building:

> **A personal AI operating system where agents are first-class citizens, data stays under user control, and the system works everywhere — online, offline, and everywhere in between.**

The todolist is the first app. The journal is the second. But the platform supports any structured workflow:

- **Project management** with Kanban boards and sprint planning.
- **CRM** for freelancers managing client relationships.
- **Learning management** with spaced repetition and progress tracking.
- **Writing assistant** with drafts, revisions, and publishing workflows.

Each of these is a **space template** with pre-configured agents, journal templates, and task structures. The marketplace sells these templates alongside the agents that power them.

The offline-first architecture means this system works on a laptop in a cabin, on a phone on the subway, and on a desktop at the office — with seamless sync when connectivity exists and full capability when it doesn't.

The agent bus means new capabilities can be added without changing the core platform. An agent is just a participant in a session that has access to MCP tools. Anyone can build one.

**This is the vision: not a todo app, but a personal operating system — agent-native, offline-capable, and extensible by design.**
