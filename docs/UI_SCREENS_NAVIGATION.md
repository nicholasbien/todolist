# UI Screens Navigation Guide

Reference for Playwright-based UI validation workflows. Documents how to reach every key screen/modal in the app.

## Prerequisites

Both servers must be running:
```bash
# Terminal 1
cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2
cd frontend && npm run dev
```

Navigate to `http://localhost:3000`. The app auto-logs in via stored session token.

---

## Main Tabs

All three tabs are always visible in the top nav.

| Screen | How to reach |
|--------|-------------|
| Tasks tab | Click `button[name="Tasks"]` (tab nav) |
| Assistant tab | Click `button[name="Assistant"]` (tab nav) |
| Journal tab | Click `button[name="Journal"]` (tab nav) |

---

## Tasks Tab Modals

All task modals render **inline within the Tasks panel** (not fixed overlays), so you must have the Tasks tab active before screenshotting.

| Modal | How to trigger |
|-------|---------------|
| **Add Category** | Click the `+` button at the end of the category pill row |
| **Edit Category** | Right-click (or long-press on mobile) any non-"General" category pill |
| **Edit Task** | Right-click (or long-press on mobile) any task row |
| **Create Space** | Click the space name button (top-left) → click "New Space..." |
| **Edit Space** | Click the space name button → click an existing space entry |

> **Playwright tip**: Use `click({ button: 'right' })` for right-click triggers.
> Tab must be active — call `page.getByRole('button', { name: 'Tasks', exact: true }).click()` first.

---

## Settings Modals

Open the settings dropdown first: click the gear icon (`button[name="Settings"]`) in the top-right.

| Modal | Menu item to click |
|-------|-------------------|
| **Account Settings** | "Account" |
| **Email Settings** | "Email Settings" |
| **Insights** | "Insights" |
| **Export Data** | "Export Data" |
| **Contact** | "Contact" |

Settings modals are **fixed overlays** — they render on top of whatever tab is active.

---

## Auth Flow (logged-out state)

The auth flow is on the index page when no valid session exists.

| Screen | How to reach |
|--------|-------------|
| Email entry (step 1) | Clear session storage/cookies and navigate to `http://localhost:3000` |
| Code entry (step 2) | Submit a valid email on step 1 |
| Name entry (step 3) | Submit a valid code for a new user |

> **Test account**: email `test@example.com`, code `000000` — bypasses email sending.

---

## Journal Tab

| Element | Notes |
|---------|-------|
| Date picker | `<` / `>` buttons to navigate days; text input accepts `YYYY-MM-DD` |
| Journal textarea | Focused border turns orange (`focus:border-accent`) |
| Save button | Orange outline; disabled when content matches last saved |

---

## Assistant Tab

| Element | Notes |
|---------|-------|
| Input | `placeholder="Ask a question..."` |
| Send button | Orange outline; disabled when input is empty or offline |
| Clear Chat button | Appears above messages once conversation starts |

---

## Screenshotting Tips

```js
// Always ensure correct tab is active for inline modals
await page.getByRole('button', { name: 'Tasks', exact: true }).click();

// Right-click to open context-menu modals
await page.locator('p').filter({ hasText: 'My task' }).click({ button: 'right' });
await page.getByRole('button', { name: 'Chores', exact: true }).click({ button: 'right' });

// Wait for modal content before screenshotting
await page.waitForSelector('text=Edit Task');
await page.screenshot({ path: 'screenshots/modal-edit-task.png', scale: 'css' });

// Save screenshots to screenshots/ in repo root (committed to repo)
```

---

## Screenshots Reference

Current screenshots are in `screenshots/` at the repo root:

| File | Modal |
|------|-------|
| `modal-add-category.png` | Add New Category |
| `modal-edit-category.png` | Edit Category (Rename/Delete/Cancel) |
| `modal-edit-todo.png` | Edit Task |
| `modal-create-space.png` | Create Space |
| `modal-email-settings.png` | Email Settings |
| `modal-export.png` | Export Data |
| `modal-contact.png` | Contact |
| `modal-account-settings.png` | Account Settings |
