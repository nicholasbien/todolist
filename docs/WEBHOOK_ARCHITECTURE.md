# Webhook-Based Session Routing Architecture

## User Request (2026-03-07)
Use webhooks from todolist app to communicate instead of polling, with session ID-based routing.

## Proposed Architecture

### Current (Polling)
```
OpenClaw ──poll──> Todolist API ──> Check pending ──> Process ──> Loop
        (every 15s)   
```

### Proposed (Webhook)
```
Todolist Backend ──webhook──> OpenClaw Gateway ──> Route by session_id ──> Subagent
     │                                                        │
     │                                                        └──-> Existing subagent (follow-up)
     │                                                        └──-> New subagent (new task)
     └── Session created / Message posted / Agent requested
```

## Benefits

| Aspect | Polling | Webhook |
|--------|---------|---------|
| Latency | 15s delay | Real-time |
| Resource use | Continuous API calls | Event-driven |
| Scalability | O(n) API load | O(1) idle, O(1) per event |
| Complexity | Simple, reliable | More complex, needs retry logic |

## Implementation Plan

### 1. Todolist Backend Changes

Add webhook configuration to backend:

```python
# backend/config.py
WEBHOOK_URL = os.getenv("AGENT_WEBHOOK_URL")  # e.g., "https://gateway.openclaw.ai/webhook/todolist"
WEBHOOK_SECRET = os.getenv("AGENT_WEBHOOK_SECRET")  # HMAC signature
```

Send webhooks on events:

```python
# backend/agent/agent.py

async def on_session_created(session: ChatSession):
    """Send webhook when new agent session created"""
    await send_webhook({
        "event": "session.created",
        "session_id": str(session.id),
        "todo_id": str(session.todo_id),
        "title": session.title,
        "space_id": str(session.space_id),
        "timestamp": datetime.utcnow().isoformat()
    })

async def on_message_posted(session_id: str, message: Message):
    """Send webhook when new message posted"""
    await send_webhook({
        "event": "message.posted",
        "session_id": session_id,
        "message_id": str(message.id),
        "role": message.role,
        "content_preview": message.content[:200],
        "needs_agent_response": session.needs_agent_response,
        "timestamp": datetime.utcnow().isoformat()
    })
```

### 2. OpenClaw Gateway Webhook Handler

Create webhook endpoint in OpenClaw:

```typescript
// openclaw/src/webhooks/todolist.ts

interface TodolistWebhook {
  event: 'session.created' | 'message.posted' | 'session.claimed' | 'session.released';
  session_id: string;
  todo_id?: string;
  space_id?: string;
  agent_id?: string;
  timestamp: string;
  // HMAC signature for verification
  signature?: string;
}

export async function handleTodolistWebhook(payload: TodlistWebhook) {
  // Verify HMAC signature
  if (!verifySignature(payload)) {
    return { status: 401, error: 'Invalid signature' };
  }

  switch (payload.event) {
    case 'session.created':
      return await handleNewSession(payload);
    case 'message.posted':
      return await handleNewMessage(payload);
    case 'session.claimed':
    case 'session.released':
      return await handleSessionStateChange(payload);
  }
}

async function handleNewSession(payload: TodlistWebhook) {
  // Check if we should auto-claim this session
  if (!shouldAutoClaim(payload)) {
    return { status: 200, action: 'ignored' };
  }

  // Claim the session first
  const claimed = await claimSession(payload.session_id, AGENT_ID);
  if (!claimed) {
    return { status: 409, error: 'Session already claimed' };
  }

  // Classify and spawn appropriate subagent
  const classification = await classifySession(payload);
  
  if (classification.type === 'coding') {
    // Spawn coding subagent that stays alive for follow-ups
    const subagent = await sessions_spawn({
      task: buildCodingTask(payload),
      agentId: 'codex',
      label: `todolist-${payload.session_id}`,
      runTimeoutSeconds: 300, // 5 min initial timeout
      cleanup: 'keep' // Keep session alive for follow-ups
    });
    
    // Register mapping: session_id -> subagent_session_key
    await registerSessionMapping(payload.session_id, subagent.sessionKey);
    
    return { 
      status: 200, 
      action: 'spawned_coding_subagent',
      subagent_session: subagent.sessionKey
    };
  } else {
    // Handle simple response directly
    const response = await handleSimpleResponse(payload);
    await postMessage(payload.session_id, response);
    await releaseSession(payload.session_id);
    
    return { status: 200, action: 'simple_response' };
  }
}

async function handleNewMessage(payload: TodlistWebhook) {
  // Check if session has active subagent
  const mapping = await getSessionMapping(payload.session_id);
  
  if (mapping && mapping.subagent_session_key) {
    // Route to existing subagent
    await sessions_send({
      sessionKey: mapping.subagent_session_key,
      message: `New user message: ${payload.content_preview}`
    });
    
    return { status: 200, action: 'routed_to_subagent' };
  } else {
    // No active subagent - check if we need to spawn one
    if (payload.needs_agent_response) {
      return await handleNewSession(payload); // Spawn new handler
    }
    
    return { status: 200, action: 'no_action_needed' };
  }
}
```

### 3. Session Registry (Subagent Tracking)

