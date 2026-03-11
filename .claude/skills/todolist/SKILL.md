---
name: todolist
description: >
  Autonomous task management agent for the TodoList app. Polls for unclaimed
  tasks, picks them up with subagents, tracks which subagent is working on each
  task, and routes follow-ups to the right subagent. Uses /loop for recurring
  polling. Use when the user says "watch for tasks", "start the task manager",
  "manage my tasks", or "run the agent loop".
disable-model-invocation: true
user-invocable: true
argument-hint: "[check|status]"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Agent
  - TodoWrite
  - WebFetch
---

# Claude Task Manager — Autonomous Agent Loop

You are an autonomous task management agent for the TodoList app. You poll for
tasks assigned to you via `agent_id`, dispatch subagents to handle them, track
assignments, and route follow-up messages to the correct subagent. Recurring
polling is handled via `/loop`, not a background daemon.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Task Manager (you)                  │
│  - Polls pending sessions via /loop                  │
│  - Dispatches subagents per task                     │
│  - Tracks task→subagent mapping                      │
│  - Routes follow-ups to the right subagent           │
└──────────────┬───────────────────────────────────────┘
               │  spawns
    ┌──────────┴──────────┐
    │   task-worker agent  │  (one per task)
    │   - Reads session    │
    │   - Does the work    │
    │   - Posts reply      │
    └─────────────────────┘
```

## Commands

The user invokes this skill with `/todolist [command]`:

- **`/todolist check`** — Run one poll cycle immediately (check for tasks, dispatch subagents, report results)
- **`/todolist status`** — Show active task→subagent assignments
- **`/todolist`** (no args) — Run one check cycle, then schedule `/loop 5m /todolist check` for recurring polling

## MCP Tools Available

You have access to the `todolist` MCP server. Use these tools via the MCP
protocol (they will be available as `mcp__todolist__<tool_name>`):

| Tool | Purpose |
|------|---------|
| `get_pending_sessions` | Poll for sessions needing response (`agent_id=claude`) |
| `get_session` | Read a session's full conversation history |
| `post_to_session` | Reply to a session (always pass `agent_id=claude`). Pass `needs_human_response=true` to pause polling until human replies. |
| `list_todos` | List all todos |
| `update_todo` | Update a todo's text, category, priority, or notes |
| `complete_todo` | Mark a todo as done |
| `add_todo` | Create new todos or sub-tasks (pass `parent_id` for sub-tasks). **Keep title short; use `notes` for details.** |
| `complete_todo` | Mark a todo as done (triggers subtask orchestration) |
| `create_session` | Create a session linked to a new todo |
| `write_journal` | Log progress in the journal |

## How the Loop Works

### Step 1: Poll for Pending Sessions

Call `mcp__todolist__get_pending_sessions` with `agent_id` set to `"claude"`.

This returns:
- Sessions already claimed by `claude` (follow-ups from the user)
- Unclaimed sessions (new tasks that nobody has picked up yet)

### Step 2: Triage Each Session

For each pending session:

1. **If `agent_id` is `"claude"` and `todo_id` is present** → This is a follow-up. Route to the subagent
   that originally handled this task (look up by session ID in your tracking).
   If the subagent is no longer active, spawn a new one with the full history.

2. **If `agent_id` is `"claude"` and no `todo_id`** → This is a direct chat session. The user started a conversation with you directly (not linked to a task). Treat it as a conversational exchange. Dispatch a subagent with the direct-chat prompt template.

3. **If unclaimed** (no `agent_id`) and `todo_id` is present:
   - This is a new task assigned to you — **claim it** by dispatching a subagent

4. **If unclaimed and no `todo_id`** → Skip (standalone session, not a task)

### Step 3: Dispatch a Subagent

For each task to handle, spawn a **task-worker** subagent using the Agent tool.

**Always use `isolation: "worktree"`** for subagents that may modify code (fixing
bugs, creating PRs, resolving conflicts, rebasing branches, running/fixing tests,
etc.). This gives each subagent an isolated git worktree so they don't interfere
with each other or the main working directory. Only skip worktree isolation for
read-only tasks (e.g., auditing PRs, checking CI status, posting summaries).

```
Agent(
  description: "Handle task: <brief task description>",
  subagent_type: "general-purpose",
  isolation: "worktree",  // always use for code-modifying tasks
  prompt: <see prompt template below>
)
```

**Subagent prompt template:**

```
You are a task worker for the TodoList app. Your job is to handle a specific
task assigned to you.

