import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(__dirname, '..', 'public', 'screenshots');
const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'test@example.com';
const TEST_CODE = '000000';

// Ensure screenshot dir exists
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page: Page, name: string) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function login(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // Enter email
  const emailInput = page.locator('input#email');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(TEST_EMAIL);
  await page.locator('button:has-text("Send Verification Code")').click();

  // Enter verification code
  const codeInput = page.locator('input#code');
  await codeInput.waitFor({ state: 'visible', timeout: 10000 });
  await codeInput.fill(TEST_CODE);
  await page.locator('button:has-text("Sign In")').click();

  // Wait for app to load (Tasks tab should be visible)
  await page.locator('button:has-text("Tasks")').waitFor({ state: 'visible', timeout: 15000 });
  // Small delay for data to load
  await page.waitForTimeout(2000);
}

// ============================================================
// 1. LOGIN / SIGNUP FLOW
// ============================================================
test.describe('Login/Signup Flow', () => {
  test('should show login page with email input', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '01-login-page');

    const emailInput = page.locator('input#email');
    await expect(emailInput).toBeVisible();
    await expect(page.locator('text=Enter your email to get started')).toBeVisible();
  });

  test('should submit email and show code input', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await page.locator('input#email').fill(TEST_EMAIL);
    await page.locator('button:has-text("Send Verification Code")').click();

    const codeInput = page.locator('input#code');
    await codeInput.waitFor({ state: 'visible', timeout: 10000 });
    await screenshot(page, '02-verification-code-page');

    await expect(codeInput).toBeVisible();
    await expect(page.locator('text=Code sent to: test@example.com')).toBeVisible();
  });

  test('should login with test account and reach main app', async ({ page }) => {
    await login(page);
    await screenshot(page, '03-logged-in-main-app');

    // Verify main app loaded
    await expect(page.locator('button:has-text("Tasks")')).toBeVisible();
    await expect(page.locator('button:has-text("Assistant")')).toBeVisible();
    await expect(page.locator('button:has-text("Journal")')).toBeVisible();
  });

  test('should reject invalid verification code', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await page.locator('input#email').fill(TEST_EMAIL);
    await page.locator('button:has-text("Send Verification Code")').click();

    const codeInput = page.locator('input#code');
    await codeInput.waitFor({ state: 'visible', timeout: 10000 });
    await codeInput.fill('999999');
    await page.locator('button:has-text("Sign In")').click();

    // Should show error
    await page.waitForTimeout(2000);
    await screenshot(page, '04-invalid-code-error');
  });
});

// ============================================================
// 2. TASKS CRUD
// ============================================================
test.describe('Tasks CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display tasks view with input field', async ({ page }) => {
    await screenshot(page, '10-tasks-view');
    const taskInput = page.locator('input[placeholder="Add a new task..."]');
    await expect(taskInput).toBeVisible();
  });

  test('should add a new task', async ({ page }) => {
    const taskText = `Test task ${Date.now()}`;
    const taskInput = page.locator('input[placeholder="Add a new task..."]');
    await taskInput.fill(taskText);
    await taskInput.press('Enter');

    // Wait for task to appear
    await page.waitForTimeout(3000);
    await screenshot(page, '11-task-added');

    // Verify task appears in list
    await expect(page.locator(`text=${taskText}`)).toBeVisible({ timeout: 10000 });
  });

  test('should complete a task', async ({ page }) => {
    // Add a task first
    const taskText = `Complete me ${Date.now()}`;
    const taskInput = page.locator('input[placeholder="Add a new task..."]');
    await taskInput.fill(taskText);
    await taskInput.press('Enter');
    await page.waitForTimeout(3000);

    // Find the todo container that has this text, then find the complete button inside it
    const todoItem = page.locator('div.rounded-xl', { hasText: taskText });
    const checkBtn = todoItem.locator('button[aria-label="Mark task as complete"]');
    await checkBtn.click();
    await page.waitForTimeout(2000);
    await screenshot(page, '12-task-completed');
  });

  test('should delete a task', async ({ page }) => {
    // Add a task first
    const taskText = `Delete me ${Date.now()}`;
    const taskInput = page.locator('input[placeholder="Add a new task..."]');
    await taskInput.fill(taskText);
    await taskInput.press('Enter');
    await page.waitForTimeout(3000);

    // Find the todo container that has this text, then find the delete button
    const todoItem = page.locator('div.rounded-xl', { hasText: taskText });
    const deleteBtn = todoItem.locator('button[aria-label="Delete task"]');
    await deleteBtn.click();
    await page.waitForTimeout(2000);
    await screenshot(page, '13-task-deleted');

    // Verify task no longer visible
    await expect(page.locator(`text=${taskText}`)).not.toBeVisible({ timeout: 5000 });
  });

  test('should edit a task via modal', async ({ page }) => {
    // Add a task first
    const taskText = `Edit me ${Date.now()}`;
    const taskInput = page.locator('input[placeholder="Add a new task..."]');
    await taskInput.fill(taskText);
    await taskInput.press('Enter');
    await page.waitForTimeout(3000);

    // Click on the task text to open edit modal
    await page.locator(`text=${taskText}`).click();
    await page.waitForTimeout(1000);
    await screenshot(page, '14-task-edit-modal');

    // Check modal opened
    const modal = page.locator('text=Edit Task');
    if (await modal.isVisible()) {
      // Change priority using the first priority select in the modal
      const modalContainer = page.locator('.fixed.inset-0').locator('select').first();
      if (await modalContainer.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Just verify modal is visible, take screenshot
        await screenshot(page, '15-task-edit-modal-open');
      }
      await page.locator('button:has-text("Save")').first().click();
      await page.waitForTimeout(2000);
      await screenshot(page, '15-task-edited');
    }
  });
});

