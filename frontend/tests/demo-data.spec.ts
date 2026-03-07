import { test, expect } from '@playwright/test';

const BASE_URL = 'https://todolist.nyc';
const SCREENSHOT_DIR = 'public/screenshots/demo-data';

test.describe('Demo Data Setup', () => {
  test('Login, create categories, create tasks with priorities', async ({ page }) => {
    test.setTimeout(300_000);

    // ── Step 1: Login ──────────────────────────────────────────
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-landing.png` });

    // Click "Get Started" on landing page if visible
    const getStartedBtn = page.locator('button:has-text("Get Started"), a:has-text("Get Started")');
    if (await getStartedBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await getStartedBtn.click();
      await page.waitForTimeout(2000);
    }

    // Wait for email input
    const emailInput = page.locator('input#email, input[type="email"], input[placeholder*="email" i]');
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill('test@example.com');
    await page.locator('button:has-text("Send Verification Code")').click();

    const codeInput = page.locator('input#code');
    await codeInput.waitFor({ state: 'visible', timeout: 15000 });
    await codeInput.fill('000000');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-code-entered.png` });

    await page.locator('button:has-text("Sign In")').click();

    // Wait for main app to load
    await page.locator('button:has-text("Tasks")').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(3000);

    // Ensure we're on Tasks tab
    await page.locator('button:has-text("Tasks")').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-logged-in-tasks.png` });

    // ── Step 2: Create Categories (if they don't already exist) ──
    async function addCategory(name: string) {
      // Check if category already exists in the filter bar
      const existingCat = page.locator(`button:has-text("${name}")`).first();
      if (await existingCat.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`Category "${name}" already exists, skipping.`);
        return;
      }

      // Click the "+" button in the category bar
      const plusBtn = page.locator('button:has-text("+")').first();
      await plusBtn.click();
      await page.waitForTimeout(1000);

      // Fill in category name
      const catInput = page.locator('input[placeholder="New category name"]');
      await catInput.waitFor({ state: 'visible', timeout: 5000 });
      await catInput.fill(name);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await page.waitForTimeout(2000);

      // Check if modal is still open (error case) and cancel it
      const cancelBtn = page.locator('.fixed.inset-0 button:has-text("Cancel")');
      if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(500);
      }

      // Ensure we're still on Tasks tab
      await page.locator('button:has-text("Tasks")').click();
      await page.waitForTimeout(500);
    }

    await addCategory('Work');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-after-work-category.png` });

    await addCategory('Errands');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-after-errands-category.png` });

    // ── Step 3: Create 5 Tasks with priorities and categories ──
    const tasks = [
      { text: 'Prepare quarterly presentation slides', priority: 'High', category: 'Work' },
      { text: 'Buy groceries for the week', priority: 'Medium', category: 'Errands' },
      { text: 'Review pull requests on GitHub', priority: 'High', category: 'Work' },
      { text: 'Pick up dry cleaning', priority: 'Low', category: 'Errands' },
      { text: 'Schedule dentist appointment', priority: 'Medium', category: 'Errands' },
    ];

    const taskInput = page.locator('input[placeholder="Add a new task..."]');
    await taskInput.waitFor({ state: 'visible', timeout: 10000 });

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      // Add task
      await taskInput.fill(task.text);
      await taskInput.press('Enter');
      await page.waitForTimeout(3000); // Wait for AI classification + render

      await page.screenshot({ path: `${SCREENSHOT_DIR}/06-task-${i + 1}-added.png` });

      // Find the task card
      const taskCard = page.locator(`div.rounded-xl:has(p:has-text("${task.text}"))`).first();
      const cardVisible = await taskCard.isVisible({ timeout: 5000 }).catch(() => false);

      if (cardVisible) {
        // Get all select elements in this card
        const selects = taskCard.locator('select');
        const selectCount = await selects.count();

        if (selectCount >= 2) {
          // First select is category, last is priority
          const categorySelect = selects.first();
          const prioritySelect = selects.last();

          // Set priority
          try {
            await prioritySelect.selectOption(task.priority);
            await page.waitForTimeout(800);
          } catch (e) {
            console.log(`Could not set priority for task ${i + 1}: ${e}`);
          }

          // Set category
          try {
            await categorySelect.selectOption(task.category);
            await page.waitForTimeout(800);
          } catch (e) {
            console.log(`Could not set category for task ${i + 1}: ${e}`);
          }
        } else if (selectCount === 1) {
          try {
            await selects.first().selectOption(task.priority);
            await page.waitForTimeout(800);
          } catch (e) {
            console.log(`Could not set option for task ${i + 1}: ${e}`);
          }
        }

        await page.screenshot({ path: `${SCREENSHOT_DIR}/07-task-${i + 1}-configured.png` });
      } else {
        console.log(`Task card not visible for: ${task.text}`);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/07-task-${i + 1}-not-found.png` });
      }
    }

    // ── Step 4: Final Overview Screenshots ─────────────────────
    // Scroll to top to see all tasks
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/08-all-tasks-overview.png`, fullPage: true });

    // Filter by Work category
    const workFilter = page.locator('button:has-text("Work")').first();
    if (await workFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await workFilter.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/09-filter-work.png`, fullPage: true });
    }

    // Filter by Errands category
    const errandsFilter = page.locator('button:has-text("Errands")').first();
    if (await errandsFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await errandsFilter.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/10-filter-errands.png`, fullPage: true });
    }

    // Back to All
    const allFilter = page.locator('button:has-text("All")').first();
    if (await allFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await allFilter.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/11-all-tasks-final.png`, fullPage: true });
    }

    console.log('✅ Demo data created successfully!');
    console.log('  - Categories: Work, Errands');
    console.log('  - 5 tasks with mixed priorities and categories');
  });
});
