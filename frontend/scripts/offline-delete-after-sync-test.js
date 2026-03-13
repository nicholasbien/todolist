/**
 * Playwright E2E test: offline delete after sync.
 *
 * Reproduces the bug where creating a todo offline, syncing online,
 * then going offline and deleting it would fail because React state
 * still held the stale offline_ ID.
 *
 * Requires both backend and frontend servers to be running:
 *   cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8141 --reload
 *   cd frontend && npm run dev
 *
 * Run:
 *   node scripts/offline-delete-after-sync-test.js
 */

const path = require('path');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://localhost:3141';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8141';
const EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const CODE = process.env.TEST_CODE || '000000';
const UNIQUE_TAG = `del-sync-${Date.now()}`;

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

  if (await page.isVisible('input#firstName')) {
    await page.fill('input#firstName', 'Test');
    await page.click('button:has-text("Continue")');
  }

  await page.waitForSelector('text=Tasks', { timeout: 20000 });
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

async function getTodoIdsFromIndexedDB(page) {
  return page.evaluate(() => {
    return new Promise((resolve) => {
      indexedDB.databases().then(databases => {
        const userDbs = databases.filter(db => db.name && db.name.startsWith('TodoUserDB_'));
        if (userDbs.length === 0) { resolve([]); return; }
        const dbReq = indexedDB.open(userDbs[0].name);
        dbReq.onsuccess = () => {
          const db = dbReq.result;
          if (!db.objectStoreNames.contains('todos')) { db.close(); resolve([]); return; }
          const tx = db.transaction(['todos'], 'readonly');
          const getAll = tx.objectStore('todos').getAll();
          getAll.onsuccess = () => {
            db.close();
            resolve(getAll.result.map(t => ({ _id: t._id, text: t.text })));
          };
        };
        dbReq.onerror = () => resolve([]);
      });
    });
  });
}

(async () => {
  console.log('🔧 Offline Delete After Sync Test');
  console.log(`   App: ${APP_URL}  Backend: ${BACKEND_URL}\n`);

  const userDataDir = path.join(__dirname, '../../.pw-offline-profile');
  const browser = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = await browser.newPage();
  let token, spaceId;
  const todoText = `Offline delete test - ${UNIQUE_TAG}`;

  try {
    // ── Sign in ─────────────────────────────────
    console.log('1️⃣  Signing in...');
    await signIn(page);
    token = await getAuthToken();
    spaceId = await getSpaceId(token);
    console.log('   Signed in.\n');

    // ── Step 2: Go offline and create todo ──────
    console.log('2️⃣  Going offline and creating todo...');
    await page.context().setOffline(true);
    await page.waitForTimeout(500);

    await addTodoViaUI(page, todoText);

    const offlineContent = await page.content();
    assert(offlineContent.includes(todoText), 'Offline todo visible in UI');

    // Verify it has an offline_ ID in IndexedDB
    const idbAfterCreate = await getTodoIdsFromIndexedDB(page);
    const offlineTodo = idbAfterCreate.find(t => t.text === todoText);
    assert(offlineTodo && offlineTodo._id.startsWith('offline_'), `Todo has offline ID: ${offlineTodo?._id}`);

    // ── Step 3: Go online — sync ────────────────
    console.log('3️⃣  Going online to sync...');
    await page.context().setOffline(false);
    await page.waitForTimeout(3000); // Wait for sync + SYNC_COMPLETE refresh

    // Verify offline ID replaced with server ID
    const idbAfterSync = await getTodoIdsFromIndexedDB(page);
    const syncedTodo = idbAfterSync.find(t => t.text === todoText);
    assert(syncedTodo && !syncedTodo._id.startsWith('offline_'), `Todo synced with server ID: ${syncedTodo?._id}`);

    // Verify server has it
    const serverTodos = await getServerTodos(token, spaceId);
    const serverTodo = serverTodos.find(t => t.text === todoText);
    assert(serverTodo !== undefined, 'Todo exists on server after sync');

    // ── Step 4: Go offline and delete ───────────
    console.log('4️⃣  Going offline and deleting todo...');
    await page.context().setOffline(true);
    await page.waitForTimeout(500);

    // Find the todo row and click delete
    const todoRow = page.locator(`text="${todoText}"`).locator('xpath=ancestor::div[.//button]').first();
    const deleteBtn = todoRow.getByRole('button', { name: /delete/i }).first();

    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);

      const afterDelete = await page.content();
      assert(!afterDelete.includes(todoText), 'Todo removed from UI after offline delete');

      // Verify removed from IndexedDB
      const idbAfterDelete = await getTodoIdsFromIndexedDB(page);
      const deletedTodo = idbAfterDelete.find(t => t.text === todoText);
      assert(deletedTodo === undefined, 'Todo removed from IndexedDB after offline delete');
    } else {
      assert(false, 'Delete button not found for synced todo');
    }

    // ── Step 5: Go online — sync delete ─────────
    console.log('5️⃣  Going online to sync delete...');
    await page.context().setOffline(false);
    await page.waitForTimeout(3000);

    // Verify deleted from server
    const finalServerTodos = await getServerTodos(token, spaceId);
    const deletedOnServer = finalServerTodos.find(t => t.text === todoText);
    assert(deletedOnServer === undefined, 'Todo deleted from server after sync');

    // ── Cleanup ─────────────────────────────────
    if (serverTodo && deletedOnServer) {
      await deleteServerTodo(token, serverTodo._id);
    }

    // ── Results ─────────────────────────────────
    console.log('\n' + '─'.repeat(40));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.log('\n💥 TEST FAILED');
      process.exitCode = 1;
    } else {
      console.log('\n🎉 ALL TESTS PASSED');
    }
  } catch (err) {
    console.error('\n💥 Test crashed:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