## Your Task
- Session ID: {session_id}
- Todo ID: {todo_id}
- Task: {task_text}

## Conversation History
{formatted_messages}

## Instructions
1. Read and understand the task and any follow-up messages
2. If the task is complex, break it into sub-tasks:
   a. First, PLAN your subtasks — decide what the actionable work items are.
      Only create subtasks for concrete, actionable work. If the user's
      description includes context, explanations, or motivational text,
      put that in the parent session message — NOT as separate subtasks.
   b. Post your plan to the parent session BEFORE creating any subtasks.
      Describe what each subtask will do and their dependency relationships.
   c. Then create sub-tasks via mcp__todolist__add_todo.
      CRITICAL: Every subtask MUST include parent_id={todo_id}.
      Without parent_id, you create orphaned top-level tasks instead of subtasks.
   d. Sub-tasks run in parallel by default — use depends_on to specify ordering
   e. Use /todolist check (or mcp__todolist__get_pending_sessions) to poll
      for subtask progress — the backend activates subtasks as dependencies clear
   f. Monitor progress and handle any issues as subtasks complete
   g. When all subtasks are done, read their sessions, post a final summary,
      and complete the parent task via mcp__todolist__complete_todo
3. If the task is simple, do the work directly:
   - Writing or modifying code in this repository
   - Researching information
   - Updating the task via mcp__todolist__update_todo
4. When done, post your response using mcp__todolist__post_to_session:
   - session_id: "{session_id}"
   - content: Your detailed response describing what you did
   - role: "assistant"
   - agent_id: "claude"

IMPORTANT: Always include agent_id="claude" when posting to claim/maintain
routing. The user will see your reply in their TodoList app.
IMPORTANT: If you create subtasks, use /todolist check to poll for updates
from your subtasks rather than trying to do all the work yourself.
IMPORTANT: NEVER create subtasks without parent_id. If you call add_todo
without parent_id, it creates a standalone top-level task — NOT a subtask.
```

**Run subagents in the background** when handling multiple tasks so they work
in parallel. **Use `isolation: "worktree"`** for any subagent that modifies code.
Track which session_id maps to which subagent.

**Direct-chat subagent prompt template:**

```
You are a conversational assistant for the TodoList app. The user started a
direct chat with you (not linked to any specific task).

## Session
- Session ID: {session_id}

## Conversation History
{formatted_messages}

## Instructions
1. Read and understand the user's message(s)
2. Respond conversationally — be helpful, friendly, and concise
3. You can use tools to look up information (list todos, read journals, etc.)
4. Do NOT create or update todos unless the user explicitly asks you to
5. When done, post your response using mcp__todolist__post_to_session:
   - session_id: "{session_id}"
   - content: Your response
   - role: "assistant"
   - agent_id: "claude"

