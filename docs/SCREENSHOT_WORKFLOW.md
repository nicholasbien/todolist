# Screenshot Workflow

How to capture screenshots of every UI modal using Playwright. Screenshots live in `screenshots/` at the repo root and are committed to git so PRs can show visual diffs.

---

## Quick Run

Make sure both servers are running, then:

```bash
node scripts/take-screenshots.js
```

This captures all 10 modals in one pass and overwrites `screenshots/` with fresh files. Commit the results.

### Prerequisites

```bash
# Terminal 1 — backend
cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — frontend
cd frontend && npm run dev
```

- Must be logged in as the test account (`test@example.com` / `000000`) — the script assumes a valid session in localStorage
- At least one non-Personal space must exist for the Edit Space screenshot (create via space dropdown → New Space if needed)
- `npm install playwright` or `npx playwright install chromium` if Playwright isn't installed

---

## Full Script

The canonical script is at `scripts/take-screenshots.js`. Here it is in full for reference:

```js
/**
 * take-screenshots.js — capture all 10 modal screenshots
 * Run from repo root: node scripts/take-screenshots.js
 */

const { chromium } = require('playwright');
const path = require('path');

const DIR = path.join(__dirname, '..', 'screenshots');
const URL = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 750, height: 800 });

  await page.goto(URL);
  await page.waitForSelector('button[title="Settings"]', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const ss = (name) => page.screenshot({ path: `${DIR}/${name}`, scale: 'css' });

  // After each modal close, wait for the overlay div to leave the DOM.
  // The backdrop ([class*="fixed"][class*="inset-0"]) lingers briefly after
  // React state update — if you don't wait, the next action hits the stale backdrop.
  const waitNoOverlay = async () => {
    await page.waitForFunction(
      () => !document.querySelector('[class*="fixed"][class*="inset-0"]'),
      { timeout: 4000 }
    ).catch(() => {});
    await page.waitForTimeout(200);
  };

  // Use .nth(0) on all tab buttons to avoid strict mode violations.
  // (Multiple elements can match "Tasks" in the DOM at the same time.)
  const goTab = async (name) => {
    await page.getByRole('button', { name, exact: true }).nth(0).click();
    await page.waitForTimeout(300);
  };

  // ── 1. Add Category ─────────────────────────────────────────────
  // The + at the end of the category pill row has class "rounded-xl".
  // The task-input + also exists — scope by class to pick the right one.
  await goTab('Tasks');
  await page.locator('button[class*="rounded-xl"]').filter({ hasText: /^\+$/ }).first().click();
  await page.waitForSelector('text=Add New Category');
  await ss('modal-add-category.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitNoOverlay();

  // ── 2. Edit Category ─────────────────────────────────────────────
  // Triggered by right-click on any non-General category pill.
  await goTab('Tasks');
  await page.getByRole('button', { name: 'Chores', exact: true }).click({ button: 'right' });
  await page.waitForSelector('text=Edit Category');
  await ss('modal-edit-category.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitNoOverlay();

  // ── 3. Edit Task ─────────────────────────────────────────────────
  // Triggered by right-click on the task text paragraph.
  await goTab('Tasks');
  await page.locator('p').first().click({ button: 'right' });
  await page.waitForSelector('text=Edit Task');
  await ss('modal-edit-todo.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitNoOverlay();

  // ── 4. Create Space ──────────────────────────────────────────────
  await goTab('Tasks');
  await page.locator('button').filter({ hasText: /Personal|Test Space/ }).nth(0).click();
  await page.waitForSelector('text=New Space');
  await page.getByRole('button', { name: /New Space/ }).click();
  await page.waitForSelector('text=Create Space');
  await ss('modal-create-space.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitNoOverlay();

  // ── 5. Edit Space ────────────────────────────────────────────────
  // Requires a non-Personal space. Click space dropdown, then the pencil
  // icon ("Edit space") next to a non-active space.
  await goTab('Tasks');
  await page.locator('button').filter({ hasText: /Personal|Test Space/ }).nth(0).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Edit space' }).nth(0).click();
  await page.waitForSelector('text=Edit Space');
  await ss('modal-edit-space.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitNoOverlay();

  // ── 6. Account Settings ──────────────────────────────────────────
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.waitForSelector('text=Account Settings');
  await ss('modal-account-settings.png');
  await page.getByRole('button', { name: 'Close', exact: true }).click(); // "Close", not "Cancel"
  await waitNoOverlay();

  // ── 7. Email Settings ────────────────────────────────────────────
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Email Settings', exact: true }).click();
  await page.waitForSelector('text=Email Settings');
  await ss('modal-email-settings.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitNoOverlay();

  // ── 8. Insights ──────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.waitForSelector('text=Insights');
  await ss('modal-insights.png');
  // Insights close button has aria-label "Close insights", not text "Close"
  await page.getByRole('button', { name: 'Close insights' }).click();
  await waitNoOverlay();

  // ── 9. Export Data ───────────────────────────────────────────────
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Export Data', exact: true }).click();
  await page.waitForSelector('text=Export');
  await ss('modal-export.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitNoOverlay();

  // ── 10. Contact ──────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Contact', exact: true }).click();
  await page.waitForSelector('text=Contact');
  await ss('modal-contact.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitNoOverlay();

  console.log('✅ All 10 screenshots saved to screenshots/');
  await browser.close();
})();
```

