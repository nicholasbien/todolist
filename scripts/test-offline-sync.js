/**
 * test-offline-sync.js
 *
 * E2E Playwright tests for offline/online sync flows.
 * Tests that data created/modified while offline syncs correctly when the
 * browser comes back online, and that online data remains accessible offline.
 *
 * Prerequisites:
 *   Backend:  cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload
 *   Frontend: cd frontend && npm run dev
 *   Playwright: npm install playwright (then npx playwright install chromium)
 *
 * Usage:
 *   node scripts/test-offline-sync.js
 *
 * Test account: test@example.com / 000000 (bypasses email, works on any server)
 *
 * What's tested:
 *   1. Create task offline → sync → server has it with real ID
 *   2. Update task text offline → sync → server reflects update
 *   3. Delete task offline → sync → server no longer has it
 *   4. Complete task offline → sync → "Show Completed" reflects it
 *   5. Write journal entry offline → sync → server has correct text
 *   6. Data created online is accessible when offline (IndexedDB caching)
 *   7. Multiple offline ops (update + delete + create) all sync together
 *
 * See docs/SCREENSHOT_WORKFLOW.md for related Playwright patterns.
 */

const { chromium } = require('playwright');

const APP_URL = 'http://localhost:3000';

// ── Result tracking ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failedChecks = [];

function pass(msg) {
  console.log(`    ✅ ${msg}`);
  passed++;
}

function fail(msg, detail = '') {
  const line = detail ? `${msg}\n         ${detail}` : msg;
  console.error(`    ❌ ${line}`);
  failed++;
  failedChecks.push(msg);
}

async function check(condition, msg, detail = '') {
  if (condition) pass(msg);
  else fail(msg, detail);
  return !!condition;
}

// ── Sync helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a promise that resolves when the service worker posts SYNC_COMPLETE,
 * or resolves with 'timeout' if nothing is received within `timeoutMs`.
 * Must be awaited BEFORE going online to avoid missing the event.
 */
function waitForSync(page, timeoutMs = 8000) {
  return page.evaluate((ms) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), ms);
    navigator.serviceWorker.addEventListener('message', function handler(e) {
      if (e.data?.type === 'SYNC_COMPLETE') {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('message', handler);
        resolve('synced');
      }
    });
  }), timeoutMs);
}

/**
 * Takes the browser online and waits for the service worker to finish syncing.
 * The OfflineContext sends SYNC_WHEN_ONLINE → SW runs syncQueue() → posts SYNC_COMPLETE.
 */
async function goOnlineAndSync(page, context) {
  // Start listening BEFORE going online to avoid race
  const syncPromise = waitForSync(page, 10000);
  await context.setOffline(false);
  const result = await syncPromise;
  if (result === 'timeout') {
    console.log('    ℹ️  No SYNC_COMPLETE received (queue may have been empty)');
  }
  // Allow UI to refresh after sync
  await page.waitForTimeout(1200);
}

// ── Server verification ──────────────────────────────────────────────────────

/**
 * Fetches todos via the service worker proxy (which adds auth headers and
 * hits the real backend when online). Returns the array or null on error.
 */
function fetchTodosFromServer(page) {
  return page.evaluate(async () => {
    try {
      const resp = await fetch('/todos');
      return resp.ok ? resp.json() : null;
    } catch { return null; }
  });
}

// ── UI helpers ───────────────────────────────────────────────────────────────

async function goToTasks(page) {
  await page.getByRole('button', { name: 'Tasks', exact: true }).nth(0).click();
  await page.waitForTimeout(400);
}

