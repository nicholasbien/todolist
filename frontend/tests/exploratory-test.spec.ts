import { test, expect, Page } from '@playwright/test';

const SCREENSHOT_DIR = 'public/screenshots/exploratory';
let bugLog: string[] = [];

function logBug(id: string, description: string, steps: string) {
  bugLog.push(`BUG-${id}: ${description}\n  Steps: ${steps}`);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

async function login(page: Page) {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Should see login page
  const emailInput = page.locator('input#email');
  if (await emailInput.isVisible({ timeout: 5000 })) {
    await screenshot(page, '00-login-page');
    await emailInput.fill('test@example.com');
    await page.locator('button:has-text("Send Verification Code")').click();

    // Wait for code input
    const codeInput = page.locator('input#code');
    await codeInput.waitFor({ state: 'visible', timeout: 10000 });
    await screenshot(page, '01-verification-page');
    await codeInput.fill('000000');
    await page.locator('button:has-text("Sign In")').click();

    // Wait for main app to load
    await page.waitForTimeout(3000);
  }

  await screenshot(page, '02-logged-in');
}

test.describe('Exploratory Testing - Full App Walkthrough', () => {
  test.setTimeout(120000);

  test.beforeAll(() => {
    bugLog = [];
  });

  test.afterAll(async () => {
    // Write bug log
    const fs = require('fs');
    const logContent = bugLog.length > 0
      ? bugLog.join('\n\n')
      : 'No bugs found during this run.';
    fs.writeFileSync(`${SCREENSHOT_DIR}/bug-report.txt`, logContent);
    console.log('=== BUG REPORT ===\n' + logContent);
  });

  test('1. Login flow', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '01-01-initial-load');

    // Test empty email submission
    const sendBtn = page.locator('button:has-text("Send Verification Code")');
    if (await sendBtn.isVisible({ timeout: 3000 })) {
      await sendBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '01-02-empty-email-submit');
    }

    // Test invalid email
    const emailInput = page.locator('input#email');
    await emailInput.fill('notanemail');
    await sendBtn.click();
    await page.waitForTimeout(1000);
    await screenshot(page, '01-03-invalid-email');

    // Valid email
    await emailInput.fill('test@example.com');
    await sendBtn.click();
    await page.waitForTimeout(2000);
    await screenshot(page, '01-04-after-send-code');

    // Wrong code
    const codeInput = page.locator('input#code');
    if (await codeInput.isVisible({ timeout: 5000 })) {
      await codeInput.fill('111111');
      await page.locator('button:has-text("Sign In")').click();
      await page.waitForTimeout(2000);
      await screenshot(page, '01-05-wrong-code');

      // Check for error message
      const errorVisible = await page.locator('text=Invalid').or(page.locator('text=incorrect')).or(page.locator('.bg-red-900')).isVisible({ timeout: 3000 }).catch(() => false);
      if (!errorVisible) {
        logBug('LOGIN-01', 'No error message shown for invalid verification code', 'Enter wrong code 111111 and click Sign In');
      }

      // Correct code
      await codeInput.clear();
      await codeInput.fill('000000');
      await page.locator('button:has-text("Sign In")').click();
      await page.waitForTimeout(3000);
      await screenshot(page, '01-06-logged-in');
    }
  });

  test('2. Task CRUD operations', async ({ page }) => {
    await login(page);

    // Ensure we're on Tasks tab
    const tasksTab = page.locator('button:has-text("Tasks")');
    if (await tasksTab.isVisible({ timeout: 3000 })) {
      await tasksTab.click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, '02-01-tasks-tab');

    // Add a task via Enter key
    const taskInput = page.getByPlaceholder('Add a new task...');
    await taskInput.fill('Exploratory test task 1');
    await taskInput.press('Enter');
    await page.waitForTimeout(2000);
    await screenshot(page, '02-02-task-added');

    // Verify task appears
    const task1 = page.locator('text=Exploratory test task 1');
    const task1Visible = await task1.isVisible({ timeout: 5000 });
    if (!task1Visible) {
      logBug('TASK-01', 'Added task does not appear in the list', 'Add task via Enter key');
    }

    // Add another task via + button
    await taskInput.fill('Exploratory test task 2');
    // Find the add button - it's a + button near the input
    const addButton = page.locator('button').filter({ hasText: '+' }).first();
    if (await addButton.isVisible({ timeout: 2000 })) {
      await addButton.click();
    } else {
      await taskInput.press('Enter');
    }
    await page.waitForTimeout(2000);
    await screenshot(page, '02-03-second-task');

    // Add empty task (edge case)
    await taskInput.fill('');
    await taskInput.press('Enter');
    await page.waitForTimeout(1000);
    await screenshot(page, '02-04-empty-task-attempt');

    // Add task with very long text
    const longText = 'A'.repeat(500);
    await taskInput.fill(longText);
    await taskInput.press('Enter');
    await page.waitForTimeout(2000);
    await screenshot(page, '02-05-long-task');

    // Add task with special characters
    await taskInput.fill('<script>alert("xss")</script> & "quotes" \'single\'');
    await taskInput.press('Enter');
    await page.waitForTimeout(2000);
    await screenshot(page, '02-06-special-chars-task');

    // Check XSS - the script tag should be rendered as text, not executed
    const xssText = page.locator('text=<script>');
    const xssVisible = await xssText.isVisible({ timeout: 3000 }).catch(() => false);
    // If the text doesn't appear but no alert popped, React likely escaped it safely

    // Complete a task
    const task1Item = page.locator('div').filter({ hasText: 'Exploratory test task 1' }).first();
    const completeBtn = task1Item.locator('button[aria-label="Mark task as complete"]');
    if (await completeBtn.isVisible({ timeout: 3000 })) {
      await completeBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '02-07-task-completed');
    }

    // Show completed tasks
    const showCompletedBtn = page.locator('button').filter({ hasText: /Show Completed/i });
    if (await showCompletedBtn.isVisible({ timeout: 3000 })) {
      await showCompletedBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '02-08-show-completed');
    }

    // Uncomplete a task
    const incompleteBtn = page.locator('button[aria-label="Mark task as incomplete"]').first();
    if (await incompleteBtn.isVisible({ timeout: 3000 })) {
      await incompleteBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '02-09-task-uncompleted');
    }

    // Edit a task - click on a task text to open edit modal
    const taskToEdit = page.locator('text=Exploratory test task 2');
    if (await taskToEdit.isVisible({ timeout: 3000 })) {
      await taskToEdit.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '02-10-edit-modal-open');

      // Check if edit modal appeared
      const editModal = page.locator('text=Edit Task');
      if (await editModal.isVisible({ timeout: 3000 })) {
        // Change task text
        const editInput = page.locator('.fixed input').first();
        await editInput.clear();
        await editInput.fill('Edited task 2 - updated');
        await screenshot(page, '02-11-edit-modal-filled');

        // Save
        const saveBtn = page.locator('.fixed button:has-text("Save")');
        await saveBtn.click();
        await page.waitForTimeout(1000);
        await screenshot(page, '02-12-after-edit');
      }
    }

    // Delete a task
    const deleteBtn = page.locator('button[aria-label="Delete task"]').first();
    if (await deleteBtn.isVisible({ timeout: 3000 })) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '02-13-after-delete');
    }

    // Try rapid task addition
    for (let i = 0; i < 5; i++) {
      await taskInput.fill(`Rapid task ${i}`);
      await taskInput.press('Enter');
      await page.waitForTimeout(200); // Minimal wait - stress test
    }
    await page.waitForTimeout(3000);
    await screenshot(page, '02-14-rapid-tasks');

    // Verify all rapid tasks appear
    for (let i = 0; i < 5; i++) {
      const rapidTask = page.locator(`text=Rapid task ${i}`);
      const visible = await rapidTask.isVisible({ timeout: 2000 }).catch(() => false);
      if (!visible) {
        logBug('TASK-02', `Rapid task ${i} missing after quick succession add`, 'Add 5 tasks rapidly with 200ms delay');
      }
    }
  });

  test('3. Categories', async ({ page }) => {
    await login(page);
    await screenshot(page, '03-01-categories-view');

    // Check existing categories
    const allBtn = page.locator('button:has-text("All")');
    if (await allBtn.isVisible({ timeout: 3000 })) {
      await allBtn.click();
      await page.waitForTimeout(500);
    }

    // Add a new category
    const addCatBtn = page.getByTestId('add-category-button').or(
      page.locator('button').filter({ hasText: '+' }).last()
    );
    if (await addCatBtn.isVisible({ timeout: 3000 })) {
      await addCatBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '03-02-add-category-modal');

      // Add category
      const catInput = page.locator('input[placeholder="New category name"]');
      if (await catInput.isVisible({ timeout: 3000 })) {
        await catInput.fill('Test Category');
        const addBtn = page.locator('.fixed button:has-text("Add")');
        await addBtn.click();
        await page.waitForTimeout(1000);
        await screenshot(page, '03-03-category-added');
      }
    }

    // Filter by new category
    const newCatBtn = page.locator('button:has-text("Test Category")');
    if (await newCatBtn.isVisible({ timeout: 3000 })) {
      await newCatBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, '03-04-filtered-by-category');
    }

    // Add empty category name (edge case)
    if (await addCatBtn.isVisible({ timeout: 2000 })) {
      await addCatBtn.click();
      await page.waitForTimeout(500);
      const catInput = page.locator('input[placeholder="New category name"]');
      if (await catInput.isVisible({ timeout: 3000 })) {
        // Try to add without typing
        const addBtn = page.locator('.fixed button:has-text("Add")');
        await addBtn.click();
        await page.waitForTimeout(1000);
        await screenshot(page, '03-05-empty-category-attempt');
        // Close modal if still open
        const cancelBtn = page.locator('.fixed button:has-text("Cancel")');
        if (await cancelBtn.isVisible({ timeout: 1000 })) {
          await cancelBtn.click();
        }
      }
    }

    // Add duplicate category
    if (await addCatBtn.isVisible({ timeout: 2000 })) {
      await addCatBtn.click();
      await page.waitForTimeout(500);
      const catInput = page.locator('input[placeholder="New category name"]');
      if (await catInput.isVisible({ timeout: 3000 })) {
        await catInput.fill('Test Category'); // Duplicate
        const addBtn = page.locator('.fixed button:has-text("Add")');
        await addBtn.click();
        await page.waitForTimeout(1000);
        await screenshot(page, '03-06-duplicate-category');
        const cancelBtn = page.locator('.fixed button:has-text("Cancel")');
        if (await cancelBtn.isVisible({ timeout: 1000 })) {
          await cancelBtn.click();
        }
      }
    }

    // Edit a category - long press or context menu on category button
    if (await newCatBtn.isVisible({ timeout: 2000 })) {
      // Try right-click or long-press
      await newCatBtn.click({ button: 'right' });
      await page.waitForTimeout(1000);
      await screenshot(page, '03-07-category-right-click');
    }

    // Back to All
    if (await allBtn.isVisible({ timeout: 2000 })) {
      await allBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('4. Spaces', async ({ page }) => {
    await login(page);

    // Open space dropdown
    const spaceDropdown = page.getByTestId('space-dropdown-trigger').or(
      page.locator('button').filter({ hasText: /Default|Personal/ }).first()
    );
    if (await spaceDropdown.isVisible({ timeout: 5000 })) {
      await spaceDropdown.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '04-01-space-dropdown');
    }

    // Create new space
    const newSpaceBtn = page.getByTestId('space-create-button').or(
      page.locator('button:has-text("New Space")')
    );
    if (await newSpaceBtn.isVisible({ timeout: 3000 })) {
      await newSpaceBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '04-02-create-space-modal');

      // Fill space name
      const spaceInput = page.locator('input[placeholder="Space name"]');
      if (await spaceInput.isVisible({ timeout: 3000 })) {
        await spaceInput.fill('Test Space');
        const createBtn = page.locator('.fixed button:has-text("Create")');
        await createBtn.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '04-03-space-created');
      }
    }

    // Switch to new space
    if (await spaceDropdown.isVisible({ timeout: 3000 })) {
      await spaceDropdown.click();
      await page.waitForTimeout(500);
      const testSpace = page.locator('text=Test Space');
      if (await testSpace.isVisible({ timeout: 3000 })) {
        await testSpace.click();
        await page.waitForTimeout(1000);
        await screenshot(page, '04-04-switched-to-test-space');
      }
    }

    // Add a task in the new space
    const taskInput = page.getByPlaceholder('Add a new task...');
    if (await taskInput.isVisible({ timeout: 3000 })) {
      await taskInput.fill('Task in test space');
      await taskInput.press('Enter');
      await page.waitForTimeout(2000);
      await screenshot(page, '04-05-task-in-new-space');
    }

    // Switch back to default space - task should NOT be there
    if (await spaceDropdown.isVisible({ timeout: 3000 })) {
      await spaceDropdown.click();
      await page.waitForTimeout(500);
      const defaultSpace = page.locator('text=Default').or(page.locator('text=Personal'));
      if (await defaultSpace.isVisible({ timeout: 3000 })) {
        await defaultSpace.first().click();
        await page.waitForTimeout(1000);
        await screenshot(page, '04-06-back-to-default');

        // Verify isolation
        const testSpaceTask = page.locator('text=Task in test space');
        const leaked = await testSpaceTask.isVisible({ timeout: 2000 }).catch(() => false);
        if (leaked) {
          logBug('SPACE-01', 'Task from test space visible in default space - space isolation broken', 'Create task in test space, switch to default space');
        }
      }
    }

    // Create space with empty name
    if (await spaceDropdown.isVisible({ timeout: 3000 })) {
      await spaceDropdown.click();
      await page.waitForTimeout(500);
      if (await newSpaceBtn.isVisible({ timeout: 3000 })) {
        await newSpaceBtn.click();
        await page.waitForTimeout(500);
        const createBtn = page.locator('.fixed button:has-text("Create")');
        if (await createBtn.isVisible({ timeout: 3000 })) {
          await createBtn.click();
          await page.waitForTimeout(1000);
          await screenshot(page, '04-07-empty-space-name');
          const cancelBtn = page.locator('.fixed button:has-text("Cancel")');
          if (await cancelBtn.isVisible({ timeout: 1000 })) {
            await cancelBtn.click();
          }
        }
      }
    }
  });

  test('5. Journal', async ({ page }) => {
    await login(page);

    // Navigate to Journal tab
    const journalTab = page.locator('button:has-text("Journal")');
    if (await journalTab.isVisible({ timeout: 3000 })) {
      await journalTab.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '05-01-journal-tab');
    }

    // Write a journal entry
    const journalTextarea = page.locator('textarea[aria-label="Journal entry"]').or(
      page.locator('textarea').first()
    );
    if (await journalTextarea.isVisible({ timeout: 5000 })) {
      await journalTextarea.fill('This is a test journal entry from the exploratory test. Testing various features of the journal component.');
      await page.waitForTimeout(1000);
      await screenshot(page, '05-02-journal-written');

      // Save
      const saveBtn = page.locator('button:has-text("Save")');
      if (await saveBtn.isVisible({ timeout: 3000 })) {
        await saveBtn.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '05-03-journal-saved');
      }
    }

    // Navigate to previous day
    const prevDay = page.locator('button[aria-label="Previous day"]').or(
      page.locator('button:has-text("←")').first()
    );
    if (await prevDay.isVisible({ timeout: 3000 })) {
      await prevDay.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '05-04-previous-day');
    }

    // Navigate to next day (back to today)
    const nextDay = page.locator('button[aria-label="Next day"]').or(
      page.locator('button:has-text("→")').first()
    );
    if (await nextDay.isVisible({ timeout: 3000 })) {
      await nextDay.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '05-05-back-to-today');

      // Verify our entry is still there
      const entryText = await journalTextarea.inputValue().catch(() => '');
      if (!entryText.includes('exploratory test')) {
        logBug('JOURNAL-01', 'Journal entry lost after navigating away and back', 'Write entry, go to prev day, come back');
      }
    }

    // Navigate forward past today
    if (await nextDay.isVisible({ timeout: 2000 })) {
      await nextDay.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '05-06-future-day');
      // Should show empty entry or be disabled
    }

    // Test saving empty journal
    if (await prevDay.isVisible({ timeout: 2000 })) {
      await prevDay.click();
      await prevDay.click();
      await page.waitForTimeout(1000);
      if (await journalTextarea.isVisible({ timeout: 2000 })) {
        await journalTextarea.fill('');
        const saveBtn = page.locator('button:has-text("Save")');
        if (await saveBtn.isVisible({ timeout: 2000 })) {
          await saveBtn.click();
          await page.waitForTimeout(1000);
          await screenshot(page, '05-07-empty-journal-save');
        }
      }
    }
  });

  test('6. Settings and Account', async ({ page }) => {
    await login(page);

    // Open settings dropdown
    // Settings is the gear icon in the header - look for it
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg') }).last();
    // Actually, let's try finding the settings menu trigger more precisely
    const allButtons = page.locator('header button, div.flex-shrink-0 button');
    const buttonCount = await allButtons.count();

    // The settings button is typically the last button in the header area
    // Let's click it
    for (let i = buttonCount - 1; i >= 0; i--) {
      const btn = allButtons.nth(i);
      const text = await btn.textContent();
      if (text?.trim() === '' || text?.includes('settings') || text?.includes('Settings')) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(1000);
    await screenshot(page, '06-01-settings-dropdown');

    // Click Account
    const accountBtn = page.locator('button:has-text("Account")');
    if (await accountBtn.isVisible({ timeout: 3000 })) {
      await accountBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '06-02-account-settings');

      // Check name field
      const nameInput = page.locator('input[placeholder="Enter your name"]').or(
        page.locator('.fixed input').first()
      );
      if (await nameInput.isVisible({ timeout: 3000 })) {
        await nameInput.clear();
        await nameInput.fill('Test User Exploratory');
        const updateBtn = page.locator('button:has-text("Update Name")');
        if (await updateBtn.isVisible({ timeout: 2000 })) {
          await updateBtn.click();
          await page.waitForTimeout(1000);
          await screenshot(page, '06-03-name-updated');
        }
      }

      // Close account modal
      const closeBtn = page.locator('.fixed button:has-text("Close")');
      if (await closeBtn.isVisible({ timeout: 2000 })) {
        await closeBtn.click();
      }
    }

    // Open settings again for Email Settings
    for (let i = buttonCount - 1; i >= 0; i--) {
      const btn = allButtons.nth(i);
      const text = await btn.textContent();
      if (text?.trim() === '' || text?.includes('settings') || text?.includes('Settings')) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(500);

    const emailSettingsBtn = page.locator('button:has-text("Email Settings")');
    if (await emailSettingsBtn.isVisible({ timeout: 3000 })) {
      await emailSettingsBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '06-04-email-settings');

      const cancelBtn = page.locator('.fixed button:has-text("Cancel")');
      if (await cancelBtn.isVisible({ timeout: 2000 })) {
        await cancelBtn.click();
      }
    }

    // Export Data
    for (let i = buttonCount - 1; i >= 0; i--) {
      const btn = allButtons.nth(i);
      const text = await btn.textContent();
      if (text?.trim() === '' || text?.includes('settings') || text?.includes('Settings')) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(500);

    const exportBtn = page.locator('button:has-text("Export Data")');
    if (await exportBtn.isVisible({ timeout: 3000 })) {
      await exportBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '06-05-export-data');

      const cancelBtn = page.locator('.fixed button:has-text("Cancel")');
      if (await cancelBtn.isVisible({ timeout: 2000 })) {
        await cancelBtn.click();
      }
    }

    // Contact
    for (let i = buttonCount - 1; i >= 0; i--) {
      const btn = allButtons.nth(i);
      const text = await btn.textContent();
      if (text?.trim() === '' || text?.includes('settings') || text?.includes('Settings')) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(500);

    const contactBtn = page.locator('button:has-text("Contact")');
    if (await contactBtn.isVisible({ timeout: 3000 })) {
      await contactBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '06-06-contact');

      const cancelBtn = page.locator('.fixed button:has-text("Cancel")');
      if (await cancelBtn.isVisible({ timeout: 2000 })) {
        await cancelBtn.click();
      }
    }
  });

  test('7. Assistant tab', async ({ page }) => {
    await login(page);

    // Navigate to Assistant tab
    const assistantTab = page.locator('button:has-text("Assistant")');
    if (await assistantTab.isVisible({ timeout: 3000 })) {
      await assistantTab.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '07-01-assistant-tab');
    }

    // Find the input
    const assistantInput = page.locator('textarea').or(page.locator('input[type="text"]')).last();
    if (await assistantInput.isVisible({ timeout: 5000 })) {
      // Send empty message
      await assistantInput.press('Enter');
      await page.waitForTimeout(1000);
      await screenshot(page, '07-02-empty-message');

      // Send a message
      await assistantInput.fill('What are my current tasks?');
      await page.waitForTimeout(500);
      await screenshot(page, '07-03-message-typed');

      // Send it
      const sendBtn = page.locator('button[type="submit"]').or(
        page.locator('button').filter({ has: page.locator('svg') }).last()
      );
      // Try Enter key
      await assistantInput.press('Enter');
      await page.waitForTimeout(5000);
      await screenshot(page, '07-04-after-send');

      // Check for response
      const hasResponse = await page.locator('.whitespace-pre-wrap, .markdown, [class*="message"]').isVisible({ timeout: 10000 }).catch(() => false);
      if (!hasResponse) {
        logBug('AGENT-01', 'No response from assistant after sending message', 'Type message and press Enter in assistant tab');
      }

      // Try another query
      await assistantInput.fill("What's the weather in New York?");
      await assistantInput.press('Enter');
      await page.waitForTimeout(8000);
      await screenshot(page, '07-05-weather-query');
    }
  });

  test('8. Edge cases and stress tests', async ({ page }) => {
    await login(page);

    // Test rapid tab switching
    const tabs = ['Tasks', 'Journal', 'Assistant', 'Tasks', 'Journal'];
    for (const tab of tabs) {
      const tabBtn = page.locator(`button:has-text("${tab}")`);
      if (await tabBtn.isVisible({ timeout: 1000 })) {
        await tabBtn.click();
        await page.waitForTimeout(200);
      }
    }
    await page.waitForTimeout(1000);
    await screenshot(page, '08-01-after-rapid-tab-switch');

    // Test browser back/forward
    await page.goBack();
    await page.waitForTimeout(1000);
    await screenshot(page, '08-02-after-back');

    await page.goForward();
    await page.waitForTimeout(1000);
    await screenshot(page, '08-03-after-forward');

    // Test page refresh while logged in
    await page.reload();
    await page.waitForTimeout(3000);
    await screenshot(page, '08-04-after-refresh');

    // Should still be logged in
    const loginPage = page.locator('input#email');
    const backToLogin = await loginPage.isVisible({ timeout: 3000 }).catch(() => false);
    if (backToLogin) {
      logBug('AUTH-01', 'User logged out after page refresh', 'Login, then refresh the page');
    }

    // Test double-click on task
    const anyTask = page.locator('div').filter({ hasText: /task/i }).first();
    if (await anyTask.isVisible({ timeout: 3000 })) {
      await anyTask.dblclick();
      await page.waitForTimeout(1000);
      await screenshot(page, '08-05-double-click-task');
    }

    // Test window resize (responsive)
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
    await page.waitForTimeout(1000);
    await screenshot(page, '08-06-mobile-viewport');

    await page.setViewportSize({ width: 1920, height: 1080 }); // Desktop
    await page.waitForTimeout(1000);
    await screenshot(page, '08-07-desktop-viewport');

    // Test keyboard shortcuts
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await screenshot(page, '08-08-after-escape');
  });

  test('9. Logout flow', async ({ page }) => {
    await login(page);

    // Open settings and logout
    const headerButtons = page.locator('div.flex-shrink-0 button, header button');
    const count = await headerButtons.count();

    for (let i = count - 1; i >= 0; i--) {
      const btn = headerButtons.nth(i);
      const text = await btn.textContent();
      if (text?.trim() === '' || text?.includes('Settings')) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(500);

    const logoutBtn = page.locator('button:has-text("Logout")');
    if (await logoutBtn.isVisible({ timeout: 3000 })) {
      await logoutBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, '09-01-after-logout');

      // Verify we're back at login
      const emailInput = page.locator('input#email');
      const atLogin = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
      if (!atLogin) {
        logBug('AUTH-02', 'Not redirected to login page after logout', 'Click Logout in settings menu');
      }
    }
  });

  test('10. Concurrent operations and data integrity', async ({ page }) => {
    await login(page);

    // Add task, immediately switch space, check original space
    const taskInput = page.getByPlaceholder('Add a new task...');
    await taskInput.fill('Data integrity test task');
    await taskInput.press('Enter');
    await page.waitForTimeout(500);

    // Immediately switch to another space
    const spaceDropdown = page.getByTestId('space-dropdown-trigger').or(
      page.locator('button').filter({ hasText: /Default|Personal/ }).first()
    );
    if (await spaceDropdown.isVisible({ timeout: 3000 })) {
      await spaceDropdown.click();
      await page.waitForTimeout(500);

      // Check if there are other spaces
      const spaceItems = page.locator('[role="option"], div.cursor-pointer, div.group');
      const spaceCount = await spaceItems.count();
      await screenshot(page, '10-01-spaces-before-switch');

      if (spaceCount > 1) {
        await spaceItems.nth(1).click();
        await page.waitForTimeout(1000);
        await screenshot(page, '10-02-switched-space');

        // Switch back
        if (await spaceDropdown.isVisible({ timeout: 2000 })) {
          await spaceDropdown.click();
          await page.waitForTimeout(500);
          await spaceItems.first().click();
          await page.waitForTimeout(1000);
          await screenshot(page, '10-03-back-to-original');

          // Verify task is there
          const integrityTask = page.locator('text=Data integrity test task');
          const visible = await integrityTask.isVisible({ timeout: 3000 }).catch(() => false);
          if (!visible) {
            logBug('DATA-01', 'Task disappeared after rapid space switching', 'Add task, quickly switch space, switch back');
          }
        }
      } else {
        // Close dropdown
        await page.keyboard.press('Escape');
      }
    }

    // Clean up: delete all test tasks
    await page.waitForTimeout(1000);
    let deleteAttempts = 0;
    while (deleteAttempts < 20) {
      const deleteBtn = page.locator('button[aria-label="Delete task"]').first();
      if (await deleteBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await deleteBtn.click();
        await page.waitForTimeout(500);
        deleteAttempts++;
      } else {
        break;
      }
    }
    // Also clean up completed tasks
    const showCompletedBtn = page.locator('button').filter({ hasText: /Show Completed/i });
    if (await showCompletedBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await showCompletedBtn.click();
      await page.waitForTimeout(500);
      while (deleteAttempts < 30) {
        const deleteBtn = page.locator('button[aria-label="Delete task"]').first();
        if (await deleteBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await deleteBtn.click();
          await page.waitForTimeout(500);
          deleteAttempts++;
        } else {
          break;
        }
      }
    }
    await screenshot(page, '10-04-cleanup-done');
  });
});
