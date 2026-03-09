# OpenClaw Integration Setup Guide

Connect your TodoList app to [OpenClaw](https://openclaw.ai/) so an AI agent can manage your tasks, respond to chat sessions, and autonomously execute work you assign in the app.

## Prerequisites

- [OpenClaw](https://openclaw.ai/) installed and running (v2.4+ for autonomous mode)
- `curl` and `jq` available on your system
- A TodoList account at [app.todolist.nyc](https://app.todolist.nyc)

## Step 1: Install the Skill

Copy the skill into your OpenClaw workspace:

```bash
cp -r openclaw-skill ~/.openclaw/workspace/skills/todolist
```

Verify it's detected:

```bash
openclaw skills list
```

You should see `todolist` in the output.

## Step 2: Authenticate

Run the login script to get an auth token:

```bash
cd ~/.openclaw/workspace/skills/todolist
chmod +x scripts/login.sh
./scripts/login.sh
```

This will:
1. Ask for your email
2. Send a verification code
3. Return a JWT token on success

For testing, use `test@example.com` with code `000000`.

## Step 3: Set Environment Variables

Add these to your OpenClaw environment config (e.g., `~/.openclaw/env` or your shell profile):

```bash
export TODOLIST_API_URL="https://app.todolist.nyc"
export TODOLIST_AUTH_TOKEN="<token from step 2>"
```

OpenClaw will load these automatically when the skill is invoked.

## Step 4: Verify It Works

Start a chat with your OpenClaw agent and say:

> "Show me my todos"

The agent should call the TodoList API and list your tasks. If you get a 401 error, re-run the login script — your token may have expired.

## Usage Modes

### Manual Mode (Chat)

Talk to your agent naturally:

| What you say | What happens |
|---|---|
| "Show me my todos" | Lists all tasks |
| "Add a task: Buy groceries" | Creates a task (auto-categorized by AI) |
| "Complete the grocery task" | Marks it done |
| "What's in my journal today?" | Reads today's journal entry |
| "Write in my journal: Shipped the new feature" | Creates/updates today's entry |
| "How am I doing this week?" | Shows task insights and trends |
| "Check my pending sessions" | Reads and responds to messages you left on tasks |

### Autonomous Mode (Cron)

This is the powerful part — OpenClaw watches for tasks you assign in the app and executes them automatically.

**Important:** To avoid conflicts with the app's built-in AI agent, OpenClaw **only** handles tasks that contain `#openclaw` in the task text. All other tasks are left for the built-in agent. When OpenClaw replies, it claims the session with `agent_id=openclaw` so that followup messages route back to OpenClaw instead of the built-in agent.

#### Enable it

Tell your agent:

> "Watch my todolist for new tasks"

This creates a cron job that checks every 5 minutes:

```bash
openclaw cron add \
  --name "todolist-watcher" \
  --every "5m" \
  --session isolated \
  --message "Check for pending TodoList sessions and respond to them. Use the todolist skill. Follow the 'Responding to Pending Sessions' workflow: poll pending sessions with agent_id=openclaw, handle claimed followups directly, check unclaimed sessions for #openclaw in the todo text — only respond to those, skip all others. Always reply with agent_id=openclaw to claim sessions. If there are no pending sessions, do nothing."
```

#### How it works

```
┌─────────────────────────────────────────────────────┐
│                  TodoList App                        │
│                                                      │
│  1. You create a task: "Research React               │
│     frameworks #openclaw"                            │
│  2. You tap the task → opens a chat session          │
│  3. You write: "Compare Next.js, Remix, and Astro"  │
│                                                      │
│  ─── pending session created ───                     │
│                                                      │
│  4. OpenClaw cron fires (every 5 min)                │
│  5. Polls pending?agent_id=openclaw                  │
│  6. Checks todo text → has #openclaw → proceeds      │
│     (no #openclaw → skips, built-in agent handles)   │
│  7. Does the research                                │
│  8. Replies with agent_id=openclaw (claims session)  │
│  9. Followups route back to OpenClaw automatically   │
│                                                      │
│  9. You see a notification with the reply            │
└─────────────────────────────────────────────────────┘
```

Each cron cycle runs in an **isolated session** — it won't pollute your main OpenClaw chat context.

#### Customize the interval

```bash
# Check every 2 minutes
openclaw cron edit todolist-watcher --every "2m"

# Check every 15 minutes
openclaw cron edit todolist-watcher --every "15m"

# Check on a schedule (weekdays at 9am, noon, 5pm)
openclaw cron edit todolist-watcher --cron "0 9,12,17 * * 1-5" --tz "America/New_York"
```

#### Disable it

> "Stop watching my todolist"

Or manually:

```bash
openclaw cron remove todolist-watcher
```

#### Check cron status

```bash
openclaw cron list
openclaw cron runs todolist-watcher
```

## Architecture

```
TodoList App (app.todolist.nyc)
    │
    │  REST API (curl + Bearer token)
    │
    ├── /todos              — Task CRUD
    ├── /journals           — Daily journal entries
    ├── /insights           — Task analytics
    ├── /agent/sessions     — Chat sessions linked to tasks
    │   ├── /pending        — Sessions awaiting agent response
    │   └── /:id/messages   — Read/post messages
    └── /spaces             — Workspace management
         │
         ▼
OpenClaw Agent
    ├── Manual: responds to your chat messages
    └── Cron: polls /agent/sessions/pending?agent_id=openclaw
```

The key concept is **task-linked sessions**: every todo can have a chat thread attached. When you write a message on a task, it sets `needs_agent_response: true`. The agent picks it up (via cron or manual check), reads the conversation + task context, does the work, and replies with `agent_id=openclaw`. Posting a reply clears the pending flag and claims the session, so followup messages route back to OpenClaw.

## Troubleshooting

| Problem | Solution |
|---|---|
| 401 Unauthorized | Token expired. Re-run `scripts/login.sh` |
| Skill not found | Check `~/.openclaw/workspace/skills/todolist/SKILL.md` exists |
| Cron not firing | Run `openclaw cron list` to verify. Check OpenClaw Gateway is running |
| Agent doesn't respond to sessions | Verify `TODOLIST_AUTH_TOKEN` is set in the cron session's environment |
| Empty todo list | Confirm the correct `space_id` — you may have multiple spaces |

## Files

```
openclaw-skill/
├── SKILL.md              — Skill definition (API docs, workflows, prompts)
├── README.md             — Quick start overview
└── scripts/
    └── login.sh          — Interactive auth script
```
