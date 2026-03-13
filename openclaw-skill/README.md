# todolist OpenClaw Skill

An [OpenClaw](https://openclaw.ai/) skill that lets your AI agent manage your todos, journal, and chat sessions through the todolist app.

## Quick Install

Copy the skill to your OpenClaw workspace:

```bash
cp -r openclaw-skill ~/.openclaw/workspace/skills/todolist
```

## Setup

1. **Get an auth token** by running the login script:

```bash
cd ~/.openclaw/workspace/skills/todolist
chmod +x scripts/login.sh
./scripts/login.sh
```

2. **Set environment variables** in your OpenClaw config or shell:

```bash
export TODOLIST_API_URL="http://localhost:8141"
export TODOLIST_AUTH_TOKEN="your_token_here"
```

For the test account, set `ALLOW_TEST_ACCOUNT=true`, `TEST_EMAIL=test@example.com`, `TEST_CODE=000000` in your backend `.env`, then use `test@example.com` with code `000000`.

## Usage

Once installed, just talk to your OpenClaw agent naturally:

- "Show me my todos"
- "Add a task: Buy groceries"
- "What's in my journal for today?"
- "Write in my journal: Had a productive day working on the API"
- "How am I doing on my tasks this week?"
- "Export my todos as CSV"

## What It Can Do

- **Todos**: Add, list, update, complete, delete, and reorder tasks
- **Journals**: Read and write daily journal entries
- **Insights**: Get analytics on your task completion and trends
- **Sessions**: Create and manage chat sessions linked to tasks
- **Spaces**: Work across multiple collaborative spaces
- **Export**: Export your data as JSON or CSV

## Autonomous Mode

You can tell OpenClaw to automatically watch for tasks you assign in the app:

- "Watch my todolist for new tasks" — sets up a cron job that checks every 5 minutes
- "Stop watching my todolist" — removes the cron job

### How it works

1. You create a task in the todolist app and select "OpenClaw" from the agent dropdown (e.g., "Research the best React testing libraries")
2. You tap on it to open a chat session and write what you want done
3. OpenClaw's cron job picks up the pending session (routed via `agent_id=openclaw`), does the work, and replies
4. You see the reply in the app with a notification

Tasks assigned to other agents are left for those agents — no double replies.

Each cron cycle runs in an isolated session so it doesn't clutter your main chat.

## How It Works

The skill teaches your OpenClaw agent to call the todolist REST API via `curl`. The app's backend auto-classifies tasks into categories and priorities using AI, so you just need to describe what you want to do.
