# Closed Tasks Feature Implementation

## Overview
Implement a "closed tasks" feature where closed != completed. Closed means "not going to do", completed means "done".

## Requirements
1. Add `status` field to Todo model with values: `active`, `completed`, `closed`, `deleted`
2. Two-stage deletion: First delete → moves to "closed" list, Second delete → permanent deletion
3. Show closed tasks in separate section below completed tasks
4. Allow closing tasks (different from completing)
5. Allow reopening closed tasks (back to active)

## Backend Changes (backend/todos.py)

### 1. Update Todo Model
Add `status` field with Literal type and default value "active":
```python
status: Literal["active", "completed", "closed", "deleted"] = "active"
```

### 2. Update Migration Function
Add migration for the new status field in `migrate_legacy_todos()`:
- Backfill status for older todos based on completed field
- If completed=True → status="completed"
- If completed=False → status="active"

### 3. Add Close/Reopen Endpoint
Create new endpoint `/todos/{todo_id}/close` that:
- Toggles between "active" and "closed" status
- Returns appropriate message

### 4. Create New Endpoint Files
Create `backend/todo_status.py` with status management functions:
- `close_todo()` - set status to "closed"
- `reopen_todo()` - set status to "active"
- `permanently_delete_todo()` - actually delete from DB (only for closed tasks)

### 5. Update get_todos Query
Filter out "deleted" status tasks from normal queries

### 6. Update delete_todo Behavior
Modify to:
- If status is "active" or "completed" → set status to "closed" (soft delete)
- If status is "closed" → permanently delete
- If status is "deleted" → already deleted, return error

## Frontend Changes

### 1. Update TodoItem.tsx
Add props:
- `handleCloseTodo: (id: string) => void`
- `handleReopenTodo: (id: string) => void`
- `isClosed: boolean` - to determine if this is a closed task

Add UI:
- "Close" button (X icon) for active/completed tasks - marks as "not going to do"
- "Reopen" button for closed tasks - moves back to active
- Visual distinction for closed tasks (grayed out, different styling)

### 2. Update AIToDoListApp.tsx
- Add state: `showClosed`, `closedTodos`
- Add handlers: `handleCloseTodo`, `handleReopenTodo`, `handlePermanentDelete`
- Filter closed tasks from active/completed lists
- Add "Closed" section below "Completed" section
- Two-stage delete:
  - First delete on active/completed → moves to closed
  - Delete on closed → permanently deletes
- Add close/reopen API calls

### 3. Add Closed Tasks Section
Similar to completed tasks section but displayed below it:
- Toggle button "Show/Hide Closed"
- List of closed tasks with reopen option
- Permanent delete option for closed tasks

## API Endpoints to Add

1. `PUT /todos/{id}/close` - Close/reopen a task (toggle)
2. `DELETE /todos/{id}/permanent` - Permanently delete a closed task

## Key Behaviors

1. **Close vs Complete**:
   - Complete = "I'm done with this task" → status="completed"
   - Close = "I'm not going to do this" → status="closed"

2. **Two-Stage Deletion**:
   - First delete (X button on active/completed) → status="closed"
   - Second delete (trash icon on closed) → permanently deleted

3. **Reopening**:
   - Closed tasks can be reopened → status="active"
   - Completed tasks can be uncompleted → status="active"

4. **Task Display**:
   - Active tasks: Main list
   - Completed tasks: Collapsible section above closed
   - Closed tasks: Collapsible section below completed

## Testing Notes

After implementation:
1. Create a task → should be "active"
2. Complete it → should move to completed section
3. Delete from completed → should move to closed section
4. Delete from closed → should be permanently deleted
5. Reopen from closed → should move back to active