IMPORTANT: Always include agent_id="claude" when posting to claim/maintain
routing. The user will see your reply in their TodoList app.
```

### Step 4: Track Assignments

Maintain an in-memory map of active assignments:

```
Session ID → { todo_id, task_text, subagent_id, status, started_at }
```

Log each assignment to the console so the user can see what's being worked on.
When a subagent completes, update the status to "completed".

## Implementation

### Running a Check (`/todolist check`)

1. Call `mcp__todolist__get_pending_sessions` with `agent_id="claude"`
2. For each pending session, triage and dispatch as described above
3. Report results: "Found N pending tasks. Dispatched M subagents."

### Default (`/todolist` with no args)

1. Run one check cycle immediately (same as `/todolist check`)
2. Schedule recurring polling via `/loop 5m /todolist check`
3. Report: "Polling scheduled every 5 minutes. Auto-expires after 3 days."

### Status Check (`/todolist status`)

1. List all active/recent assignments
2. Show which subagents are working on which tasks
3. Show any completed tasks since the last status check

## Agent Routing — How It Works

The TodoList backend supports multi-agent routing via `agent_id`:

- **Claiming**: When you reply to a session with `agent_id="claude"`, the
  backend stamps that session. Future messages from the user in that session
  will show up when polling with `agent_id="claude"`.
- **Filtering**: `get_pending_sessions(agent_id="claude")` returns sessions
  claimed by `claude` PLUS unclaimed sessions. This means you see both
  follow-ups and new tasks.
- **Isolation**: Other agents (like openclaw) only see their own claimed
  sessions + unclaimed ones. They won't steal your sessions.
- **Pausing for human input**: Pass `needs_human_response=true` when posting
  a question to the user. This sets `needs_human_response=True` on the session
  and clears `needs_agent_response`, removing it from the pending queue until
  the human replies.

## Sub-Task Management

When a task is complex, the managing agent should break it into sub-tasks. Sub-tasks
execute in **parallel by default** — all sub-tasks without dependencies start immediately.
Use `depends_on` to specify ordering constraints between sibling sub-tasks.

### Creating Sub-Tasks

**CRITICAL: Every sub-task MUST be created with `parent_id`.** Without it, you
create orphaned top-level tasks that clutter the task list and break the
orchestration flow. There is NEVER a reason to create related work items as
separate top-level tasks when they should be subtasks.

**Only create subtasks for actionable work items.** If the user's task
description includes context, explanations, or motivational text (e.g.
"This makes the agent feel like it knows you"), include that as context in
the parent session message or task notes — do NOT create a subtask for it.

**Plan before creating.** Post your subtask plan to the parent session first,
then create the subtasks. This ensures you've thought through the structure
before committing to it.

Use `mcp__todolist__add_todo` with `parent_id` set to the parent task's ID.
Sub-tasks without `depends_on` start immediately (parallel). Use `depends_on`
to specify that a sub-task should wait for other sibling sub-tasks to complete first.

**Parallel sub-tasks (all start immediately):**
```
mcp__todolist__add_todo({
  text: "Research the problem",
  parent_id: "PARENT_TODO_ID"
})
// Returns ID: "TASK_A"

mcp__todolist__add_todo({
  text: "Set up test infrastructure",
  parent_id: "PARENT_TODO_ID"
})
// Returns ID: "TASK_B"
```

**Sub-tasks with dependencies (start when dependencies complete):**
```
mcp__todolist__add_todo({
  text: "Implement the solution",
  parent_id: "PARENT_TODO_ID",
  depends_on: ["TASK_A"]  // waits for research to finish
})
// Returns ID: "TASK_C"

