/**
 * take-screenshots.js
 *
 * Captures screenshots of every modal in the app and saves them to
 * screenshots/{branch-name}/ so each PR gets its own directory.
 *
 * Prerequisites:
 *   - Backend running:  cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload
 *   - Frontend running: cd frontend && npm run dev
 *   - At least one non-Personal space must exist (for Edit Space modal).
 *     Create one via the space dropdown → New Space if needed.
 *   - Playwright installed: npm install playwright (or npx playwright install chromium)
 *
 * Usage:
 *   node scripts/take-screenshots.js              # auto-detects branch name
 *   node scripts/take-screenshots.js my-pr-name   # explicit directory name
 *
 * Output: screenshots/{branch-name}/modal-*.png
 *
 * See docs/SCREENSHOT_WORKFLOW.md for patterns, gotchas, and how to add new modals.
 */

const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Determine output directory from arg or current branch name
function getOutputDir() {
  const arg = process.argv[2];
  if (arg) return arg;

  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    // Strip common prefixes (e.g. "claude/", "feature/") and use the last segment
    const name = branch.split('/').pop() || branch;
    return name;
  } catch {
    return 'screenshots';
  }
}

const DIR_NAME = getOutputDir();
const DIR = path.join(__dirname, '..', 'screenshots', DIR_NAME);
const URL = 'http://localhost:3000';

fs.mkdirSync(DIR, { recursive: true });
console.log(`📸 Saving screenshots to screenshots/${DIR_NAME}/`);

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 750, height: 800 });

  await page.goto(URL);
  await page.waitForSelector('button[title="Settings"]', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const ss = (name) => page.screenshot({ path: `${DIR}/${name}`, scale: 'css' });

  // After each modal close, wait for the overlay div to leave the DOM.
  // The backdrop lingers briefly after React state update — if you don't wait,
  // the next action hits the stale backdrop and times out.
  const waitNoOverlay = async () => {
    await page.waitForFunction(
      () => !document.querySelector('[class*="fixed"][class*="inset-0"]'),
      { timeout: 4000 }
    ).catch(() => {});
    await page.waitForTimeout(200);
  };

  // Use .nth(0) to avoid strict mode violations when multiple elements match.
  const goTab = async (name) => {
    await page.getByRole('button', { name, exact: true }).nth(0).click();
    await page.waitForTimeout(300);
  };

  // ── 1. Add Category ─────────────────────────────────────────────
  // Scoped to button[class*="rounded-xl"] to avoid hitting the task-input +
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
  // Requires a non-Personal space. Pencil icon only appears for non-active spaces.
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

  console.log(`✅ All 10 screenshots saved to screenshots/${DIR_NAME}/`);
  await browser.close();
})();