---

## Gotchas & Patterns

These were discovered through iterative testing. Violating any of them causes flakiness or timeouts.

### 1. Always wait for the backdrop to clear

After clicking Cancel/Close, the overlay div (`[class*="fixed"][class*="inset-0"]`) lingers in the DOM for a render cycle. The next modal open will be blocked if you don't wait.

```js
// ✅ correct
await page.getByRole('button', { name: 'Cancel', exact: true }).click();
await page.waitForFunction(
  () => !document.querySelector('[class*="fixed"][class*="inset-0"]'),
  { timeout: 4000 }
);

// ❌ wrong — proceeds while backdrop is still blocking
await page.getByRole('button', { name: 'Cancel', exact: true }).click();
await page.waitForTimeout(200); // not reliable
```

### 2. Never remove overlay nodes via `page.evaluate`

Calling `document.querySelector('.fixed.inset-0').remove()` removes the DOM node but leaves React state as `showModal = true`. React re-renders and adds the backdrop back. This looks like it worked (the DOM node is gone momentarily) but breaks the next action.

```js
// ❌ never do this
await page.evaluate(() => document.querySelector('.fixed.inset-0')?.remove());
```

### 3. Use `.nth(0)` on tab buttons

`getByRole('button', { name: 'Tasks', exact: true })` can resolve to 2 elements due to ARIA attributes elsewhere in the DOM. Always add `.nth(0)`.

```js
// ✅
await page.getByRole('button', { name: 'Tasks', exact: true }).nth(0).click();

// ❌ strict mode violation
await page.getByRole('button', { name: 'Tasks', exact: true }).click();
```

### 4. Each modal has a different close button

Do NOT use a generic `getByRole('button', { name: /Close|Cancel/ })` — it hits wrong buttons from the task panel which is always in the DOM behind the overlay.

| Modal | Close button |
|-------|-------------|
| Add Category | `'Cancel'` (exact) |
| Edit Category | `'Cancel'` (exact) |
| Edit Task | `'Cancel'` (exact) |
| Create Space | `'Cancel'` (exact) |
| Edit Space | `'Cancel'` (exact) |
| Account Settings | `'Close'` (exact) — different! |
| Email Settings | `'Cancel'` (exact) |
| **Insights** | `'Close insights'` — aria-label, not visible text |
| Export Data | `'Cancel'` (exact) |
| Contact | `'Cancel'` (exact) |

### 5. Add Category `+` vs task-input `+`

Two `+` buttons exist on the page simultaneously. The category `+` has class `rounded-xl`; the task-input `+` does not.

```js
// ✅ category + (end of pill row)
await page.locator('button[class*="rounded-xl"]').filter({ hasText: /^\+$/ }).first().click();

// ❌ hits task-input + which doesn't open Add Category modal
await page.locator('button').filter({ hasText: /^\+$/ }).first().click();
```

### 6. Edit Category and Edit Task need right-click

These modals open on `onContextMenu` (right-click / long-press), not on regular click.

```js
await page.getByRole('button', { name: 'Chores', exact: true }).click({ button: 'right' });
await page.locator('p').first().click({ button: 'right' });
```

### 7. Edit Space requires a non-active space

The pencil "Edit space" button only appears for spaces that are not currently active. You need at least two spaces. Click the space dropdown, then the pencil icon next to the non-active space.

---

## Adding a New Modal

When a new modal, drawer, or full-screen view is added to the app:

1. **Add a screenshot step** to `scripts/take-screenshots.js` following the pattern above
2. **Add the close button** to the table in this doc (section 4 of Gotchas)
3. **Add a row** to the Screenshots Reference table in `docs/UI_SCREENS_NAVIGATION.md`
4. **Add navigation instructions** for the new screen to `docs/UI_SCREENS_NAVIGATION.md`
5. **Run the script** and commit the new screenshot file

---

## Screenshots Reference

All files live in `screenshots/` at the repo root:

| File | Modal |
|------|-------|
| `modal-add-category.png` | Add New Category |
| `modal-edit-category.png` | Edit Category |
| `modal-edit-todo.png` | Edit Task |
| `modal-create-space.png` | Create Space |
| `modal-edit-space.png` | Edit Space |
| `modal-account-settings.png` | Account Settings |
| `modal-email-settings.png` | Email Settings |
| `modal-insights.png` | Insights |
| `modal-export.png` | Export Data |
| `modal-contact.png` | Contact |
