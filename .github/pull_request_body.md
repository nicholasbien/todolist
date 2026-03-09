## Summary

- Adds an OpenClaw skill that connects the AI agent to the TodoList app via REST API
- Supports both **manual mode** (chat-driven) and **autonomous mode** (cron-based polling)
- Includes a full setup guide at `docs/OPENCLAW_SETUP.md`

## What's Included

| File | Purpose |
|---|---|
| `openclaw-skill/SKILL.md` | Skill definition — API docs, workflows, and agent prompts |
| `openclaw-skill/README.md` | Quick start overview |
| `openclaw-skill/scripts/login.sh` | Interactive auth script (email + verification code) |
| `docs/OPENCLAW_SETUP.md` | Comprehensive setup guide with architecture diagram |
| `AGENTS.md` | Updated with OpenClaw integration instructions |

## How to Set Up

### 1. Install the skill

```bash
cp -r openclaw-skill ~/.openclaw/workspace/skills/todolist
```

### 2. Authenticate

```bash
cd ~/.openclaw/workspace/skills/todolist
chmod +x scripts/login.sh
./scripts/login.sh
```

For testing: `test@example.com` / code `000000`

### 3. Set environment variables

```bash
export TODOLIST_API_URL="https://app.todolist.nyc"
export TODOLIST_AUTH_TOKEN="<token from login>"
```

### 4. Verify

Tell your OpenClaw agent: *"Show me my todos"*

## Autonomous Mode (the cool part)

Tell your agent: *"Watch my todolist for new tasks"*

This creates a cron job that checks every 5 minutes for pending chat sessions on your tasks. The flow:

1. **You** create a task in the app → tap it → write what you want done
2. **OpenClaw** picks it up via cron, reads the conversation + linked task, does the work, replies
3. **You** get a notification with the result

Each cron cycle runs in an **isolated session** — no context pollution in your main chat.

### Under the hood

```bash
openclaw cron add \
  --name "todolist-watcher" \
  --every "5m" \
  --session isolated \
  --message "Check for pending TodoList sessions and respond to them..."
```

Disable with: *"Stop watching my todolist"* or `openclaw cron remove todolist-watcher`

## API Endpoints Used

| Endpoint | Purpose |
|---|---|
| `GET /spaces` | Get workspace ID |
| `GET/POST/PUT/DELETE /todos` | Task CRUD |
| `GET/POST /journals` | Journal entries |
| `GET /insights` | Task analytics |
| `GET /agent/sessions/pending` | Find sessions needing a response |
| `GET /agent/sessions/:id` | Read conversation + linked todo |
| `POST /agent/sessions/:id/messages` | Reply to a session |
| `POST /agent/sessions` | Create a session linked to a task |

## Test plan

- [ ] Install skill to OpenClaw workspace and verify `openclaw skills list` shows it
- [ ] Run `login.sh` and get a valid token
- [ ] Set env vars and ask agent "Show me my todos" — should list tasks
- [ ] Add a task via agent — confirm it appears in the app with auto-categorization
- [ ] Create a task in the app, open its chat, write a message, then ask agent "check my pending sessions" — should read and reply
- [ ] Enable autonomous mode ("Watch my todolist") — verify cron job is created with `openclaw cron list`
- [ ] Wait for cron cycle — verify it picks up a pending session and replies
- [ ] Disable autonomous mode — verify cron job is removed

https://claude.ai/code/session_018vGFWCGCT5iR9mmhezSbwf
