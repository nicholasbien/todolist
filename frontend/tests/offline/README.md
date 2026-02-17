# Offline Todo Playwright Smoke Test

This script validates the offline todo flow:
1) Login with test account
2) Go offline and create a todo
3) Reload while offline
4) Reconnect and confirm the todo persists

## Prereqs
- Backend running on http://localhost:8000
- Frontend running on http://localhost:3000
- Test account: test@example.com / 000000

## Run
```bash
cd frontend
node tests/offline/offline-todo-smoke.js
```

Screenshots are saved to `frontend/public/screenshots/`:
- `offline-todo-created.png`
- `offline-todo-after-reload.png`
- `offline-todo-after-reconnect.png`
