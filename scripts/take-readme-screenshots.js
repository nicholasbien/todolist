/**
 * take-readme-screenshots.js
 *
 * Captures high-level feature screenshots for the README.
 * Creates a demo user via backend API, uses Playwright route interception
 * to bypass service worker auth issues, takes screenshots.
 *
 * Requires:
 *   - Backend running on port 8141
 *   - Frontend running on port 3141
 *   - MongoDB running locally
 *
 * Usage:
 *   node scripts/take-readme-screenshots.js
 */

const { chromium } = require(
  require.resolve('playwright', { paths: ['/data/workspace/todolist/frontend'] })
);
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const DIR = path.join(__dirname, '..', 'docs', 'screenshots');
const FRONTEND_URL = 'http://localhost:3141';
const BACKEND_URL = 'http://localhost:8141';
const EMAIL = `demo-${Date.now()}@example.com`;

fs.mkdirSync(DIR, { recursive: true });

function httpReq(method, url, headers, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = data ? JSON.stringify(data) : null;
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function api(method, apiPath, token, data) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return httpReq(method, `${BACKEND_URL}${apiPath}`, headers, data).then(r => r.body);
}

function getVerificationCode(email) {
  return execSync(
    `mongosh --quiet --eval 'db = db.getSiblingDB("todo_db"); db.users.findOne({email: "${email}"}).verification_code'`,
    { encoding: 'utf8' }
  ).trim();
}

// Known API path prefixes that should be proxied to backend
const API_PREFIXES = [
  '/todos', '/auth', '/spaces', '/journals', '/sessions',
  '/chat', '/agent', '/categories', '/insights', '/export',
  '/health', '/activity',
];

function isApiRequest(pathname) {
  // Match both direct paths (/todos) and proxy paths (/api/todos)
  const cleanPath = pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
  return API_PREFIXES.some(prefix => cleanPath.startsWith(prefix));
}

function getBackendPath(pathname) {
  // Strip /api/ prefix if present to get the backend path
  return pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
}