async function addTask(page, text) {
  const input = page.getByPlaceholder(/Add task/);
  await input.click();
  await input.fill(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
}

/**
 * Returns a locator scoped to the task row containing `text`.
 * Each todo renders as a div.p-4.border.rounded-xl with a <p> inside.
 */
function taskRow(page, text) {
  return page.locator('div[class*="p-4"][class*="border"][class*="rounded-xl"]')
    .filter({ has: page.locator('p', { hasText: text }) });
}

async function completeTask(page, text) {
  await taskRow(page, text).getByRole('button', { name: 'Mark task as complete' }).click();
  await page.waitForTimeout(600);
}

async function deleteTask(page, text) {
  await taskRow(page, text).getByRole('button', { name: 'Delete task' }).click();
  await page.waitForTimeout(600);
}

/**
 * Right-click on a task <p> to open the Edit Task modal, change text, save.
 */
async function updateTaskText(page, oldText, newText) {
  await page.locator('p', { hasText: oldText }).first().click({ button: 'right' });
  await page.waitForSelector('text=Edit Task');
  const input = page.locator('input[type="text"]').first();
  await input.fill(newText);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(600);
}

async function isVisible(page, text) {
  return (await page.locator('p', { hasText: text }).count()) > 0;
}

// ── Test runner ──────────────────────────────────────────────────────────────

(async () => {
  console.log('🔌 Offline/Online Sync — E2E Tests');
  console.log('   App:     http://localhost:3000');
  console.log('   Account: test@example.com / 000000\n');

  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ── Setup: navigate and wait for app + service worker ──────────────
    await page.goto(APP_URL);
    await page.waitForSelector('button[title="Settings"]', { timeout: 15000 });
    await page.waitForTimeout(1500); // let the service worker fully activate
    await goToTasks(page);

    const ts = Date.now(); // unique suffix prevents collisions with real data

    // ──────────────────────────────────────────────────────────────────
    // Test 1: Create task offline → sync → verify on server
    // ──────────────────────────────────────────────────────────────────
    console.log('📋 Test 1: Create task offline → sync online');
    try {
      const t1 = `[E2E] Offline create ${ts}`;

      await context.setOffline(true);
      await page.waitForTimeout(300);

      await addTask(page, t1);

      await check(await isVisible(page, t1),
        'Task appears in UI immediately while offline (served from IndexedDB)');

      await goOnlineAndSync(page, context);
      await goToTasks(page);

      await check(await isVisible(page, t1), 'Task still visible after sync');

      const todos = await fetchTodosFromServer(page);
      const found = todos?.find(t => t.text === t1);
      await check(!!found, 'Task exists on server after sync');
      await check(found && !found._id.startsWith('offline_'),
        'Task has a real server ID (not offline_*) after sync');
    } catch (err) {
      fail('Test 1 error', err.message);
    }
    console.log();

    // ──────────────────────────────────────────────────────────────────
    // Test 2: Update task text offline → sync → verify on server
    // ──────────────────────────────────────────────────────────────────
    console.log('✏️  Test 2: Update task offline → sync online');
    try {
      const t2 = `[E2E] Update me ${ts}`;
      const t2v2 = `[E2E] Updated ${ts}`;

      // Create online first so it has a real server ID before going offline
      await context.setOffline(false);
      await addTask(page, t2);
      await page.waitForTimeout(1000);

      await context.setOffline(true);
      await page.waitForTimeout(300);

      await updateTaskText(page, t2, t2v2);

      await check(await isVisible(page, t2v2), 'Updated text visible while offline');
      await check(!await isVisible(page, t2),  'Old text no longer visible while offline');

      await goOnlineAndSync(page, context);
      await goToTasks(page);

      await check(await isVisible(page, t2v2), 'Updated text still visible after sync');

      const todos = await fetchTodosFromServer(page);
      await check(!!todos?.find(t => t.text === t2v2), 'Updated text synced to server');
      await check(!todos?.some(t => t.text === t2),    'Old text no longer on server');
    } catch (err) {
      fail('Test 2 error', err.message);
    }
    console.log();

    // ──────────────────────────────────────────────────────────────────
    // Test 3: Delete task offline → sync → verify gone from server
    // ──────────────────────────────────────────────────────────────────
    console.log('🗑️  Test 3: Delete task offline → sync online');
    try {
      const t3 = `[E2E] Delete me ${ts}`;

      // Create online so there's a server record to delete
      await context.setOffline(false);
      await addTask(page, t3);
      await page.waitForTimeout(1000);

      await context.setOffline(true);
      await page.waitForTimeout(300);

      await deleteTask(page, t3);

      await check(!await isVisible(page, t3), 'Task removed from UI while offline');

      await goOnlineAndSync(page, context);
      await goToTasks(page);

      await check(!await isVisible(page, t3), 'Task still absent after sync');

      const todos = await fetchTodosFromServer(page);
      await check(!todos?.some(t => t.text === t3), 'Task deleted from server after sync');
    } catch (err) {
      fail('Test 3 error', err.message);
    }
    console.log();

    // ──────────────────────────────────────────────────────────────────
    // Test 4: Complete task offline → sync → visible in Show Completed
    // ──────────────────────────────────────────────────────────────────
    console.log('✓  Test 4: Complete task offline → sync online');
    try {
      const t4 = `[E2E] Complete me ${ts}`;

      await context.setOffline(false);
      await addTask(page, t4);
      await page.waitForTimeout(1000);

      await context.setOffline(true);
      await page.waitForTimeout(300);

      await completeTask(page, t4);

      // Completed tasks are removed from the active list
      await check(!await isVisible(page, t4),
        'Completed task disappears from active list while offline');

      await goOnlineAndSync(page, context);
      await goToTasks(page);

      // Show completed section
      const showBtn = page.getByRole('button', { name: /Show Completed/ });
      if (await showBtn.count() > 0) {
        await showBtn.click();
        await page.waitForTimeout(400);
        await check(await isVisible(page, t4),
          'Completed task appears in "Show Completed" section after sync');
      } else {
        fail('No "Show Completed" button found — cannot verify completed task');
      }
    } catch (err) {
      fail('Test 4 error', err.message);
    }
    console.log();

    // ──────────────────────────────────────────────────────────────────
    // Test 5: Write journal entry offline → sync → verify on server
    // ──────────────────────────────────────────────────────────────────
    console.log('📔 Test 5: Write journal entry offline → sync online');
    try {
      await page.getByRole('button', { name: 'Journal', exact: true }).nth(0).click();
      await page.waitForTimeout(500);

      await context.setOffline(true);
      await page.waitForTimeout(300);

      const journalText = `[E2E] Offline journal ${ts}`;
      await page.locator('textarea[aria-label="Journal entry"]').fill(journalText);

      // Auto-save fires after 2 s of inactivity — wait 2.5 s + buffer
      await page.waitForTimeout(2800);

      const savedOfflineStatus = await page.locator('text=Saved offline')
        .or(page.locator('text=Saved (offline mode)')).count() > 0;
      await check(savedOfflineStatus, 'Save status shows "Saved offline" while offline');

      await goOnlineAndSync(page, context);

      const today = new Date();
      const dateStr = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('-');

      const journalSynced = await page.evaluate(async ({ date, text }) => {
        try {
          const resp = await fetch(`/journals?date=${date}`);
          if (!resp.ok) return false;
          const entry = await resp.json();
          return entry?.text === text;
        } catch { return false; }
      }, { date: dateStr, text: journalText });
      await check(journalSynced, 'Journal entry synced to server with correct text');
    } catch (err) {
      fail('Test 5 error', err.message);
    }
    console.log();

    // ──────────────────────────────────────────────────────────────────
    // Test 6: Data created online is accessible when offline
    // ──────────────────────────────────────────────────────────────────
    console.log('📡 Test 6: Online data stays accessible when going offline');
    try {
      await goToTasks(page);
      await context.setOffline(false);
      await page.waitForTimeout(800);

      const t6 = `[E2E] Online task ${ts}`;
      await addTask(page, t6);
      await page.waitForTimeout(1000); // let SW cache the response

      await check(await isVisible(page, t6), 'Task visible while online');

      // Go offline — IndexedDB should serve the task
      await context.setOffline(true);
      await page.waitForTimeout(500);

      await check(await isVisible(page, t6),
        'Online task still visible after going offline (served from IndexedDB)');

      await context.setOffline(false);
    } catch (err) {
      fail('Test 6 error', err.message);
    }
    console.log();

    // ──────────────────────────────────────────────────────────────────
    // Test 7: Multiple offline ops sync together in one batch
    // ──────────────────────────────────────────────────────────────────
    console.log('🔄 Test 7: Multiple offline operations sync together');
    try {
      await goToTasks(page);
      await context.setOffline(false);
      await page.waitForTimeout(500);

      const t7a    = `[E2E] Multi-A ${ts}`;
      const t7aNew = `[E2E] Multi-A-Updated ${ts}`;
      const t7b    = `[E2E] Multi-B ${ts}`;
      const t7c    = `[E2E] Multi-C-Created ${ts}`;

      // Two tasks online to start
      await addTask(page, t7a);
      await addTask(page, t7b);
      await page.waitForTimeout(1000);

      // Go offline: update A, delete B, create C
      await context.setOffline(true);
      await page.waitForTimeout(300);

      await updateTaskText(page, t7a, t7aNew);
      await deleteTask(page, t7b);
      await addTask(page, t7c);

      await goOnlineAndSync(page, context);
      await goToTasks(page);

      const todos = await fetchTodosFromServer(page);

      await check(!!todos?.find(t => t.text === t7aNew),
        'Renamed task (A→A-Updated) synced to server');
      await check(!todos?.some(t => t.text === t7a || t.text === t7b),
        'Original A and deleted B no longer on server');
      const t7cEntry = todos?.find(t => t.text === t7c);
      await check(!!t7cEntry && !t7cEntry._id.startsWith('offline_'),
        'New offline-created task (C) synced with real server ID');
    } catch (err) {
      fail('Test 7 error', err.message);
    }
    console.log();

  } catch (err) {
    console.error('\n💥 Fatal setup error:', err.message);
    failed++;
  } finally {
    // Always restore online before closing
    await context.setOffline(false);

    console.log('─'.repeat(55));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failedChecks.length > 0) {
      console.log('\nFailed checks:');
      failedChecks.forEach(e => console.log(`  • ${e}`));
    }
    console.log(
      '\n⚠️  Note: test tasks created during this run ([E2E] prefix) remain\n' +
      '   in your account. Delete them manually or via the app if needed.'
    );

    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
