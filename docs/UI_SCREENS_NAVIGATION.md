# UI Screens Navigation Guide

Reference for Playwright-based UI validation workflows. Documents how to reach every screen, modal, and interactive element in the app.

## Prerequisites

Both servers must be running:
```bash
# Terminal 1
cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2
cd frontend && npm run dev
```

Navigate to `http://localhost:3000`. The app auto-logs in via stored session token.

**Test account**: email `test@example.com`, code `000000` — bypasses email sending, works on any server.

---

## Pages

| Page | URL | Notes |
|------|-----|-------|
| **App** (logged in) | `http://localhost:3000` | Auto-redirects from login if session is valid |
| **Auth flow** (logged out) | `http://localhost:3000` | Clear localStorage/cookies to force logged-out state |
| **Home / Marketing** | `http://localhost:3000/home` | Public landing page with features + screenshots section |
| **Privacy Policy** | `http://localhost:3000/privacy` | Static page |
| **Terms of Service** | `http://localhost:3000/terms` | Static page |

---

## Auth Flow (logged-out state)

Trigger by logging out via Settings → Logout, or clearing session storage.

| Step | Screen | How to reach |
|------|--------|-------------|
| 1 | **Email entry** | Navigate to `http://localhost:3000` with no session |
| 2 | **Code entry** | Submit a valid email on step 1 |
| 3 | **Name entry** | Submit a valid code for a brand-new user only |

**Buttons on each step:**
- Step 1: "Send Verification Code" (orange outline)
- Step 2: "Sign In" (orange outline), "← Back to Email" (gray outline)
- Step 3: "Continue" (orange outline), "← Back" (gray outline)

> **Playwright tip**: To log out programmatically, click the gear icon → "Logout". To simulate a fresh user, clear `localStorage` and reload.

---

## Main App — Tab Navigation

All three tabs are always visible in the top nav bar.

| Tab | How to reach | Selector |
|-----|-------------|---------|
| **Tasks** | Click "Tasks" in top nav | `page.getByRole('button', { name: 'Tasks', exact: true })` |
| **Assistant** | Click "Assistant" in top nav | `page.getByRole('button', { name: 'Assistant', exact: true })` |
| **Journal** | Click "Journal" in top nav | `page.getByRole('button', { name: 'Journal', exact: true })` |

> **Important**: Inline modals (task, category, space) render inside the Tasks panel. Always activate the Tasks tab before screenshotting these.

---

## Tasks Tab

### Task List Elements

| Element | Notes |
|---------|-------|
| Category pills | Scrollable row of filter pills; "All" is always first |
| Active category pill | Highlighted with orange border + text (`border-accent text-accent`) |
| Search button | Magnifying glass icon; expands a search input |
| Sort button | Sort icon; opens sort options dropdown |
| Add task input | `placeholder="Add task(s)… (Shift+Enter for newline)"` |
| "+" add button | Submits the task input |
| Task rows | Each shows text, complete (✓) and delete (✗) icons |
| Category/priority dropdowns | Inline on each task row |
| "Show Completed (N)" | Button at bottom; toggles visibility of completed tasks |

### Task Tab Modals (inline — Tasks tab must be active)

| Modal | How to trigger | Playwright |
|-------|---------------|-----------|
| **Add Category** | Click `+` at the end of the category pill row | `page.getByRole('button', { name: '+', exact: true }).click()` |
| **Edit Category** | Right-click any non-"General" category pill | `page.getByRole('button', { name: 'Chores', exact: true }).click({ button: 'right' })` |
| **Edit Task** | Right-click any task row | `page.locator('p').filter({ hasText: 'My task' }).click({ button: 'right' })` |
| **Create Space** | Click space name button (top-left) → "New Space..." | Click space dropdown, then `New Space...` item |
| **Edit Space** | Click space name button → click pencil icon next to a non-active space | See note below |

> **Edit Space note**: The pencil "Edit space" button only appears next to spaces that are *not currently active*. You must have at least two spaces. Switch to the space you want to edit first, then open the dropdown and use the pencil on another space — or create a test space, then click the pencil next to it while on Personal.

> **Edit Space — owner vs member**: Owners see Save / Delete / Cancel. Members see only Leave / Cancel.

### Search Panel

Click the magnifying glass icon to expand the search input. Type to filter tasks by text.

### Sort Options

Click the sort icon to open the sort dropdown. Options: Default, Due Date, Priority, Alphabetical.

---

## Assistant Tab

| Element | Notes |
|---------|-------|
| Welcome screen | Shown when chat history is empty; lists capabilities |
| Input | `placeholder="Ask a question..."` |
| Send button | Orange outline; disabled when input is empty or loading |
| Clear Chat button | Gray outline; appears above messages once conversation starts |
| User messages | Dark gray box (`bg-gray-800`) with white text |
| Assistant messages | Plain text, no box |
| Tool call messages | Blue-tinted box showing tool name, inputs, and result |

---

## Journal Tab

| Element | Notes |
|---------|-------|
| Date picker | `<` / `>` arrow buttons navigate days; text input accepts `YYYY-MM-DD` |
| Journal textarea | Focused border turns orange (`focus:border-accent`) |
| Save button | Orange outline; disabled when content matches last saved |

---

## Settings Dropdown

Open by clicking the gear icon (`button[name="Settings"]`) in the top-right.

| Item | Opens |
|------|-------|
| Account | Account Settings modal |
| Email Settings | Email Settings modal |
| Insights | Insights modal |
| Export Data | Export Data modal |
| Contact | Contact modal |
| Logout | Logs out and returns to auth flow |

Settings modals are **fixed overlays** — they render on top of whatever tab is active.

