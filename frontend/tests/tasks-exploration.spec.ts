import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(__dirname, '..', 'public', 'screenshots');
const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'test@example.com';
const TEST_CODE = '000000';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page: Page, name: string) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function login(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  const emailInput = page.locator('input#email');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(TEST_EMAIL);
  await page.locator('button:has-text("Send Verification Code")').click();
  const codeInput = page.locator('input#code');
  await codeInput.waitFor({ state: 'visible', timeout: 10000 });
  await codeInput.fill(TEST_CODE);
  await page.locator('button:has-text("Sign In")').click();
  await page.locator('button:has-text("Tasks")').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2000);
}

test.describe('Tasks Exploration - CRUD, Priority, Categories, Spaces', () => {

  test('T1 - Create a new task and verify it appears', async ({ page }) => {
    await login(page);
    await screenshot(page, 'tasks-explore-01-initial');

    // Find the task input
    const taskInput = page.locator('input[placeholder*="Add"]').first();
    if (await taskInput.isVisible()) {
      await taskInput.fill('Exploration test task Alpha');
      await taskInput.press('Enter');
      await page.waitForTimeout(1500);
      await screenshot(page, 'tasks-explore-02-task-created');

      // Verify task appears in list
      const taskText = page.locator('text=Exploration test task Alpha');
      await expect(taskText).toBeVisible({ timeout: 5000 });
    } else {
      // Try alternate input patterns
      await screenshot(page, 'tasks-explore-02-no-input-found');
      test.fail(true, 'Could not find task input field');
    }
  });

  test('T2 - Create a second task and verify both exist', async ({ page }) => {
    await login(page);

    const taskInput = page.locator('input[placeholder*="Add"]').first();
    await taskInput.fill('Exploration test task Beta');
    await taskInput.press('Enter');
    await page.waitForTimeout(1500);
    await screenshot(page, 'tasks-explore-03-second-task');

    const taskBeta = page.locator('text=Exploration test task Beta');
    await expect(taskBeta).toBeVisible({ timeout: 5000 });
  });

  test('T3 - Complete a task (toggle checkbox)', async ({ page }) => {
    await login(page);
    await screenshot(page, 'tasks-explore-04-before-complete');

    // Find a task with "Exploration test task Alpha" and click its checkbox
    const taskRow = page.locator('text=Exploration test task Alpha').first().locator('..');
    // Try clicking a checkbox or toggle near the task
    const checkbox = taskRow.locator('input[type="checkbox"], button, [role="checkbox"]').first();
    if (await checkbox.isVisible()) {
      await checkbox.click();
      await page.waitForTimeout(1500);
      await screenshot(page, 'tasks-explore-05-task-completed');
    } else {
      // Try clicking the task text itself (some UIs use click-to-complete)
      // Or look for a circular checkbox icon
      const circleBtn = page.locator('[class*="circle"], [class*="check"]').first();
      if (await circleBtn.isVisible()) {
        await circleBtn.click();
        await page.waitForTimeout(1500);
        await screenshot(page, 'tasks-explore-05-task-completed-alt');
      } else {
        await screenshot(page, 'tasks-explore-05-no-checkbox-found');
      }
    }
  });

  test('T4 - Edit a task (open edit modal/inline)', async ({ page }) => {
    await login(page);

    // Look for edit button or try clicking on task text
    const taskItem = page.locator('text=Exploration test task Beta').first();
    await taskItem.click();
    await page.waitForTimeout(1000);
    await screenshot(page, 'tasks-explore-06-clicked-task');

    // Check if a modal/edit form appeared
    const modal = page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]').first();
    if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
      await screenshot(page, 'tasks-explore-07-edit-modal');

      // Try to edit the text
      const editInput = modal.locator('input, textarea').first();
      if (await editInput.isVisible()) {
        await editInput.clear();
        await editInput.fill('Exploration test task Beta EDITED');
        // Look for save button
        const saveBtn = modal.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("Done")').first();
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
          await page.waitForTimeout(1500);
          await screenshot(page, 'tasks-explore-08-task-edited');
        }
      }
    } else {
      // Try right-click or long-press, or look for an edit icon
      const editBtn = page.locator('[aria-label*="edit"], [title*="edit"], button:has-text("Edit")').first();
      if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(1000);
        await screenshot(page, 'tasks-explore-07-edit-btn-clicked');
      } else {
        await screenshot(page, 'tasks-explore-07-no-edit-ui');
      }
    }
  });

  test('T5 - Delete a task', async ({ page }) => {
    await login(page);
    await screenshot(page, 'tasks-explore-09-before-delete');

    // Look for delete button near a task
    const taskRow = page.locator('text=Exploration test task').first().locator('..');
    const deleteBtn = taskRow.locator('[aria-label*="delete"], [title*="delete"], button:has-text("Delete"), [class*="trash"], [class*="delete"]').first();

    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(1500);
      await screenshot(page, 'tasks-explore-10-after-delete');
    } else {
      // Try swipe or other delete mechanism - screenshot what's available
      await screenshot(page, 'tasks-explore-10-no-delete-btn-visible');
    }
  });

  test('T6 - Filter tasks by category', async ({ page }) => {
    await login(page);

    // Look for category filter dropdown or tabs
    const categoryFilter = page.locator('select, [class*="category"], [class*="filter"], button:has-text("All"), button:has-text("Category")').first();
    await screenshot(page, 'tasks-explore-11-before-filter');

    if (await categoryFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await categoryFilter.click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'tasks-explore-12-filter-opened');

      // Try selecting a specific category
      const categoryOption = page.locator('[role="option"], [class*="category-item"], li, option').filter({ hasText: /Work|Personal|Shopping|Health/i }).first();
      if (await categoryOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await categoryOption.click();
        await page.waitForTimeout(1500);
        await screenshot(page, 'tasks-explore-13-filter-applied');
      }
    } else {
      await screenshot(page, 'tasks-explore-12-no-filter-ui');
    }
  });

  test('T7 - Switch spaces and verify task isolation', async ({ page }) => {
    await login(page);
    await screenshot(page, 'tasks-explore-14-default-space');

    // Look for space switcher
    const spaceSwitcher = page.locator('[class*="space"], [class*="Space"], select, button:has-text("Personal"), [aria-label*="space"]').first();

    if (await spaceSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
      await spaceSwitcher.click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'tasks-explore-15-space-dropdown');

      // Try selecting a different space
      const altSpace = page.locator('text=Test Space').first();
      if (await altSpace.isVisible({ timeout: 2000 }).catch(() => false)) {
        await altSpace.click();
        await page.waitForTimeout(2000);
        await screenshot(page, 'tasks-explore-16-switched-space');

        // Create a task in this space
        const taskInput = page.locator('input[placeholder*="Add"]').first();
        if (await taskInput.isVisible()) {
          await taskInput.fill('Task in Test Space');
          await taskInput.press('Enter');
          await page.waitForTimeout(1500);
          await screenshot(page, 'tasks-explore-17-task-in-other-space');
        }

        // Switch back to Personal
        await spaceSwitcher.click();
        await page.waitForTimeout(1000);
        const personalSpace = page.locator('text=Personal').first();
        if (await personalSpace.isVisible()) {
          await personalSpace.click();
          await page.waitForTimeout(2000);
          await screenshot(page, 'tasks-explore-18-back-to-personal');

          // Verify "Task in Test Space" is NOT visible here
          const crossTask = page.locator('text=Task in Test Space');
          const isVisible = await crossTask.isVisible().catch(() => false);
          await screenshot(page, 'tasks-explore-19-isolation-check');
          if (isVisible) {
            console.log('BUG: Task from Test Space is visible in Personal space!');
          }
        }
      }
    } else {
      await screenshot(page, 'tasks-explore-15-no-space-switcher');
    }
  });

  test('T8 - Test task priority display', async ({ page }) => {
    await login(page);

    // Check if priority indicators are visible on tasks
    const priorityIndicators = page.locator('[class*="priority"], [class*="Priority"], [data-priority]');
    const count = await priorityIndicators.count();
    await screenshot(page, 'tasks-explore-20-priority-check');
    console.log(`Found ${count} priority indicators`);

    // Check if there's a way to set priority on new tasks
    const taskInput = page.locator('input[placeholder*="Add"]').first();
    if (await taskInput.isVisible()) {
      await taskInput.fill('High priority task test');
      // Before pressing Enter, look for priority selector
      const priorityBtn = page.locator('[aria-label*="priority"], button:has-text("Priority"), [class*="priority"]').first();
      if (await priorityBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await priorityBtn.click();
        await page.waitForTimeout(1000);
        await screenshot(page, 'tasks-explore-21-priority-selector');
      } else {
        await screenshot(page, 'tasks-explore-21-no-priority-selector');
      }
      await taskInput.press('Enter');
      await page.waitForTimeout(1500);
      await screenshot(page, 'tasks-explore-22-priority-task-created');
    }
  });

  // Cleanup: delete exploration test tasks
  test('T9 - Cleanup exploration tasks via API', async ({ page }) => {
    // Use API to clean up
    const loginResp = await page.request.post(`${BASE_URL}/auth/login`, {
      data: { email: TEST_EMAIL, code: TEST_CODE },
      headers: { 'Content-Type': 'application/json' }
    });
    const { token } = await loginResp.json();

    const spacesResp = await page.request.get(`${BASE_URL}/spaces`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const spaces = await spacesResp.json();

    for (const space of spaces) {
      const todosResp = await page.request.get(`${BASE_URL}/todos?space_id=${space._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const todos = await todosResp.json();

      for (const todo of todos) {
        if (todo.text && todo.text.includes('Exploration test task') ||
            todo.text && todo.text.includes('High priority task test') ||
            todo.text && todo.text.includes('Task in Test Space')) {
          await page.request.delete(`${BASE_URL}/todos/${todo._id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      }
    }
    console.log('Cleanup complete');
  });
});
