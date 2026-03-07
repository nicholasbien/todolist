import { test, expect } from '@playwright/test';
import { loginTestUser, waitForServiceWorkerReady, setOffline, uniqueLabel } from './helpers';

test('offline todo create/update/complete/delete syncs after reconnect', async ({ page }) => {
  await loginTestUser(page);
  await waitForServiceWorkerReady(page);

  await setOffline(page, true);

  const todoA = uniqueLabel('offline-todo-a');
  await page.getByPlaceholder('Add a new task...').fill(todoA);
  await page.keyboard.press('Enter');
  await expect(page.getByText(todoA, { exact: true })).toBeVisible();

  const todoARow = page
    .getByText(todoA, { exact: true })
    .locator('xpath=ancestor::div[contains(@class, \"p-4\")]')
    .first();
  const prioritySelect = todoARow.locator('select').nth(1);
  await prioritySelect.selectOption('High');
  await expect(prioritySelect).toHaveValue('High');
  await todoARow.getByRole('button', { name: 'Mark task as complete' }).click({ force: true });

  const todoB = uniqueLabel('offline-todo-b');
  await page.getByPlaceholder('Add a new task...').fill(todoB);
  await page.keyboard.press('Enter');
  await expect(page.getByText(todoB, { exact: true })).toBeVisible();
  const todoBRow = page
    .getByText(todoB, { exact: true })
    .locator('xpath=ancestor::div[contains(@class, "p-4")]')
    .first();
  await todoBRow.getByRole('button', { name: 'Delete task' }).click({ force: true });
  await expect(page.getByText(todoB, { exact: true })).toHaveCount(0);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {});
  let todoAfterReload = page.getByText(todoA, { exact: true });
  if ((await todoAfterReload.count()) === 0) {
    const showCompleted = page.getByRole('button', { name: /Show Completed/i });
    if (await showCompleted.isVisible()) {
      await showCompleted.click();
    }
  }
  await expect(page.getByText(todoA, { exact: true })).toBeVisible();

  await setOffline(page, false);
  await page.waitForFunction(() => navigator.onLine, null, { timeout: 5000 }).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {});
  todoAfterReload = page.getByText(todoA, { exact: true });
  if ((await todoAfterReload.count()) === 0) {
    const showCompleted = page.getByRole('button', { name: /Show Completed/i });
    if (await showCompleted.isVisible()) {
      await showCompleted.click();
    }
  }
  await expect(page.getByText(todoA, { exact: true })).toBeVisible();
  await expect(page.getByText(todoB, { exact: true })).toHaveCount(0);
});

test('offline space and category changes sync after reconnect', async ({ page }) => {
  await loginTestUser(page);
  await waitForServiceWorkerReady(page);

  await setOffline(page, true);

  const spaceName = uniqueLabel('Offline Space');
  await page.getByTestId('space-dropdown-trigger').click();
  await page.getByTestId('space-create-button').click();
  await page.getByPlaceholder('Space name').fill(spaceName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByTestId('space-dropdown-trigger')).toContainText(spaceName);

  const categoryName = uniqueLabel('Offline Category');
  await page.getByTestId('add-category-button').click();
  await page.getByPlaceholder('New category name').fill(categoryName);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('button', { name: categoryName })).toBeVisible();

  await setOffline(page, false);
  await page.waitForFunction(() => navigator.onLine, null, { timeout: 5000 }).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('space-dropdown-trigger')).toContainText(spaceName);
  await expect(page.getByRole('button', { name: categoryName })).toBeVisible();
});

test('offline journal save syncs after reconnect', async ({ page }) => {
  await loginTestUser(page);
  await waitForServiceWorkerReady(page);

  await page.getByRole('button', { name: 'Journal' }).click();
  await expect(page.getByLabel('Journal entry')).toBeVisible();

  await setOffline(page, true);
  const journalText = uniqueLabel('Offline journal');
  await page.getByLabel('Journal entry').fill(journalText);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved offline')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.getByRole('button', { name: 'Journal' }).click();
  await expect(page.getByLabel('Journal entry')).toHaveValue(journalText);

  await setOffline(page, false);
  await page.waitForFunction(() => navigator.onLine, null, { timeout: 5000 }).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Journal' }).click();
  await expect(page.getByLabel('Journal entry')).toHaveValue(journalText);
});