(async () => {
  // ── 1. Create user via backend API ───────────────────────────
  console.log('1. Creating user via backend API...');
  await api('POST', '/auth/signup', null, { email: EMAIL });
  const code = getVerificationCode(EMAIL);
  const loginResult = await api('POST', '/auth/login', null, { email: EMAIL, code });
  const token = loginResult.token;

  // Set name
  const nameResult = await api('POST', '/auth/update-name', token, { first_name: 'Alex' });
  const updatedUser = nameResult.user;
  console.log(`   Created: ${EMAIL} (${updatedUser.first_name})`);

  const spaceId = updatedUser.email_spaces[0];

  // ── 2. Create categories ──────────────────────────────────────
  console.log('2. Creating categories...');
  const categories = ['Work', 'Personal', 'Health', 'Learning', 'Errands'];
  for (const name of categories) {
    await api('POST', '/categories', token, { name, space_id: spaceId });
  }
  console.log(`   Created ${categories.length} categories`);

  // ── 3. Populate demo tasks ──────────────────────────────────
  console.log('3. Adding demo tasks...');

  // Helper to generate ISO date strings relative to today
  const today = new Date();
  const dayOffset = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const todos = [
    // Work tasks — mix of active, completed, with due dates
    { text: 'Review Q1 roadmap and update milestones', completed: false, category: 'Work', priority: 'High', dueDate: dayOffset(2) },
    { text: 'Prepare slides for Monday standup', completed: false, category: 'Work', priority: 'High', dueDate: dayOffset(1) },
    { text: 'Deploy v2.4 hotfix to production', completed: true, category: 'Work', priority: 'High' },
    { text: 'Write integration tests for payments API', completed: false, category: 'Work', priority: 'Medium', dueDate: dayOffset(5) },
    { text: 'Refactor auth middleware to support OAuth', completed: false, category: 'Work', priority: 'Medium', dueDate: dayOffset(7) },
    { text: 'Code review: PR #218 search optimization', completed: true, category: 'Work', priority: 'Medium' },
    { text: 'Update CI pipeline for Node 22', completed: true, category: 'Work', priority: 'Low' },

    // Personal tasks
    { text: 'Plan weekend trip to the mountains', completed: false, category: 'Personal', priority: 'Medium', dueDate: dayOffset(4) },
    { text: 'Call insurance about renewal', completed: false, category: 'Personal', priority: 'High', dueDate: dayOffset(1) },
    { text: 'Send birthday gift to Sarah', completed: true, category: 'Personal', priority: 'High' },
    { text: 'Organize closet and donate old clothes', completed: false, category: 'Personal', priority: 'Low' },

    // Health tasks
    { text: 'Schedule annual physical', completed: false, category: 'Health', priority: 'Medium', dueDate: dayOffset(10) },
    { text: 'Meal prep: chicken + veggie bowls', completed: false, category: 'Health', priority: 'Medium', dueDate: dayOffset(0) },
    { text: 'Morning run — 5K', completed: true, category: 'Health', priority: 'Low' },
    { text: 'Refill prescriptions at pharmacy', completed: false, category: 'Health', priority: 'High', dueDate: dayOffset(2) },

    // Learning tasks
    { text: 'Finish Rust ownership chapter', completed: false, category: 'Learning', priority: 'Medium', dueDate: dayOffset(3) },
    { text: 'Watch MIT distributed systems lecture 6', completed: false, category: 'Learning', priority: 'Low' },
    { text: 'Complete LeetCode daily challenge', completed: true, category: 'Learning', priority: 'Medium' },

    // Errands
    { text: 'Pick up dry cleaning', completed: false, category: 'Errands', priority: 'Low', dueDate: dayOffset(1) },
    { text: 'Return Amazon package at UPS', completed: false, category: 'Errands', priority: 'Medium', dueDate: dayOffset(0) },
    { text: 'Get car oil change', completed: true, category: 'Errands', priority: 'Medium' },
  ];

  const createdTodos = [];
  for (const todo of todos) {
    const result = await api('POST', '/todos', token, { ...todo, space_id: spaceId });
    createdTodos.push(result);
  }
  console.log(`   Added ${todos.length} tasks`);

  // ── 4. Add subtasks to a parent task ─────────────────────────
  console.log('4. Adding subtasks...');
  // Find the "Review Q1 roadmap" task to add subtasks to
  const parentTodo = createdTodos[0]; // "Review Q1 roadmap and update milestones"
  const subtasks = [
    { text: 'Collect team status updates', completed: true, category: 'Work', priority: 'Medium' },
    { text: 'Draft milestone timeline', completed: true, category: 'Work', priority: 'Medium' },
    { text: 'Review with engineering leads', completed: false, category: 'Work', priority: 'High' },
    { text: 'Finalize and share with stakeholders', completed: false, category: 'Work', priority: 'High' },
  ];
  for (const sub of subtasks) {
    await api('POST', '/todos', token, { ...sub, space_id: spaceId, parent_id: parentTodo._id });
  }
  console.log(`   Added ${subtasks.length} subtasks`);

  // ── 5. Add journal entries ───────────────────────────────────
  console.log('5. Adding journal entries...');
  const journals = [
    { date: dayOffset(0), text: 'Productive morning — knocked out the hotfix deploy before standup. The payments API tests are coming along; should finish integration coverage by end of week.\n\nHad a great 1:1 with Jamie about the OAuth refactor. We agreed on the middleware pattern and she\'ll pair with me Thursday.\n\nAfternoon: reviewed the search optimization PR. Clean implementation, left a few comments on edge cases. Approved after the fixes.\n\nEvening run felt good — 5K in 24:30. Slowly getting faster.' },
    { date: dayOffset(-1), text: 'Deep work day. Spent most of the morning on the Rust ownership chapter — the borrow checker is finally clicking.\n\nLunch break: watched half of the MIT distributed systems lecture. Raft consensus is elegant.\n\nAfternoon was errands and life admin. Got the car serviced, picked up prescriptions.\n\nPlanning the mountain trip this weekend. Found a cabin with good reviews near the trailhead.' },
    { date: dayOffset(-2), text: 'Monday standup went well — team is aligned on Q1 priorities.\n\nSpent the day on CI pipeline migration to Node 22. A few package compatibility issues but nothing major. Tests all passing now.\n\nSarah loved the birthday gift! The personalized notebook was a good call.\n\nWinding down with some LeetCode — the daily challenge was a fun graph problem.' },
  ];
  for (const j of journals) {
    await api('POST', '/journals', token, { ...j, space_id: spaceId });
  }
  console.log('   Added 3 journal entries');

  // ── 6. Launch browser with route interception ────────────────
  console.log('\n6. Launching browser...');
  const browser = await chromium.launch({ headless: true });

  // Disable service worker so we control all routing
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    serviceWorkers: 'block',  // Block service workers
  });
  const page = await context.newPage();

  // Intercept all API requests and proxy them to the backend with auth.
  // With service workers blocked, fetch('/todos') goes to Next.js which doesn't
  // have a route for it (only /api/[...proxy]). We intercept and proxy to backend.
  await page.route('**/*', async (route) => {
    const request = route.request();
    let url;
    try {
      url = new URL(request.url());
    } catch {
      await route.continue();
      return;
    }

    const frontendOrigin = new URL(FRONTEND_URL).origin;
    // Only intercept same-origin API requests
    if (url.origin === frontendOrigin && isApiRequest(url.pathname)) {
      // Forward to backend directly (strip /api/ prefix if present)
      const backendPath = getBackendPath(url.pathname);
      const backendUrl = `${BACKEND_URL}${backendPath}${url.search}`;
      // console.log(`   [proxy] ${request.method()} ${url.pathname} -> ${backendUrl}`);

      try {
        const fetchOpts = {
          method: request.method(),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        };
        if (request.method() !== 'GET' && request.method() !== 'HEAD') {
          const postData = request.postData();
          if (postData) fetchOpts.body = postData;
        }

        // Use Node.js fetch (available in Node 18+)
        const resp = await fetch(backendUrl, fetchOpts);
        const body = await resp.text();

        await route.fulfill({
          status: resp.status,
          contentType: resp.headers.get('content-type') || 'application/json',
          body,
        });
      } catch (err) {
        console.error(`   Proxy error for ${url.pathname}:`, err.message);
        await route.abort();
      }
    } else {
      await route.continue();
    }
  });

  // Load page
  await page.goto(FRONTEND_URL);
  await page.waitForTimeout(1000);

  // Set auth in localStorage
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  }, { token, user: updatedUser });

  // Reload to pick up auth state
  await page.reload();
  await page.waitForTimeout(4000);

  // Verify logged in
  try {
    await page.waitForSelector('button[title="Settings"]', { timeout: 15000 });
    console.log('   Logged in!');
  } catch {
    await page.screenshot({ path: path.join(DIR, 'debug-state.png') });
    const bodyText = await page.textContent('body');
    console.error('   Not logged in. Page:', bodyText.slice(0, 300));
    await browser.close();
    process.exit(1);
  }

  // Wait for data to fully load
  await page.waitForTimeout(2000);

  // Dismiss any error banners
  const xButtons = await page.$$('button:has-text("\u00d7")');
  for (const btn of xButtons) {
    try { await btn.click(); } catch {}
  }
  await page.waitForTimeout(500);

  const ss = async (name) => {
    await page.screenshot({ path: path.join(DIR, name), type: 'png' });
    console.log(`   Saved: ${name}`);
  };

  const goTab = async (name) => {
    await page.getByRole('button', { name, exact: true }).nth(0).click();
    await page.waitForTimeout(2000);
  };

  // ── Task List (Active tab) ──────────────────────────────────────
  console.log('\n7. Taking screenshots...');
  await goTab('Tasks');
  await page.waitForTimeout(2000);

  // Try to expand subtasks on the first task if there's a toggle button
  try {
    const subtaskToggle = await page.$('button[title*="subtask" i], button[aria-label*="subtask" i], [data-testid="subtask-toggle"]');
    if (subtaskToggle) {
      await subtaskToggle.click();
      await page.waitForTimeout(1000);
    }
  } catch {}

  await ss('task-list.png');

  // ── Journal ────────────────────────────────────────────────────
  await goTab('Journal');
  await page.waitForTimeout(2000);
  await ss('journal.png');

  // ── Assistant ──────────────────────────────────────────────────
  await goTab('Assistant');
  await page.waitForTimeout(2000);
  await ss('assistant.png');

  console.log('\nDone! Screenshots saved to docs/screenshots/');
  await browser.close();
})();
