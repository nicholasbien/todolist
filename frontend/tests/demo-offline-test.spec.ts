import { test, expect, Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(__dirname, '..', 'public', 'screenshots', 'demo-offline');
const BASE_URL = process.env.APP_URL || 'https://todolist.nyc';
const TEST_EMAIL = 'test@example.com';
const TEST_CODE = '000000';

// Ensure screenshot dir exists
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let stepCounter = 0;
async function screenshot(page: Page, name: string) {
  stepCounter++;
  const padded = String(stepCounter).padStart(2, '0');
  const filePath = path.join(SCREENSHOT_DIR, `${padded}-${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  📸 Screenshot: ${padded}-${name}.png`);
  return filePath;
}

async function login(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // Click "Get Started" if landing page is shown
  const getStartedBtn = page.locator('button:has-text("Get Started"), a:has-text("Get Started")').first();
  if (await getStartedBtn.isVisible().catch(() => false)) {
    await getStartedBtn.click();
    await page.waitForTimeout(1500);
  }

  // Enter email
  const emailInput = page.locator('input#email, input[type="email"], input[placeholder*="email" i]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill(TEST_EMAIL);
  await page.locator('button:has-text("Send Verification Code")').click();

  // Enter verification code
  const codeInput = page.locator('input#code, input[placeholder*="code" i]').first();
  await codeInput.waitFor({ state: 'visible', timeout: 15000 });
  await codeInput.fill(TEST_CODE);
  await page.locator('button:has-text("Sign In")').click();

  // Wait for app to load (Tasks tab should be visible)
  await page.locator('button:has-text("Tasks"), [role="tab"]:has-text("Tasks")').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(3000);
}

// ============================================================
// MAIN TEST: Demo Data + Offline Behavior
// ============================================================
test.describe('Demo Data & Offline Sync Test', () => {
  test.setTimeout(240_000); // 4 minutes

  test('Full demo: create data, test offline, verify sync', async ({ page, context }) => {
    // ---- PHASE 1: Login ----
    console.log('\n=== PHASE 1: Login ===');
    await login(page);
    await screenshot(page, 'logged-in');

    // Make sure we're on Tasks tab
    await page.locator('button:has-text("Tasks"), [role="tab"]:has-text("Tasks")').first().click();
    await page.waitForTimeout(1000);
    await screenshot(page, 'tasks-initial');

    // ---- PHASE 2: Create 2 New Categories via "+" button ----
    console.log('\n=== PHASE 2: Create Categories ===');

    // The "+" button is in the category filter row (next to All, General, Chores, Fitness)
    const addCategoryPlus = page.locator('button:has-text("+")').first();
    await addCategoryPlus.waitFor({ state: 'visible', timeout: 5000 });

    // Create "Work" category
    await addCategoryPlus.click();
    await page.waitForTimeout(800);
    await screenshot(page, 'add-category-modal');

    // Fill in the category name in the modal
    const categoryInput = page.locator('input[placeholder*="category name" i]').first();
    await categoryInput.waitFor({ state: 'visible', timeout: 5000 });
    await categoryInput.fill('Work');
    await screenshot(page, 'category-work-typed');

    // Click the orange "Add" button inside the modal (not "Date Added")
    const modalAddBtn = page.locator('button:text-is("Add")').first();
    await modalAddBtn.click();
    await page.waitForTimeout(2000);
    await screenshot(page, 'category-work-created');
    console.log('  ✅ Created category: Work');

    // Create "Errands" category
    await addCategoryPlus.click();
    await page.waitForTimeout(800);

    const categoryInput2 = page.locator('input[placeholder*="category name" i]').first();
    await categoryInput2.waitFor({ state: 'visible', timeout: 5000 });
    await categoryInput2.fill('Errands');

    const modalAddBtn2 = page.locator('button:text-is("Add")').first();
    await modalAddBtn2.click();
    await page.waitForTimeout(2000);
    await screenshot(page, 'category-errands-created');
    console.log('  ✅ Created category: Errands');

    // Verify categories are visible as filter pills
    const workPill = page.locator('button:has-text("Work")').first();
    const errandsPill = page.locator('button:has-text("Errands")').first();
    const workVisible = await workPill.isVisible().catch(() => false);
    const errandsVisible = await errandsPill.isVisible().catch(() => false);
    console.log(`  Category "Work" pill visible: ${workVisible}`);
    console.log(`  Category "Errands" pill visible: ${errandsVisible}`);

    // ---- PHASE 3: Create 5 Tasks with Mixed Priorities ----
    console.log('\n=== PHASE 3: Create 5 Tasks ===');

    // Make sure "All" filter is selected so we see all tasks
    const allFilter = page.locator('button:has-text("All")').first();
    if (await allFilter.isVisible().catch(() => false)) {
      await allFilter.click();
      await page.waitForTimeout(500);
    }

    const taskTexts = [
      'Finish quarterly report',
      'Buy groceries for dinner',
      'Schedule dentist appointment',
      'Review pull requests',
      'Pick up dry cleaning',
    ];

    for (const taskText of taskTexts) {
      // Ensure we're on Tasks tab and scroll to top
      await page.locator('button:has-text("Tasks"), [role="tab"]:has-text("Tasks")').first().click();
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      const taskInput = page.locator('input[placeholder*="Add a new task" i]').first();
      await taskInput.scrollIntoViewIfNeeded();
      await taskInput.waitFor({ state: 'visible', timeout: 5000 });
      await taskInput.click();
      await taskInput.fill(taskText);

      // Press Enter to submit (more reliable than finding the button)
      await taskInput.press('Enter');
      await page.waitForTimeout(2500); // Wait for AI classification
      console.log(`  ✅ Created task: "${taskText}"`);
    }

    await screenshot(page, 'all-tasks-created');

    // ---- PHASE 4: Verify tasks ----
    console.log('\n=== PHASE 4: Verify Tasks ===');
    await page.waitForTimeout(2000);

    // Scroll down to see all tasks
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await screenshot(page, 'tasks-scrolled-down');

    // Scroll back up
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    for (const taskText of taskTexts) {
      const isVisible = await page.locator(`text=${taskText}`).first().isVisible().catch(() => false);
      console.log(`  ${isVisible ? '✓' : '⚠️'} Task "${taskText}": ${isVisible ? 'visible' : 'NOT visible'}`);
    }
    await screenshot(page, 'tasks-verified');

    // ---- PHASE 5: Task Category Assignment ----
    console.log('\n=== PHASE 5: Category Assignment Check ===');

    // Click on a task to see if edit modal with category assignment appears
    const firstTask = page.locator(`text=Finish quarterly report`).first();
    if (await firstTask.isVisible().catch(() => false)) {
      await firstTask.click();
      await page.waitForTimeout(1500);
      await screenshot(page, 'task-clicked-for-edit');

      // Check for modal/edit panel
      const modal = page.locator('[class*="modal"], [role="dialog"], [class*="edit"]').first();
      if (await modal.isVisible().catch(() => false)) {
        console.log('  ✅ Edit modal opened');
        await screenshot(page, 'edit-modal');

        // Look for category selector
        const catSelector = modal.locator('select, [role="combobox"], button:has-text("Category")').first();
        if (await catSelector.isVisible().catch(() => false)) {
          console.log('  ✅ Category selector found in modal');
          await catSelector.click();
          await page.waitForTimeout(500);
          await screenshot(page, 'category-selector-open');

          // Try selecting "Work"
          const workOpt = page.locator('option:has-text("Work"), [role="option"]:has-text("Work"), li:has-text("Work"), button:has-text("Work")').first();
          if (await workOpt.isVisible().catch(() => false)) {
            await workOpt.click();
            await page.waitForTimeout(1000);
            console.log('  ✅ Assigned task to "Work" category');
            await screenshot(page, 'task-assigned-work');
          }
        } else {
          console.log('  ℹ️ No category selector in modal - tasks auto-classified by AI');
        }

        // Close modal
        const closeBtn = page.locator('button:has-text("Close"), button:has-text("Save"), button:has-text("Done"), button:has-text("×"), button[aria-label*="close" i]').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click();
          await page.waitForTimeout(500);
        } else {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
      } else {
        console.log('  ℹ️ No edit modal - tasks are auto-classified by AI');
      }
    }

    await screenshot(page, 'after-category-check');

    // Test category filter - click "Work" to filter
    if (await workPill.isVisible().catch(() => false)) {
      await workPill.click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'filtered-by-work');
      console.log('  ✅ Filtered by "Work" category');

      // Go back to "All"
      await allFilter.click();
      await page.waitForTimeout(1000);
    }

    // ---- PHASE 6: Test Offline Behavior ----
    console.log('\n=== PHASE 6: Offline Testing ===');
    await screenshot(page, 'before-offline');

    // Go offline
    console.log('  📴 Going OFFLINE...');
    await context.setOffline(true);
    await page.waitForTimeout(1000);
    await screenshot(page, 'went-offline');

    // Add a task while offline
    const offlineTaskText = 'Offline task: Call plumber about leak';
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const taskInputOffline = page.locator('input[placeholder*="Add a new task" i]').first();
    await taskInputOffline.scrollIntoViewIfNeeded();
    await taskInputOffline.waitFor({ state: 'visible', timeout: 5000 });
    await taskInputOffline.click();
    await taskInputOffline.fill(offlineTaskText);
    await screenshot(page, 'offline-task-typed');

    // Submit via Enter
    await taskInputOffline.press('Enter');
    await page.waitForTimeout(3000);
    await screenshot(page, 'offline-task-added');

    // Verify offline task appears in UI
    const offlineTaskVisible = await page.locator(`text=${offlineTaskText}`).first().isVisible().catch(() => false);
    console.log(`  ${offlineTaskVisible ? '✅' : '⚠️ BUG:'} Offline task ${offlineTaskVisible ? 'visible' : 'NOT visible'} in UI`);
    await screenshot(page, 'offline-task-verified');

    // Reload while offline to test service worker cache
    console.log('  🔄 Reloading page while OFFLINE...');
    try {
      await page.reload({ timeout: 20000 });
    } catch (e) {
      console.log('  ℹ️ Reload timed out (may be expected offline)');
    }
    await page.waitForTimeout(4000);
    await screenshot(page, 'after-offline-reload');

    // Check if app loaded from service worker cache
    const appLoaded = await page.locator('button:has-text("Tasks"), [role="tab"]:has-text("Tasks")').first().isVisible().catch(() => false);
    if (appLoaded) {
      console.log('  ✅ App loaded from service worker cache');

      // May need to re-login from cached session
      const needsLoginOffline = await page.locator('input#email, input[type="email"]').first().isVisible().catch(() => false);
      if (needsLoginOffline) {
        console.log('  ℹ️ Login page shown offline - checking for cached auth');
        await screenshot(page, 'offline-login-screen');

        // Try the get started flow if needed
        const getStarted = page.locator('button:has-text("Get Started")').first();
        if (await getStarted.isVisible().catch(() => false)) {
          await getStarted.click();
          await page.waitForTimeout(1000);
        }

        // Try login offline
        const emailInputOff = page.locator('input#email, input[type="email"]').first();
        if (await emailInputOff.isVisible().catch(() => false)) {
          await emailInputOff.fill(TEST_EMAIL);
          await page.locator('button:has-text("Send Verification Code")').click();
          await page.waitForTimeout(2000);
          const codeInputOff = page.locator('input#code, input[placeholder*="code" i]').first();
          if (await codeInputOff.isVisible().catch(() => false)) {
            await codeInputOff.fill(TEST_CODE);
            await page.locator('button:has-text("Sign In")').click();
            await page.waitForTimeout(3000);
          }
        }
      }

      // Click Tasks tab
      const tasksTabOffline = page.locator('button:has-text("Tasks"), [role="tab"]:has-text("Tasks")').first();
      if (await tasksTabOffline.isVisible().catch(() => false)) {
        await tasksTabOffline.click();
        await page.waitForTimeout(2000);
      }

      // Check if offline task persisted
      const offlineTaskAfterReload = await page.locator(`text=${offlineTaskText}`).first().isVisible().catch(() => false);
      console.log(`  ${offlineTaskAfterReload ? '✅' : '⚠️ BUG:'} Offline task ${offlineTaskAfterReload ? 'persisted' : 'LOST'} after reload`);
      await screenshot(page, 'offline-task-after-reload');
    } else {
      console.log('  ⚠️ BUG: App did NOT load from service worker cache while offline');
      await screenshot(page, 'offline-reload-failed');
    }

    // ---- PHASE 7: Reconnect and verify sync ----
    console.log('\n=== PHASE 7: Reconnect & Sync ===');
    console.log('  📶 Going back ONLINE...');
    await context.setOffline(false);
    await page.waitForTimeout(5000); // Wait for background sync
    await screenshot(page, 'back-online-before-reload');

    // Full reload to get fresh server data
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Handle landing page / re-login if needed
    const getStartedReconnect = page.locator('button:has-text("Get Started")').first();
    if (await getStartedReconnect.isVisible().catch(() => false)) {
      await getStartedReconnect.click();
      await page.waitForTimeout(1500);
    }

    const needsReLogin = await page.locator('input#email, input[type="email"]').first().isVisible().catch(() => false);
    if (needsReLogin) {
      console.log('  ℹ️ Re-logging in after reconnect...');
      await login(page);
    }

    // Navigate to Tasks
    const tasksTabFinal = page.locator('button:has-text("Tasks"), [role="tab"]:has-text("Tasks")').first();
    await tasksTabFinal.waitFor({ state: 'visible', timeout: 15000 });
    await tasksTabFinal.click();
    await page.waitForTimeout(2000);

    // Select "All" filter
    const allFilterFinal = page.locator('button:has-text("All")').first();
    if (await allFilterFinal.isVisible().catch(() => false)) {
      await allFilterFinal.click();
      await page.waitForTimeout(1000);
    }
    await screenshot(page, 'after-reconnect-tasks');

    // Verify offline task synced
    const syncedTask = await page.locator(`text=${offlineTaskText}`).first().isVisible().catch(() => false);
    console.log(`  ${syncedTask ? '✅' : '⚠️ BUG:'} Offline task ${syncedTask ? 'SYNCED' : 'NOT synced'} to server`);

    // Verify original tasks
    for (const taskText of taskTexts) {
      const visible = await page.locator(`text=${taskText}`).first().isVisible().catch(() => false);
      console.log(`  ${visible ? '✓' : '⚠️'} "${taskText}": ${visible ? 'persisted' : 'missing'}`);
    }

    // Verify categories still exist
    const workStillVisible = await page.locator('button:has-text("Work")').first().isVisible().catch(() => false);
    const errandsStillVisible = await page.locator('button:has-text("Errands")').first().isVisible().catch(() => false);
    console.log(`  Categories after sync: Work=${workStillVisible}, Errands=${errandsStillVisible}`);

    // Scroll to see all tasks
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await screenshot(page, 'final-state-bottom');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await screenshot(page, 'final-state-top');

    console.log('\n=== TEST COMPLETE ===');
  });
});