Store mapping between todolist sessions and OpenClaw subagent sessions:

```typescript
// openclaw/src/agents/session-registry.ts

interface SessionMapping {
  todolist_session_id: string;
  subagent_session_key: string;
  subagent_agent_id: string;
  created_at: number;
  last_activity: number;
  status: 'active' | 'completed' | 'timeout';
}

const sessionRegistry = new Map<string, SessionMapping>();

export async function registerSessionMapping(
  todolistSessionId: string, 
  subagentSessionKey: string
): Promise<void> {
  sessionRegistry.set(todolistSessionId, {
    todolist_session_id: todolistSessionId,
    subagent_session_key: subagentSessionKey,
    subagent_agent_id: resolveAgentIdFromSessionKey(subagentSessionKey),
    created_at: Date.now(),
    last_activity: Date.now(),
    status: 'active'
  });
}

export async function getSessionMapping(
  todolistSessionId: string
): Promise<SessionMapping | null> {
  return sessionRegistry.get(todolistSessionId) || null;
}

// Cleanup completed/timeout sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, mapping] of sessionRegistry) {
    if (mapping.status === 'completed') {
      sessionRegistry.delete(id);
    } else if (now - mapping.last_activity > 30 * 60 * 1000) { // 30 min timeout
      mapping.status = 'timeout';
      sessionRegistry.delete(id);
    }
  }
}, 60 * 1000); // Check every minute
```

### 4. Subagent Lifecycle Management

Subagents handle follow-ups using `sessions_send`:

```typescript
// Subagent receives follow-up messages
async function subagentMainLoop() {
  while (true) {
    // Wait for parent to send new task via sessions_send
    const message = await waitForParentMessage();
    
    if (message.type === 'new_task') {
      // Do work
      const result = await doWork(message.content);
      
      // Post back to todolist
      await postToTodolist(message.todolist_session_id, result);
      
      // Notify parent we're done (but keep session alive)
      await notifyParent({ status: 'completed', task_id: message.task_id });
    }
    
    if (message.type === 'shutdown') {
      break; // Exit loop, session will be cleaned up
    }
  }
}
```

## Configuration

### Todolist Backend (.env)
```bash
AGENT_WEBHOOK_URL=https://gateway.openclaw.ai/webhook/todolist
AGENT_WEBHOOK_SECRET=your_webhook_secret_here
AGENT_AUTO_CLAIM_ENABLED=true
```

### OpenClaw Gateway Config
```json
{
  "webhooks": {
    "todolist": {
      "enabled": true,
      "path": "/webhook/todolist",
      "secret": "your_webhook_secret_here",
      "allowed_ips": ["railway.app"],
      "handlers": {
        "session.created": "spawn_or_queue",
        "message.posted": "route_to_subagent"
      }
    }
  },
  "agents": {
    "defaults": {
      "subagents": {
        "maxConcurrent": 5,
        "maxSpawnDepth": 2,
        "archiveAfterMinutes": 30
      }
    }
  }
}
```

## Error Handling & Retries

### Webhook Delivery (Todolist side)
```python
async def send_webhook(payload: dict, retries: int = 3):
    for attempt in range(retries):
        try:
            response = await http.post(
                WEBHOOK_URL,
                json=payload,
                headers={'X-Webhook-Signature': generate_signature(payload)}
            )
            if response.status == 200:
                return True
        except Exception as e:
            logger.warning(f"Webhook attempt {attempt + 1} failed: {e}")
            await asyncio.sleep(2 ** attempt)  # Exponential backoff
    
    # All retries failed - queue for later
    await queue_failed_webhook(payload)
    return False
```

### Webhook Processing (OpenClaw side)
- Return 200 quickly to prevent timeout
- Process asynchronously
- Retry on 5xx errors
- Queue if gateway unavailable

## Migration Path

1. **Phase 1**: Add webhook to backend, keep polling as fallback
2. **Phase 2**: Test webhooks with subset of sessions
3. **Phase 3**: Make webhooks primary, polling as backup
4. **Phase 4**: Remove polling entirely

## Comparison Summary

| Feature | Polling (Current) | Webhook (Proposed) |
|---------|-------------------|-------------------|
| **Latency** | 15s | <1s |
| **API Load** | 4 req/min constant | Event-driven |
| **Follow-up Handling** | Re-classify each poll | Route to existing subagent |
| **Complexity** | Simple, battle-tested | More complex, needs infra |
| **Reliability** | High (retries built-in) | Needs retry/queue logic |
| **Scalability** | Linear API growth | Constant load |

## Recommendation

**Build webhook system for production.** It's:
- More responsive (real-time vs 15s delay)
- More efficient (event-driven vs constant polling)
- Better UX (instant agent response)
- Better architecture (push vs pull)

Keep simple polling as fallback for:
- Development/testing
- Webhook failures
- Legacy support

## Next Steps

1. Implement webhook sender in todolist backend
2. Add webhook endpoint to OpenClaw gateway
3. Build session registry for routing
4. Modify subagent-spawner to use webhooks
5. Test with subset of sessions
6. Monitor and tune
7. Full migration

---
*Created: 2026-03-07*
*Based on Poisson's suggestion*
