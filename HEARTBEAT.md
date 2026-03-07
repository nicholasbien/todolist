# Todolist Heartbeat Checklist

## Agent Integration Tasks (Using CLI)

**Environment setup (once per session):**
```bash
export TODOLIST_API_URL=https://backend-production-e920.up.railway.app
export TODOLIST_AUTH_TOKEN=7WOHCYUYiv7Ta8KEVFYUM3ozk7hC-7j2CqWiHsuBFuM
export DEFAULT_SPACE_ID=69abce0e50a04398b2ab1709
```

**Check for pending work:**
```bash
cd /data/workspace/todolist/cli && node todolist-cli.js list-pending
```

**For each pending session:**
1. Claim it: `node todolist-cli.js claim-session <session_id> --agent-id marlin`
2. Read messages: `node todolist-cli.js get-session <session_id>`
3. Do the work (manage todos, answer questions, etc.)
4. Post response: `node todolist-cli.js post-message -s <id> -c "response"`

**If no pending messages, reply HEARTBEAT_OK**

## Available CLI Commands

- `list-pending` - Show sessions awaiting agent response
- `get-session <id>` - Read full conversation
- `post-message -s <id> -c <text>` - Post response
- `claim-session <id>` - Claim a session
- `release-session <id>` - Release claim
- `list-todos` - Show todos in default space
- `add-todo <text> [--category C] [--priority P]` - Add new todo
- `complete-todo <id>` - Mark todo complete
- `list-sessions` - List all sessions

## Portfolio Tasks (Periodic)

- Check if Poisson asked for portfolio update
- If yes: run `./portfolio.ts report` or `./portfolio.ts prices`
- Send HTML report to WhatsApp

## Maintenance

- Check for any system alerts or notifications
- Respond to user messages promptly
- Keep workspace organized
