# Remove Unused Webhook System

Based on investigation in todolist session 69ad0a49fb5006638bc514e4, the webhook system is NOT being used:

## Files to Remove/Modify:

### Backend:
- `backend/webhook_dispatcher.py` - Remove this entire file (webhook sender)
- `backend/chat_sessions.py` - Remove webhook dispatch calls:
  - Remove imports from webhook_dispatcher
  - Remove notify_session_created() call in create_session()
  - Remove notify_session_claimed() call in claim_session()
  - Remove notify_session_released() call in release_session()
  - Remove notify_message_posted() call in append_message()

### Scripts:
- `scripts/webhook-server.js` - Remove entire file
- `scripts/webhook-receiver.js` - Remove entire file
- `scripts/session-router.js` - Remove entire file
- `scripts/message-router.js` - Remove entire file
- `scripts/railway-entry.js` - Remove entire file (webhook server entry point)

### Config:
- `railway-webhook.toml` - Remove entire file
- `scripts/railway.toml` - Remove entire file (webhook-specific config)

### Docs:
- `docs/WEBHOOK_ARCHITECTURE.md` - Add note: "Deprecated - webhooks not in use"

## Verification:
- Ensure `scripts/auto-claim-sessions.js` (polling system) is NOT removed - this is what's actually being used
- Backend should still compile and run after removals
- Polling-based auto-claim should continue to work