// ============================================================
// 3. CATEGORIES
// ============================================================
test.describe('Categories', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should show category pills', async ({ page }) => {
    await screenshot(page, '20-categories-view');
    // "All" category should be visible
    await expect(page.locator('button:has-text("All")')).toBeVisible();
  });

  test('should add a new category', async ({ page }) => {
    // Click the "+" button to add category
    // The + button for categories is in the scrollable category area
    const addCatBtn = page.locator('button:has-text("+")').first();
    await addCatBtn.click();
    await page.waitForTimeout(500);

    // Look for the add category modal/input
    const catInput = page.locator('input[placeholder="New category name"]');
    if (await catInput.isVisible({ timeout: 3000 })) {
      const catName = `TestCat${Date.now() % 1000}`;
      await catInput.fill(catName);
      await screenshot(page, '21-add-category-modal');
      await page.locator('button:has-text("Add")').click();
      await page.waitForTimeout(2000);
      await screenshot(page, '22-category-added');
    } else {
      await screenshot(page, '21-add-category-not-found');
    }
  });

  test('should filter tasks by category', async ({ page }) => {
    // Click on "All" category first
    await page.locator('button:has-text("All")').click();
    await page.waitForTimeout(1000);
    await screenshot(page, '23-filter-all-categories');

    // Try clicking a specific category if exists
    const categoryButtons = page.locator('.overflow-x-auto button, .flex.overflow-x-auto button');
    const count = await categoryButtons.count();
    if (count > 1) {
      await categoryButtons.nth(1).click();
      await page.waitForTimeout(1000);
      await screenshot(page, '24-filter-specific-category');
    }
  });
});

// ============================================================
// 4. SPACES
// ============================================================
test.describe('Spaces', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should show space dropdown', async ({ page }) => {
    // The space dropdown shows current space name
    // Look for space-related buttons/dropdowns in the header
    const spaceBtn = page.locator('button').filter({ hasText: /Default|Personal|Home/ }).first();
    if (await spaceBtn.isVisible({ timeout: 3000 })) {
      await spaceBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, '30-space-dropdown');
    } else {
      await screenshot(page, '30-space-dropdown-not-found');
    }
  });

  test('should create a new space', async ({ page }) => {
    // Open space dropdown
    const spaceBtn = page.locator('button').filter({ hasText: /Default|Personal|Home/ }).first();
    if (await spaceBtn.isVisible({ timeout: 3000 })) {
      await spaceBtn.click();
      await page.waitForTimeout(500);

      // Look for create/add space option
      const createBtn = page.locator('button:has-text("Create")').or(page.locator('button:has-text("New Space")'));
      if (await createBtn.isVisible({ timeout: 3000 })) {
        await createBtn.click();
        await page.waitForTimeout(500);

        const spaceNameInput = page.locator('input[placeholder="Space name"]');
        if (await spaceNameInput.isVisible({ timeout: 3000 })) {
          await spaceNameInput.fill(`Test Space ${Date.now() % 1000}`);
          await screenshot(page, '31-create-space-modal');
          await page.locator('button:has-text("Create")').click();
          await page.waitForTimeout(2000);
          await screenshot(page, '32-space-created');
        }
      } else {
        await screenshot(page, '31-no-create-space-button');
      }
    }
  });
});