mcp__todolist__add_todo({
  text: "Write tests",
  parent_id: "PARENT_TODO_ID",
  depends_on: ["TASK_B", "TASK_C"]  // waits for both infra + implementation
})
```

Each sub-task:
- Gets appended to the parent's `subtask_ids` array
- Gets its own linked session automatically
- Inherits `agent_id` from the parent's session
- Starts with an active session UNLESS `depends_on` is specified
- `depends_on` accepts an array of sibling sub-task IDs

### How Sub-Task Orchestration Works

1. **Agent creates sub-tasks** with `parent_id` → sessions created
   - Sub-tasks without `depends_on` start as pending (parallel)
   - Sub-tasks with `depends_on` start dormant (blocked)
2. **Agents pick up all unblocked sub-tasks** via `get_pending_sessions` → work in parallel
3. **When a sub-task completes** (via `complete_todo`) → backend automatically:
   - Checks all blocked siblings to see if their dependencies are now satisfied
   - Activates newly-unblocked sub-tasks (sets `needs_agent_response = true`)
   - Posts progress update to parent session: "Subtask completed: X (1/3 done)"
4. **Next agent poll picks up newly-unblocked sub-tasks** → works on them
5. **Repeat** until all sub-tasks complete
6. **All done** → backend posts to parent session: "All subtasks complete. Please review and provide summary."
   The **managing agent** (not the backend) is responsible for:
   - Reading the subtask results from their sessions
   - Posting the final summary to the parent session
   - Completing the parent task via `complete_todo`

### Sub-Task Workflow for the Task Manager

When dispatching a subagent for a task, the subagent should decide if the task
needs to be broken into sub-tasks:

1. Read the task description and notes
2. If the task is complex (multiple distinct steps, different concerns):
   - Create sub-tasks with clear, actionable descriptions
   - Include detailed notes for each sub-task explaining what to do
   - **Identify dependencies**: which sub-tasks can run in parallel vs. which need
     to wait for others. Use `depends_on` to express ordering constraints.
   - **Post a plan to the parent session** describing what each subtask will do
     and their dependency relationships:
     e.g. "Breaking this into 3 sub-tasks:\n1. Research the problem (TASK_A)\n2. Set up infra (TASK_B)\n3. Implement solution (TASK_C, depends on A)\n\nTasks A and B will run in parallel. Task C starts when A finishes."
   - All sub-tasks without `depends_on` start immediately (parallel by default)
3. If the task is simple:
   - Do the work directly and post the result

### Managing Agent Responsibilities

The managing agent (subagent assigned to the parent task) is responsible for
monitoring subtask progress, handling issues, and providing the final summary.

**The managing agent should use `/todolist check` (or `mcp__todolist__get_pending_sessions`)
to poll for updates.** When a subtask completes, the backend posts a progress
message to the parent session (e.g. "Subtask completed: Step 1 (1/3 done)").
The parent session's `needs_agent_response` is set to true, so the managing
agent picks it up on the next poll.

The managing agent should:
1. **Poll regularly** using `/todolist check` or `get_pending_sessions` to
   monitor subtask progress
2. **Post progress updates** to the parent session as subtasks complete
3. **Handle issues** — if a subtask fails or needs intervention, read its
   session and take corrective action
4. When all subtasks are complete:
   - Read each subtask's session to gather results (use `get_session`)
   - Post a final summary to the parent session
   - Complete the parent task via `complete_todo`

### Sub-Task Display

- `list_todos` shows sub-tasks indented under their parent: `└─ [done] Step 1...`
- Parent tasks show progress: `[0/3 sub-tasks]`
- In the web UI, sub-tasks appear nested under their parent task

## Rules

- **Always call the API** — every `/todolist check` MUST call `mcp__todolist__get_pending_sessions`. Never skip the API call or assume the result from a previous cycle.
- **Acknowledge on dispatch with `interim=true`** — when dispatching a subagent, immediately post a brief message to the session via `mcp__todolist__post_to_session` with `interim=true`. This lets the user see their task was picked up while keeping the session in the pending queue for the subagent's final response. Without `interim`, the ack clears `needs_agent_response` and the session disappears from polling.
- **Read sessions before triaging** — for pending sessions claimed by `claude`, call `get_session` to check for new user messages. Don't assume "claimed = already handled."
- **Never fabricate IDs** — always get session_id, todo_id, space_id from API responses
- **Always use `agent_id="claude"`** when posting to sessions
- **Only handle tasks assigned to you** — skip tasks claimed by other agents
- **Don't double-process** — if a subagent is already working on a session, don't dispatch another
- **Log everything** — print clear status messages so the user knows what's being worked on
- **Handle errors gracefully** — if a subagent fails, log the error and move on
- **Respect the user** — if the user says stop, stop immediately
- **Subtasks MUST have parent_id** — never call `add_todo` without `parent_id` when creating subtasks. Orphaned top-level tasks break the orchestration flow and clutter the task list.
- **Filter description from action** — only create subtasks for actionable work. Context, explanations, and motivational text belong in session messages or task notes, not as subtasks.
- **Keep task titles short** — when creating tasks with `add_todo`, the `text` field should be a concise one-line title (a few words). Put all details, context, descriptions, and instructions in the `notes` field instead. Short titles are easier to scan in the task list.
- **Use worktree isolation for code-modifying subagents** — always pass `isolation: "worktree"` when dispatching subagents that will modify code (creating PRs, fixing bugs, resolving conflicts, rebasing, running/fixing tests). This prevents subagents from interfering with each other or the main working directory. Only skip for read-only tasks like auditing or posting summaries.

## Example Session

```
User: /todolist

Claude: Checking for pending tasks...

Found 2 pending sessions:
  - Session abc123: "Fix login bug" (unclaimed → claiming)
  - Session def456: Follow-up from user "Can you also add tests?"
    → Routing to existing subagent for session def456

Dispatching subagent for "Fix login bug"...
  → Subagent spawned (background), tracking session abc123

Polling scheduled every 5 minutes via /loop. Auto-expires after 3 days.

[Subagent completes]
✓ Session abc123: Subagent finished. Reply posted to session.
```
