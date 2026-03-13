# Issue: Agent Response Tracking

## Problem
When I post responses to TodoList sessions via `/agent/sessions/{id}/messages`, the sessions still appear in `/agent/sessions/pending` queries with `needs_agent_response: true`.

## Expected Behavior
After posting an assistant message with `interim=false`:
- `needs_agent_response` should be `False`
- Session should NOT appear in `/agent/sessions/pending` results

## Code Analysis

### `append_message()` in `chat_sessions.py` (lines 213-228):
```python
elif role == "assistant":
    if not interim:
        update["needs_agent_response"] = False
    update["has_unread_reply"] = True
    if agent_id:
        update["agent_id"] = agent_id
    if needs_human_response:
        update["needs_human_response"] = True
        update["needs_agent_response"] = False
```

This should correctly set `needs_agent_response: False` when an assistant posts a non-interim message.

### `get_pending_sessions()` query (lines 243-258):
```python
query: Dict[str, Any] = {
    "user_id": user_id,
    "needs_agent_response": True,  # <-- Requires True
    "updated_at": {"$gte": cutoff},
    "needs_human_response": {"$ne": True},
}
```

If `needs_agent_response` is correctly set to `False`, sessions should not match this query.

## Potential Causes

1. **API call issue**: The `role` parameter might not be being sent correctly
2. **Race condition**: Something else is resetting the flag after I post
3. **Session identification**: I'm posting to a different session than expected

## Test Plan

Need to add:
1. Unit test for `append_message()` with assistant role
2. Integration test for the full flow
3. Debug logging to trace actual values

## Related Sessions

Current sessions with `is_followup: true`:
- 69b1c7a6: Portfolio config - I posted update (shown in recent_messages)
- 69b1b1c1: Portfolio email - User said "thanks", I responded
- Others: Older, no new messages