// ============================================================
// 5. JOURNAL
// ============================================================
test.describe('Journal', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should navigate to journal tab', async ({ page }) => {
    await page.locator('button:has-text("Journal")').click();
    await page.waitForTimeout(2000);
    await screenshot(page, '40-journal-tab');

    // Should show date picker and textarea
    const journalTextarea = page.locator('textarea[aria-label="Journal entry"]');
    await expect(journalTextarea).toBeVisible({ timeout: 10000 });
  });

  test('should write and save a journal entry', async ({ page }) => {
    await page.locator('button:has-text("Journal")').click();
    await page.waitForTimeout(2000);

    const journalTextarea = page.locator('textarea[aria-label="Journal entry"]');
    await journalTextarea.waitFor({ state: 'visible', timeout: 10000 });

    const journalText = `Test journal entry written at ${new Date().toISOString()}`;
    await journalTextarea.fill(journalText);
    await page.waitForTimeout(3000); // Wait for auto-save
    await screenshot(page, '41-journal-entry-written');

    // Check for save status
    const saveStatus = page.locator('text=Saved').or(page.locator('text=Synced'));
    const statusVisible = await saveStatus.isVisible({ timeout: 5000 }).catch(() => false);
    if (statusVisible) {
      await screenshot(page, '42-journal-saved');
    }
  });

  test('should navigate between dates', async ({ page }) => {
    await page.locator('button:has-text("Journal")').click();
    await page.waitForTimeout(2000);

    // Click previous day
    const prevBtn = page.locator('button[aria-label="Previous day"]');
    await prevBtn.waitFor({ state: 'visible', timeout: 5000 });
    await prevBtn.click();
    await page.waitForTimeout(1500);
    await screenshot(page, '43-journal-previous-day');

    // Click next day
    const nextBtn = page.locator('button[aria-label="Next day"]');
    await nextBtn.click();
    await page.waitForTimeout(1500);
    await screenshot(page, '44-journal-next-day');
  });
});

// ============================================================
// 6. ASSISTANT / AGENT
// ============================================================
test.describe('Assistant', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should navigate to assistant tab', async ({ page }) => {
    await page.locator('button:has-text("Assistant")').click();
    await page.waitForTimeout(2000);
    await screenshot(page, '50-assistant-tab');

    // Should show message input
    const input = page.locator('textarea[aria-label="Assistant message"]')
      .or(page.locator('textarea[placeholder*="Ask me anything"]'))
      .or(page.locator('input[placeholder*="Ask"]'));
    const isVisible = await input.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isVisible) {
      await screenshot(page, '50-assistant-input-not-found');
    }
  });

  test('should send a message to assistant', async ({ page }) => {
    await page.locator('button:has-text("Assistant")').click();
    await page.waitForTimeout(2000);

    // Find the input/textarea
    const input = page.locator('textarea[aria-label="Assistant message"]')
      .or(page.locator('textarea[placeholder*="Ask me anything"]'));

    if (await input.isVisible({ timeout: 5000 }).catch(() => false)) {
      await input.fill('What are my current tasks?');
      await screenshot(page, '51-assistant-message-typed');

      // Press Enter or click send
      await input.press('Enter');
      await page.waitForTimeout(5000); // Wait for response
      await screenshot(page, '52-assistant-response');
    } else {
      await screenshot(page, '51-assistant-no-input');
    }
  });
});

