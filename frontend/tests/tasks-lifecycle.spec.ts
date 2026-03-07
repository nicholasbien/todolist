import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(__dirname, '..', 'public', 'screenshots');
const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'test@example.com';
const TEST_CODE = '000000';
const UNIQUE = Date.now();

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

// TodoItem structure:
// <div onClick=onEdit class="p-4 border rounded-xl ...">
//   <div class="flex justify-between items-center">
//     <div class="flex-1"><p>task text</p></div>
//     <div class="flex items-center space-x-2 ml-3">
//       <button aria-label="Mark task as complete"><Check/></button>
//       <button aria-label="Delete task"><X/></button>
//     </div>
//   </div>
//   <div class="flex flex-wrap items-center gap-2 mt-2 text-sm">
//     <select>category</select>
//     <select>priority (High/Medium/Low)</select>
//     <span>Due: ...</span>
//   </div>
// </div>

test.describe('Task Lifecycle - Complete CRUD + Priority + Category + Spaces', () => {

  test('Full task lifecycle', async ({ page }) => {
    await login(page);

    const taskName = `Lifecycle task ${UNIQUE}`;
    const editedName = `Lifecycle task ${UNIQUE} EDITED`;

    // ---- STEP 1: CREATE TASK ----
    console.log('STEP 1: Create task');
    const taskInput = page.locator('input[placeholder*="Add a new task"]');
    await expect(taskInput).toBeVisible();
    await taskInput.fill(taskName);
    await taskInput.press('Enter');
    await page.waitForTimeout(2000);
    await screenshot(page, 'lifecycle-01-task-created');

    const taskCard = page.locator(`p:has-text("${taskName}")`).first();
    await expect(taskCard).toBeVisible({ timeout: 5000 });
    console.log('  Task created successfully');

    // ---- STEP 2: VERIFY AI CLASSIFICATION ----
    console.log('STEP 2: Check AI classification');
    // The task card parent div has select elements for category and priority
    const todoDiv = page.locator(`div.rounded-xl:has(p:has-text("${taskName}"))`).first();
    const selects = todoDiv.locator('select');
    const selectCount = await selects.count();
    console.log(`  Found ${selectCount} select elements on task card`);

    if (selectCount >= 2) {
      const categoryVal = await selects.nth(0).inputValue();
      const priorityVal = await selects.nth(1).inputValue();
      console.log(`  Category: ${categoryVal}, Priority: ${priorityVal}`);
    }
    await screenshot(page, 'lifecycle-02-classification');

    // ---- STEP 3: CHANGE PRIORITY INLINE ----
    console.log('STEP 3: Change priority inline');
    if (selectCount >= 2) {
      const prioritySelect = selects.nth(1);
      const beforePriority = await prioritySelect.inputValue();
      const newPriority = beforePriority === 'High' ? 'Low' : 'High';
      await prioritySelect.selectOption(newPriority);
      await page.waitForTimeout(1500);
      const afterPriority = await prioritySelect.inputValue();
      console.log(`  Priority changed: ${beforePriority} -> ${afterPriority}`);
      await screenshot(page, 'lifecycle-03-priority-changed');

      if (afterPriority !== newPriority) {
        console.log('  BUG: Priority did not change after selection');
        await screenshot(page, 'lifecycle-03-BUG-priority-not-changed');
      }
    }

    // ---- STEP 4: CHANGE CATEGORY INLINE ----
    console.log('STEP 4: Change category inline');
    if (selectCount >= 1) {
      const categorySelect = selects.nth(0);
      const options = await categorySelect.locator('option').allTextContents();
      console.log(`  Available categories: ${options.join(', ')}`);
      const currentCat = await categorySelect.inputValue();

      // Pick a different category
      const otherCat = options.find(c => c !== currentCat) || currentCat;
      if (otherCat !== currentCat) {
        await categorySelect.selectOption(otherCat);
        await page.waitForTimeout(1500);
        const afterCat = await categorySelect.inputValue();
        console.log(`  Category changed: ${currentCat} -> ${afterCat}`);
        await screenshot(page, 'lifecycle-04-category-changed');

        if (afterCat !== otherCat) {
          console.log('  BUG: Category did not change after selection');
        }
      }
    }

    // ---- STEP 5: EDIT TASK VIA MODAL (click card body) ----
    console.log('STEP 5: Edit task via modal');
    // Click on the task text paragraph (not on buttons/selects)
    await taskCard.click();
    await page.waitForTimeout(1500);
    await screenshot(page, 'lifecycle-05-edit-modal-opened');

    // Look for the edit modal - should have "Edit Task" heading and a text input
    const editModalHeading = page.locator('text=Edit Task');
    const modalOpened = await editModalHeading.isVisible({ timeout: 3000 }).catch(() => false);

    if (modalOpened) {
      console.log('  Edit modal opened successfully');
      // The modal has h3 "Edit Task" followed by input[type=text]
      // Use the fixed overlay > first text input
      const editInput = page.locator('.fixed input[type="text"]').first();
      await editInput.click({ clickCount: 3 }); // select all
      await editInput.fill(editedName);

      // Look for Save button
      const saveBtn = page.locator('button:has-text("Save")').first();
      if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(1500);
        await screenshot(page, 'lifecycle-06-task-edited');

        const editedVisible = await page.locator(`p:has-text("${editedName}")`).isVisible({ timeout: 5000 }).catch(() => false);
        if (editedVisible) {
          console.log('  Task edited successfully');
        } else {
          console.log('  BUG: Edited task text not visible after save');
          await screenshot(page, 'lifecycle-06-BUG-edit-not-saved');
        }
      } else {
        console.log('  NOTE: No Save button found in modal');
        await screenshot(page, 'lifecycle-06-no-save-btn');
        // Try pressing Escape to close
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    } else {
      console.log('  BUG: Edit modal did not open on task click');
      await screenshot(page, 'lifecycle-05-BUG-no-modal');
    }

    // ---- STEP 6: FILTER BY CATEGORY ----
    console.log('STEP 6: Filter by category');
    const categoryPills = page.locator('div.flex.overflow-x-auto button, div.flex.gap-2 button').filter({ hasText: /^(?!.*\+)/ });
    const pillCount = await categoryPills.count();
    console.log(`  Found ${pillCount} category filter buttons`);
    await screenshot(page, 'lifecycle-07-category-filters');

    // Click "All" first to ensure we see everything
    const allBtn = page.locator('button:has-text("All")').first();
    if (await allBtn.isVisible()) {
      await allBtn.click();
      await page.waitForTimeout(500);
    }

    // Click a non-All category filter
    if (pillCount > 1) {
      // Get the second button (first non-All)
      const secondPill = categoryPills.nth(1);
      const pillText = await secondPill.textContent();
      await secondPill.click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'lifecycle-08-filtered');
      console.log(`  Filtered by: ${pillText}`);

      // Go back to All
      await allBtn.click();
      await page.waitForTimeout(1000);
    }

    // ---- STEP 7: COMPLETE TASK ----
    console.log('STEP 7: Complete task');
    const currentName = modalOpened ? editedName : taskName;
    const completeBtn = page.locator(`div.rounded-xl:has(p:has-text("${currentName}")) button[aria-label="Mark task as complete"]`).first();

    if (await completeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await completeBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'lifecycle-09-task-completed');
      console.log('  Task completed');

      // Check if there's a completed section or visual change
      // The completed task should have different styling or appear in a different section
      const uncompleteBtn = page.locator(`button[aria-label="Mark task as incomplete"]`).first();
      const hasUncomplete = await uncompleteBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasUncomplete) {
        console.log('  Completed task shows undo/uncomplete button - good');
      }
    } else {
      console.log('  NOTE: Complete button not found (task may already be completed)');
      await screenshot(page, 'lifecycle-09-no-complete-btn');
    }

    // ---- STEP 8: DELETE TASK ----
    console.log('STEP 8: Delete task');
    // Create a new task to delete
    const deleteName = `Delete me ${UNIQUE}`;
    await taskInput.fill(deleteName);
    await taskInput.press('Enter');
    await page.waitForTimeout(2000);
    await screenshot(page, 'lifecycle-10-before-delete');

    const deleteBtn = page.locator(`div.rounded-xl:has(p:has-text("${deleteName}")) button[aria-label="Delete task"]`).first();
    if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(1500);
      await screenshot(page, 'lifecycle-11-after-delete');

      const stillVisible = await page.locator(`p:has-text("${deleteName}")`).isVisible().catch(() => false);
      if (stillVisible) {
        console.log('  BUG: Task still visible after delete');
        await screenshot(page, 'lifecycle-11-BUG-delete-failed');
      } else {
        console.log('  Task deleted successfully');
      }
    } else {
      console.log('  BUG: Delete button not found');
      await screenshot(page, 'lifecycle-11-BUG-no-delete');
    }

    // ---- STEP 9: SPACE SWITCHING ----
    console.log('STEP 9: Space switching and isolation');
    // Click space name in header
    const personalBtn = page.locator('header >> text=Personal').first();
    if (await personalBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await personalBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'lifecycle-12-space-dropdown');

      // Find and click Test Space
      const testSpaceOption = page.locator('text=Test Space').last();
      if (await testSpaceOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await testSpaceOption.click();
        await page.waitForTimeout(2000);
        await screenshot(page, 'lifecycle-13-test-space');

        // Create a task in Test Space
        const spaceTaskName = `Space task ${UNIQUE}`;
        await taskInput.fill(spaceTaskName);
        await taskInput.press('Enter');
        await page.waitForTimeout(2000);
        await screenshot(page, 'lifecycle-14-task-in-test-space');

        // Switch back to Personal
        const testHeader = page.locator('header').locator('text=Test Space').first();
        if (await testHeader.isVisible()) {
          await testHeader.click();
          await page.waitForTimeout(500);
          await page.locator('text=Personal').first().click();
          await page.waitForTimeout(2000);
          await screenshot(page, 'lifecycle-15-back-to-personal');

          // Verify isolation
          const leaked = await page.locator(`p:has-text("${spaceTaskName}")`).isVisible().catch(() => false);
          if (leaked) {
            console.log('  BUG: Task from Test Space leaked into Personal space!');
            await screenshot(page, 'lifecycle-15-BUG-space-leak');
          } else {
            console.log('  Space isolation verified');
          }
        }
      } else {
        console.log('  Test Space not found, trying any alternate space');
        const altSpace = page.locator('text=/Offline Space/').first();
        if (await altSpace.isVisible({ timeout: 2000 }).catch(() => false)) {
          await altSpace.click();
          await page.waitForTimeout(2000);
          await screenshot(page, 'lifecycle-13-alt-space');
        }
      }
    }

    console.log('=== LIFECYCLE TEST COMPLETE ===');
  });

  // Cleanup via direct API
  test('Cleanup lifecycle test tasks', async ({ request }) => {
    const loginResp = await request.post('http://localhost:8000/auth/login', {
      data: { email: TEST_EMAIL, code: TEST_CODE },
      headers: { 'Content-Type': 'application/json' }
    });
    const { token } = await loginResp.json();

    const spacesResp = await request.get('http://localhost:8000/spaces', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const spaces = await spacesResp.json();
    let cleaned = 0;

    for (const space of spaces) {
      const todosResp = await request.get(`http://localhost:8000/todos?space_id=${space._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const todos = await todosResp.json();

      for (const todo of todos) {
        if (todo.text && (
          todo.text.includes('Lifecycle task') ||
          todo.text.includes('Delete me') ||
          todo.text.includes('Space task') ||
          todo.text.includes('Exploration test') ||
          todo.text.includes('High priority task test') ||
          todo.text.includes('Task in Test Space')
        )) {
          await request.delete(`http://localhost:8000/todos/${todo._id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          cleaned++;
        }
      }
    }
    console.log(`Cleaned up ${cleaned} test tasks`);
  });
});