### Account Settings Modal

| Element | Notes |
|---------|-------|
| Email field | Read-only, shows current email |
| Name field + "Update Name" | Orange outline button; disabled until name changes |
| "Delete Account" | Red outline button; expands confirmation step |
| Confirmation step | Type `DELETE` in input, then "Confirm Delete" (red outline) or "Cancel" (gray outline) |
| Close button | Gray outline; dismisses modal |

### Email Settings Modal

| Element | Notes |
|---------|-------|
| "Enable daily email summaries" | Checkbox; enables the rest of the form |
| Daily Summary Time | Time input (disabled until email enabled) |
| Custom Instructions | Textarea for AI prompt customization |
| Spaces to Include | Checkboxes for each space |
| Save / Cancel | Orange + gray outline buttons |
| "Send Email Now" | Green outline button; sends a summary immediately |

### Insights Modal

Displays analytics for the active space (or all spaces if none selected).

| Section | Notes |
|---------|-------|
| Overview stats | Total / Completed / Pending tasks + Completion rate |
| Tasks Per Week chart | Bar chart; orange = created, green = completed |
| Tasks by Category | Horizontal progress bars per category |
| Tasks by Priority | Horizontal progress bars per priority (High/Medium/Low) |

### Export Data Modal

Button: "Download Export" (orange outline) — downloads a JSON file of all tasks.

### Contact Modal

Textarea for message + "Send Message" (orange outline) + "Cancel" (gray outline).

---

## Space Dropdown

Click the space name button (top-left, shows current space name + folder icon) to open.

| Element | Notes |
|---------|-------|
| Active space row | Highlighted; no edit button |
| Other space rows | Each has a pencil icon to open Edit Space modal |
| "New Space..." | Opens Create Space modal inline |

---

## Button Style Reference

All interactive buttons follow a consistent outline pattern:

| Color | Usage | Classes |
|-------|-------|---------|
| Orange outline | Primary actions (Save, Submit, Send, Create) | `border border-accent text-accent hover:bg-accent/10` |
| Gray outline | Cancel / secondary actions | `border border-gray-600 text-gray-300 hover:bg-gray-800` |
| Red outline | Destructive actions (Delete, Leave) | `border border-red-500 text-red-400 hover:bg-red-900/20` |
| Green outline | Email send action | `border border-green-500 text-green-400 hover:bg-green-900/20` |

Input focus: `focus:outline-none focus:border-accent` (orange border, no ring).

---

## Automated Screenshot Script

A fully working script lives at `scripts/take-screenshots.js`. It opens all 10 modals in sequence and saves screenshots to `screenshots/`. Run from the repo root after starting both servers:

```bash
node scripts/take-screenshots.js
```

### Key patterns for Playwright automation

**Tab navigation** — use `.nth(0)` to avoid strict mode violations if the name appears in multiple elements:
```js
await page.getByRole('button', { name: 'Tasks', exact: true }).nth(0).click();
```

**Add Category `+`** — scoped to category pill row (avoids hitting the task-input `+`):
```js
await page.locator('button[class*="rounded-xl"]').filter({ hasText: /^\+$/ }).first().click();
```

**Right-click modals** (Edit Category, Edit Task):
```js
await page.getByRole('button', { name: 'Chores', exact: true }).click({ button: 'right' });
await page.locator('p').first().click({ button: 'right' });
```

**Edit Space** — click space dropdown, then pencil icon next to non-active space:
```js
await page.locator('button').filter({ hasText: /Personal|Test Space/ }).nth(0).click();
await page.getByRole('button', { name: 'Edit space' }).nth(0).click();
```

**Closing modals** — each modal has a different close button. Use the exact name per modal:

| Modal | Close selector |
|-------|---------------|
| Add Category | `getByRole('button', { name: 'Cancel', exact: true })` |
| Edit Category | `getByRole('button', { name: 'Cancel', exact: true })` |
| Edit Task | `getByRole('button', { name: 'Cancel', exact: true })` |
| Create Space | `getByRole('button', { name: 'Cancel', exact: true })` |
| Edit Space | `getByRole('button', { name: 'Cancel', exact: true })` |
| Account Settings | `getByRole('button', { name: 'Close', exact: true })` |
| Email Settings | `getByRole('button', { name: 'Cancel', exact: true })` |
| Insights | `getByRole('button', { name: 'Close insights' })` ← aria-label, not text |
| Export Data | `getByRole('button', { name: 'Cancel', exact: true })` |
| Contact | `getByRole('button', { name: 'Cancel', exact: true })` |

**Wait for backdrop to clear** after closing — the backdrop `div` lingers briefly in the DOM after React state updates. Always wait before opening the next modal:
```js
await page.waitForFunction(
  () => !document.querySelector('[class*="fixed"][class*="inset-0"]'),
  { timeout: 4000 }
).catch(() => {});
await page.waitForTimeout(200);
```

> **Do not** use `page.evaluate()` to remove overlay DOM nodes directly — that corrupts React state (the modal re-renders on next tick).

---

## Screenshots Reference

Current screenshots are in `screenshots/` at the repo root:

| File | Screen |
|------|--------|
| `modal-add-category.png` | Add New Category |
| `modal-edit-category.png` | Edit Category (Rename / Delete / Cancel) |
| `modal-edit-todo.png` | Edit Task |
| `modal-create-space.png` | Create Space |
| `modal-edit-space.png` | Edit Space (Save / Delete / Cancel) |
| `modal-email-settings.png` | Email Settings |
| `modal-export.png` | Export Data |
| `modal-contact.png` | Contact |
| `modal-insights.png` | Insights |
| `modal-account-settings.png` | Account Settings |
