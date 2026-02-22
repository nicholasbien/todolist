/**
 * take-screenshots.js
 *
 * Playwright script that opens every modal in the app and saves screenshots
 * to screenshots/ at the repo root.
 *
 * Prerequisites:
 *   - Backend running:  cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload
 *   - Frontend running: cd frontend && npm run dev
 *   - At least one non-Personal space must exist (for Edit Space modal)
 *     Create one via the space dropdown → New Space if needed.
 *
 * Run (from repo root):
 *   npx playwright test scripts/take-screenshots.js
 *   -- OR --
 *   node scripts/take-screenshots.js   (if using the raw Playwright API directly)
 *
 * How this was validated:
 *   Iteratively tested via Playwright MCP browser_run_code. Key lessons learned:
 *   - Use .nth(0) on all potentially ambiguous role selectors to avoid strict mode violations
 *   - Task tab modals (Add/Edit Category, Edit Task, Create/Edit Space) are inline in the
 *     Tasks panel; the Tasks tab must be active before opening them
 *   - Close each modal with its SPECIFIC button — generic close logic fails:
 *       Account Settings → button "Close"          (exact: true)
 *       Email Settings   → button "Cancel"         (exact: true)
 *       Insights         → button "Close insights" (aria-label)
 *       Export Data      → button "Cancel"         (exact: true)
 *       Contact          → button "Cancel"         (exact: true)
 *       Task modals      → button "Cancel"         (exact: true)
 *   - After each close, wait for [class*="fixed"][class*="inset-0"] to leave the DOM
 *     before proceeding — the backdrop lingers briefly after React state update
 *   - Do NOT use page.evaluate() to remove overlay DOM nodes; that corrupts React state
 *   - The Add Category "+" is button[class*="rounded-xl"] with text /^\+$/ (not the task-input +)
 *   - Edit Category and Edit Task use right-click: .click({ button: 'right' })
 *   - Edit Space: click space dropdown → "Edit space" pencil button (nth(0) for non-active space)
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

  const waitNoOverlay = async () => {
    await page.waitForFunction(
      () => !document.querySelector('[class*="fixed"][class*="inset-0"]'),
      { timeout: 4000 }
    ).catch(() => {});
    await page.waitForTimeout(200);
  };

  const goTab = async (name) => {
    await page.getByRole('button', { name, exact: true }).nth(0).click();
    await page.waitForTimeout(300);
  };

  // ── 1. Add Category ─────────────────────────────────────────────
  await goTab('Tasks');
  await page.locator('button[class*="rounded-xl"]').filter({ hasText: /^\+$/ }).first().click();
  await page.waitForSelector('text=Add New Category');
  await ss('modal-add-category.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitNoOverlay();

  // ── 2. Edit Category ─────────────────────────────────────────────
  await goTab('Tasks');
  await page.getByRole('button', { name: 'Chores', exact: true }).click({ button: 'right' });
  await page.waitForSelector('text=Edit Category');
  await ss('modal-edit-category.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitNoOverlay();

  // ── 3. Edit Task ─────────────────────────────────────────────────
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
  // Requires a non-Personal space to exist (create one first if needed)
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
  await page.getByRole('button', { name: 'Close', exact: true }).click();
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
  await page.getByRole('button', { name: 'Close insights' }).click(); // aria-label, not text
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
