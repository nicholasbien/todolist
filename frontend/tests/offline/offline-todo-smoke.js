const path = require('path');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const CODE = process.env.TEST_CODE || '000000';

(async () => {
  const userDataDir = path.join(__dirname, '../../.pw-offline-profile');
  const browser = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = await browser.newPage();

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.fill('input#email', EMAIL);
  await page.click('button:has-text("Send Verification Code")');
  await page.waitForSelector('input#code', { timeout: 20000 });
  await page.fill('input#code', CODE);
  await page.waitForSelector('button:has-text("Sign In")', { state: 'visible', timeout: 20000 });
  await page.click('button:has-text("Sign In")');

  // Some accounts require a first-name step on first login.
  if (await page.isVisible('input#firstName')) {
    await page.fill('input#firstName', 'Test');
    await page.click('button:has-text("Continue")');
  }

  await page.waitForSelector('text=Tasks', { timeout: 20000 });

  await page.context().setOffline(true);
  await page.waitForTimeout(1000);
  await page.fill('input[placeholder*="Add"], input[placeholder*="add"], input[placeholder*="task"], input[placeholder*="Task"]', 'Offline todo - smoke');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(__dirname, '../../public/screenshots/offline-todo-created.png'), fullPage: true });

  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, '../../public/screenshots/offline-todo-after-reload.png'), fullPage: true });

  await page.context().setOffline(false);
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(__dirname, '../../public/screenshots/offline-todo-after-reconnect.png'), fullPage: true });

  await browser.close();
})();
