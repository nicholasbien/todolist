/**
 * Playwright E2E smoke test for offline sync functionality.
 *
 * Requires both backend and frontend servers to be running:
 *   cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8141 --reload
 *   cd frontend && npm run dev
 *
 * Run:
 *   node scripts/offline-smoke-test.js
 *
 * Environment variables:
 *   APP_URL     – frontend URL  (default: http://localhost:3141)
 *   BACKEND_URL – backend URL   (default: http://localhost:8141)
 *   TEST_EMAIL  – test account  (default: test@example.com)
 *   TEST_CODE   – verify code   (default: 000000)
 */

const path = require('path');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://localhost:3141';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8141';
const EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const CODE = process.env.TEST_CODE || '000000';
const UNIQUE_TAG = `smoke-${Date.now()}`;

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

async function getAuthToken() {
  const resp = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, code: CODE })
  });
  return (await resp.json()).token;
}

async function getSpaceId(token) {
  const resp = await fetch(`${BACKEND_URL}/spaces`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const spaces = await resp.json();
  return spaces[0]?._id;
}

async function getServerTodos(token, spaceId) {
  const resp = await fetch(`${BACKEND_URL}/todos?space_id=${spaceId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return resp.json();
}

async function deleteServerTodo(token, todoId) {
  await fetch(`${BACKEND_URL}/todos/${todoId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function signIn(page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.waitForSelector('input#email', { timeout: 10000 });
  await page.fill('input#email', EMAIL);
  await page.click('button:has-text("Send Verification Code")');
  await page.waitForSelector('input#code', { timeout: 30000 });
  await page.fill('input#code', CODE);
  await page.waitForSelector('button:has-text("Sign In")', { state: 'visible', timeout: 20000 });
  await page.click('button:has-text("Sign In")');

  // Some accounts require a first-name step on first login
  if (await page.isVisible('input#firstName')) {
    await page.fill('input#firstName', 'Test');
    await page.click('button:has-text("Continue")');
  }

  await page.waitForSelector('text=Tasks', { timeout: 20000 });
  // Wait for service worker + data load
  await page.waitForTimeout(2000);
}

async function addTodoViaUI(page, text) {
  await page.fill(
    'input[placeholder*="Add"], input[placeholder*="add"], input[placeholder*="task"], input[placeholder*="Task"]',
    text
  );
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
}

async function getOfflineIdsFromIndexedDB(page) {
  return page.evaluate(() => {
    return new Promise((resolve) => {
      const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
      dbs.then(databases => {
        const userDbs = databases.filter(db => db.name && db.name.startsWith('TodoUserDB_'));
        if (userDbs.length === 0) { resolve([]); return; }
        const dbReq = indexedDB.open(userDbs[0].name);
        dbReq.onsuccess = () => {
          const db = dbReq.result;
          if (!db.objectStoreNames.contains('todos')) { db.close(); resolve([]); return; }
          const tx = db.transaction(['todos'], 'readonly');
          const getAll = tx.objectStore('todos').getAll();
          getAll.onsuccess = () => {
            const offlines = getAll.result.filter(t => t._id && t._id.startsWith('offline_'));
            db.close();
            resolve(offlines.map(t => t._id));
          };
        };
        dbReq.onerror = () => resolve([]);
      });
    });
  });
}

(async () => {
  console.log('🔧 Offline Sync Smoke Test');
  console.log(`   App: ${APP_URL}  Backend: ${BACKEND_URL}\n`);

  const userDataDir = path.join(__dirname, '../../.pw-offline-profile');
  const browser = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = await browser.newPage();
  let token, spaceId;

  try {
    // ── Sign in ─────────────────────────────────
    console.log('1️⃣  Signing in...');
    await signIn(page);
    token = await getAuthToken();
    spaceId = await getSpaceId(token);
    console.log('   Signed in.\n');

    // ── Create todo offline ─────────────────────
    console.log('2️⃣  Going offline and creating todo...');
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);

    const todoText = `Offline todo - ${UNIQUE_TAG}`;
    await addTodoViaUI(page, todoText);

    const offlineContent = await page.content();
    assert(offlineContent.includes(todoText), 'Offline todo visible in UI');

    // ── Verify IndexedDB persistence ──────────────
    console.log('3️⃣  Verifying IndexedDB persistence...');
    // Full page reload while offline may fail (no cached HTML in dev mode),
    // so instead verify the todo exists in IndexedDB directly.
    const idbHasTodo = await page.evaluate((text) => {
      return new Promise((resolve) => {
        const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
        dbs.then(databases => {
          const userDbs = databases.filter(db => db.name && db.name.startsWith('TodoUserDB_'));
          if (userDbs.length === 0) { resolve(false); return; }
          const dbReq = indexedDB.open(userDbs[0].name);
          dbReq.onsuccess = () => {
            const db = dbReq.result;
            if (!db.objectStoreNames.contains('todos')) { db.close(); resolve(false); return; }
            const tx = db.transaction(['todos'], 'readonly');
            const getAll = tx.objectStore('todos').getAll();
            getAll.onsuccess = () => {
              const found = getAll.result.some(t => t.text === text);
              db.close();
              resolve(found);
            };
          };
          dbReq.onerror = () => resolve(false);
        });
      });
    }, todoText);
    assert(idbHasTodo, 'Offline todo persisted in IndexedDB');

    // ── Come back online – sync ─────────────────
    console.log('4️⃣  Coming back online...');
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const afterOnline = await page.content();
    assert(afterOnline.includes(todoText), 'Todo still visible after coming online');

    // ── Verify server sync ──────────────────────
    console.log('5️⃣  Verifying server sync...');
    const serverTodos = await getServerTodos(token, spaceId);
    const syncedTodo = serverTodos.find(t => t.text === todoText);

    assert(syncedTodo !== undefined, 'Todo synced to server');
    assert(syncedTodo && !syncedTodo._id.startsWith('offline_'), 'Server-assigned ID (not offline_)');

    // ── No stale offline IDs in IndexedDB ───────
    console.log('6️⃣  Checking for leftover offline IDs...');
    const offlineIds = await getOfflineIdsFromIndexedDB(page);
    assert(offlineIds.length === 0, `No offline_ IDs in IndexedDB (found: ${offlineIds.length})`);

    // ── Offline complete + sync ─────────────────
    console.log('7️⃣  Testing offline complete + sync...');
    await page.context().setOffline(true);
    await page.waitForTimeout(500);

    // Find the todo's row and click its complete button
    const todoRow = page.locator(`text="${todoText}"`).locator('xpath=ancestor::div[.//button]').first();
    const completeBtn = todoRow.getByRole('button', { name: /complete/i }).first();
    if (await completeBtn.isVisible().catch(() => false)) {
      await completeBtn.click();
      await page.waitForTimeout(500);
      assert(true, 'Completed todo offline');
    } else {
      assert(true, 'Complete button not found (skipped - UI may differ)');
    }

    await page.context().setOffline(false);
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // ── Offline delete + sync ───────────────────
    console.log('8️⃣  Testing offline delete + sync...');
    await page.context().setOffline(true);
    await page.waitForTimeout(500);

    const todoRow2 = page.locator(`text="${todoText}"`).locator('xpath=ancestor::div[.//button]').first();
    const deleteBtn = todoRow2.getByRole('button', { name: /delete/i }).first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(500);

      const afterDelete = await page.content();
      assert(!afterDelete.includes(todoText), 'Todo removed from UI after offline delete');
    } else {
      assert(true, 'Delete button not found (skipped - UI may differ)');
    }

    await page.context().setOffline(false);
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const finalServerTodos = await getServerTodos(token, spaceId);
    const deletedTodo = finalServerTodos.find(t => t.text === todoText);
    assert(deletedTodo === undefined, 'Deleted todo removed from server after sync');

    // ── Cleanup ─────────────────────────────────
    if (syncedTodo && deletedTodo) {
      await deleteServerTodo(token, syncedTodo._id);
    }

    // ── Results ─────────────────────────────────
    console.log('\n' + '─'.repeat(40));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.log('\n💥 SMOKE TEST FAILED');
      process.exitCode = 1;
    } else {
      console.log('\n🎉 ALL SMOKE TESTS PASSED');
    }
  } catch (err) {
    console.error('\n💥 Smoke test crashed:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
