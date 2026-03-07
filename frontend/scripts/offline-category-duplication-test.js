/**
 * Playwright E2E test: offline category duplication check.
 *
 * Requires both backend and frontend servers to be running:
 *   cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload
 *   cd frontend && npm run dev
 *
 * Run:
 *   node scripts/offline-category-duplication-test.js
 *
 * Environment variables:
 *   APP_URL     – frontend URL  (default: http://localhost:3000)
 *   BACKEND_URL – backend URL   (default: http://localhost:8000)
 *   TEST_EMAIL  – test account  (default: test@example.com)
 *   TEST_CODE   – verify code   (default: 000000)
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const CODE = process.env.TEST_CODE || '000000';

const SCREENSHOT_DIR = path.join(__dirname, '../public/screenshots');
const CATEGORY_NAME = 'OfflineCat';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function screenshot(page, label) {
  const file = path.join(SCREENSHOT_DIR, `${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`📸 Saved ${file}`);
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

async function openAddCategoryModal(page) {
  // Find the category bar by the presence of the "General" category button.
  const categoryBar = page.locator('div', { has: page.getByRole('button', { name: 'General' }) }).first();
  const addCategoryButton = categoryBar.getByRole('button', { name: '+' }).last();
  await addCategoryButton.click();
  await page.waitForSelector('text=Add New Category', { timeout: 10000 });
}

async function addCategory(page, name) {
  await openAddCategoryModal(page);
  await page.fill('input[placeholder="New category name"]', name);
  await page.click('button:has-text("Add")');
  await page.waitForTimeout(1000);
}

async function countCategoryButtons(page, name) {
  const buttons = page.getByRole('button', { name });
  return await buttons.count();
}

(async () => {
  console.log('🔧 Offline Category Duplication Test');
  console.log(`   App: ${APP_URL}  Backend: ${BACKEND_URL}\n`);

  ensureDir(SCREENSHOT_DIR);

  const userDataDir = path.join(__dirname, '../../.pw-offline-profile');
  const browser = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = await browser.newPage();

  try {
    // 1. Login
    console.log('1️⃣  Signing in...');
    await signIn(page);

    // 2. Create category online
    console.log('2️⃣  Creating category online...');
    await addCategory(page, CATEGORY_NAME);
    await screenshot(page, '01-online-created');

    const onlineCount = await countCategoryButtons(page, CATEGORY_NAME);
    console.log(`   Category count online: ${onlineCount}`);

    // 3. Go offline and check for duplication
    console.log('3️⃣  Going offline and checking for duplication...');
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);
    await screenshot(page, '02-offline-check');

    const offlineCount = await countCategoryButtons(page, CATEGORY_NAME);
    console.log(`   Category count offline: ${offlineCount}`);

    // 4. Reload offline and check again
    console.log('4️⃣  Reloading offline and checking again...');
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
    } catch (err) {
      console.warn('   ⚠️ Offline reload failed (dev mode may not cache HTML). Continuing...');
    }
    await screenshot(page, '03-offline-reload-check');

    const offlineReloadCount = await countCategoryButtons(page, CATEGORY_NAME);
    console.log(`   Category count offline after reload: ${offlineReloadCount}`);

    // 5. Reconnect online and verify
    console.log('5️⃣  Reconnecting online and verifying...');
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await screenshot(page, '04-online-reconnected');

    const onlineReloadCount = await countCategoryButtons(page, CATEGORY_NAME);
    console.log(`   Category count after reconnect: ${onlineReloadCount}`);

    console.log('\n✅ Test complete. Review screenshots and counts above.');
  } catch (err) {
    console.error('\n💥 Test crashed:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