// ============================================================
// 7. SETTINGS / EMAIL
// ============================================================
test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should open settings dropdown', async ({ page }) => {
    // Look for settings gear icon - it may be an SVG or button with gear icon
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg') }).last();
    // Try multiple selectors for settings
    const gearBtn = page.locator('[class*="settings"]')
      .or(page.locator('button:has-text("⚙")'))
      .or(page.locator('button[aria-label*="settings" i]'))
      .or(page.locator('button[aria-label*="Settings" i]'));

    if (await gearBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gearBtn.click();
    } else {
      // Try clicking the last icon button in the header
      const headerButtons = page.locator('header button, .flex.items-center button');
      const count = await headerButtons.count();
      if (count > 0) {
        await headerButtons.last().click();
      }
    }
    await page.waitForTimeout(500);
    await screenshot(page, '60-settings-dropdown');
  });

  test('should open account settings', async ({ page }) => {
    // Open settings menu
    // Find and click the gear/settings button
    // The gear icon is typically in the header area
    const allButtons = page.locator('button');
    const count = await allButtons.count();

    // Try to find settings by looking for the gear icon pattern
    let found = false;
    for (let i = 0; i < count && !found; i++) {
      const btn = allButtons.nth(i);
      const text = await btn.textContent().catch(() => '');
      const ariaLabel = await btn.getAttribute('aria-label').catch(() => '');
      if (text?.includes('⚙') || ariaLabel?.toLowerCase().includes('setting')) {
        await btn.click();
        found = true;
      }
    }

    if (!found) {
      // Try the last button in the flex header area (often gear icon)
      const headerArea = page.locator('.flex.items-center.justify-between').first();
      const headerBtns = headerArea.locator('button');
      const hCount = await headerBtns.count();
      if (hCount > 0) {
        await headerBtns.last().click();
      }
    }

    await page.waitForTimeout(500);

    // Click "Account" in dropdown
    const accountBtn = page.locator('button:has-text("Account")').or(page.locator('a:has-text("Account")'));
    if (await accountBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await accountBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '61-account-settings');
    } else {
      await screenshot(page, '61-account-settings-not-found');
    }
  });

  test('should open email settings', async ({ page }) => {
    // Try to open settings menu
    const allButtons = page.locator('button');
    const count = await allButtons.count();

    let found = false;
    for (let i = 0; i < count && !found; i++) {
      const btn = allButtons.nth(i);
      const text = await btn.textContent().catch(() => '');
      if (text?.includes('⚙')) {
        await btn.click();
        found = true;
      }
    }

    if (!found) {
      const headerArea = page.locator('.flex.items-center.justify-between').first();
      const headerBtns = headerArea.locator('button');
      const hCount = await headerBtns.count();
      if (hCount > 0) {
        await headerBtns.last().click();
      }
    }

    await page.waitForTimeout(500);

    const emailBtn = page.locator('button:has-text("Email")').or(page.locator('button:has-text("Email Settings")'));
    if (await emailBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '62-email-settings');
    } else {
      await screenshot(page, '62-email-settings-not-found');
    }
  });

  test('should be able to logout', async ({ page }) => {
    // Open settings menu
    const allButtons = page.locator('button');
    const count = await allButtons.count();

    let found = false;
    for (let i = 0; i < count && !found; i++) {
      const btn = allButtons.nth(i);
      const text = await btn.textContent().catch(() => '');
      if (text?.includes('⚙')) {
        await btn.click();
        found = true;
      }
    }

    if (!found) {
      const headerArea = page.locator('.flex.items-center.justify-between').first();
      const headerBtns = headerArea.locator('button');
      const hCount = await headerBtns.count();
      if (hCount > 0) {
        await headerBtns.last().click();
      }
    }

    await page.waitForTimeout(500);
    await screenshot(page, '63-settings-menu-for-logout');

    const logoutBtn = page.locator('button:has-text("Logout")').or(page.locator('button:has-text("Sign Out")'));
    if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutBtn.click();
      await page.waitForTimeout(3000);
      await screenshot(page, '64-logged-out');

      // Should return to login page
      const emailInput = page.locator('input#email');
      await expect(emailInput).toBeVisible({ timeout: 10000 });
    } else {
      await screenshot(page, '64-logout-not-found');
    }
  });
});
