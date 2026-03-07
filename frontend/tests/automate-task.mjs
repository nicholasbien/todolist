import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();
  const ssDir = '/data/workspace/todolist/frontend/public/screenshots';

  try {
    // Navigate and login
    console.log('Navigating...');
    await page.goto('https://todolist.nyc', { waitUntil: 'networkidle', timeout: 30000 });
    const gs = page.locator('button, a').filter({ hasText: /get started/i }).first();
    if (await gs.count() > 0) { await gs.click(); await page.waitForTimeout(2000); }
    await page.locator('input').first().fill('test@example.com');
    await page.locator('button:has-text("Send Verification Code"), button:has-text("Get Started")').first().click();
    await page.waitForTimeout(3000);
    await page.locator('input').first().fill('000000');
    await page.locator('button:has-text("Sign In")').first().click();
    await page.waitForTimeout(5000);
    console.log('Logged in');

    // Create task
    const taskInput = page.locator('input[placeholder*="task" i], input[placeholder*="add" i]').first();
    await taskInput.waitFor({ timeout: 15000 });
    await taskInput.fill('Demo: follow up with Alex');
    await taskInput.press('Enter');
    console.log('Task submitted');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${ssDir}/debug-07.png` });

    // Find selects near our task using coordinate matching
    const selectPositions = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      const results = [];
      while (node = walker.nextNode()) {
        if (node.textContent && node.textContent.trim() === 'Demo: follow up with Alex') {
          let el = node.parentElement;
          for (let i = 0; i < 10; i++) {
            if (!el) break;
            const selects = el.querySelectorAll('select');
            if (selects.length >= 2) {
              const textRect = node.parentElement.getBoundingClientRect();
              results.push({
                textY: textRect.y,
                selects: Array.from(selects).map(s => ({
                  y: s.getBoundingClientRect().y,
                  options: Array.from(s.options).map(o => o.text),
                  value: s.value
                }))
              });
              break;
            }
            el = el.parentElement;
          }
        }
      }
      return results;
    });

    console.log(`Found ${selectPositions.length} task card(s) with "Demo: follow up with Alex"`);

    // Use the last one (most recently created)
    if (selectPositions.length > 0) {
      const card = selectPositions[selectPositions.length - 1];
      console.log(`Card textY: ${card.textY}`);

      for (const selInfo of card.selects) {
        console.log(`  Select at y=${selInfo.y}: [${selInfo.options.join(', ')}] = ${selInfo.value}`);
      }

      // Now use Playwright's selectOption on selects matched by position
      // Get ALL priority selects on the page
      const allSelects = await page.locator('select:visible').all();
      console.log(`Total visible selects: ${allSelects.length}`);

      const targetPriorityY = card.selects.find(s => s.options.includes('High'))?.y;
      const targetCategoryY = card.selects.find(s => s.options.includes('Work'))?.y;

      for (const sel of allSelects) {
        const box = await sel.boundingBox();
        if (!box) continue;

        // Match by y coordinate (within 5px)
        if (targetPriorityY !== undefined && Math.abs(box.y - targetPriorityY) < 5) {
          const options = await sel.locator('option').allTextContents();
          if (options.includes('High')) {
            await sel.selectOption('High');
            console.log('Priority set to High!');
          }
        }
        if (targetCategoryY !== undefined && Math.abs(box.y - targetCategoryY) < 5) {
          const options = await sel.locator('option').allTextContents();
          if (options.includes('Work')) {
            await sel.selectOption('Work');
            console.log('Category confirmed as Work!');
          }
        }
      }
    }

    await page.waitForTimeout(2000);

    // Scroll to show the task
    const taskText = page.locator('text="Demo: follow up with Alex"').last();
    await taskText.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Final screenshot
    await page.screenshot({ path: `${ssDir}/task-created.png` });
    console.log('Final screenshot saved');
    console.log('SUCCESS');

  } catch (err) {
    console.error('ERROR:', err.message);
    await page.screenshot({ path: `${ssDir}/debug-error.png` }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
