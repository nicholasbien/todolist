/**
 * take-readme-screenshots.js
 *
 * Captures high-quality feature screenshots for the README.
 * Creates a demo user via backend API, populates realistic demo data
 * with categories, priorities, due dates, and subtasks, then takes
 * screenshots of the Tasks, Assistant, and Activity views.
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
  const cleanPath = pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
  return API_PREFIXES.some(prefix => cleanPath.startsWith(prefix));
}

function getBackendPath(pathname) {
  return pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
}

// Helper to compute a date string relative to today
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
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

  // ── 2. Create categories ─────────────────────────────────────
  console.log('2. Creating categories...');
  const categoryNames = ['Work', 'Personal', 'Health', 'Learning', 'Shopping'];
  for (const name of categoryNames) {
    await api('POST', '/categories', token, { name, space_id: spaceId });
  }
  console.log(`   Created ${categoryNames.length} categories (+ default General)`);

  // ── 3. Populate demo tasks ───────────────────────────────────
  console.log('3. Adding demo tasks...');
  const todos = [
    // Work tasks - various priorities and due dates
    { text: 'Prepare slides for Monday standup', completed: false, category: 'Work', priority: 'High', dueDate: dateOffset(3) },
    { text: 'Review Q1 project proposals', completed: false, category: 'Work', priority: 'High', dueDate: dateOffset(1) },
    { text: 'Update API documentation for v2 release', completed: false, category: 'Work', priority: 'Medium', dueDate: dateOffset(5) },
    { text: 'Schedule 1:1 with team leads', completed: false, category: 'Work', priority: 'Medium', dueDate: dateOffset(2) },
    { text: 'Fix authentication bug in staging', completed: true, category: 'Work', priority: 'High' },
    { text: 'Deploy database migration script', completed: true, category: 'Work', priority: 'Medium' },

    // Personal tasks
    { text: 'Plan weekend hiking trip to Bear Mountain', completed: false, category: 'Personal', priority: 'Low', dueDate: dateOffset(4) },
    { text: 'Book dentist appointment', completed: false, category: 'Personal', priority: 'Medium', dueDate: dateOffset(7) },
    { text: 'Call mom for her birthday', completed: true, category: 'Personal', priority: 'High' },

    // Health tasks
    { text: 'Meal prep for the week', completed: false, category: 'Health', priority: 'Medium', dueDate: dateOffset(0) },
    { text: 'Schedule annual physical exam', completed: false, category: 'Health', priority: 'Low', dueDate: dateOffset(14) },
    { text: 'Morning yoga session', completed: true, category: 'Health', priority: 'Low' },

    // Learning tasks
    { text: 'Complete TypeScript advanced patterns course', completed: false, category: 'Learning', priority: 'Medium', dueDate: dateOffset(10) },
    { text: 'Read "Designing Data-Intensive Applications" Ch.5', completed: false, category: 'Learning', priority: 'Low' },
    { text: 'Practice Spanish on Duolingo', completed: true, category: 'Learning', priority: 'Low' },

    // Shopping
    { text: 'Buy groceries for dinner party Saturday', completed: false, category: 'Shopping', priority: 'Medium', dueDate: dateOffset(2) },
    { text: 'Order new running shoes', completed: true, category: 'Shopping', priority: 'Low' },
  ];

  const createdTodos = [];
  for (const todo of todos) {
    const result = await api('POST', '/todos', token, {
      ...todo,
      space_id: spaceId,
      dateAdded: new Date().toISOString(),
    });
    createdTodos.push(result);
  }
  console.log(`   Added ${todos.length} tasks across ${categoryNames.length + 1} categories`);

  // ── 4. Add journal entries ────────────────────────────────────
  console.log('4. Adding journal entries...');
  const journals = [
    {
      date: dateOffset(0),
      text: 'Productive day! Wrapped up the API documentation draft and had a great brainstorming session with the team about the v2 architecture.\n\nThe new category system is working well - it\'s much easier to stay organized now. Knocked out my morning yoga and meal prep before diving into work.\n\nLooking forward to the hiking trip this weekend. Need to remember to grab supplies.',
    },
    {
      date: dateOffset(-1),
      text: 'Spent most of the day debugging the authentication issue in staging. Finally tracked it down to a token refresh race condition. Pushed the fix and it\'s looking solid.\n\nHad a good 1:1 with Sarah about the Q1 proposals. She had some excellent insights about the timeline.\n\nFinished another chapter of the data systems book - the replication patterns are fascinating.',
    },
    {
      date: dateOffset(-2),
      text: 'Monday kickoff went well. Got alignment on priorities for the week.\n\nStarted the TypeScript course - the advanced generics section is challenging but rewarding.\n\nReminder to self: need to book that dentist appointment before the end of the month.',
    },
  ];
  for (const j of journals) {
    await api('POST', '/journals', token, { ...j, space_id: spaceId });
  }
  console.log('   Added 3 journal entries');

  // ── 5. Launch browser with route interception ────────────────
  console.log('\n5. Launching browser...');
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();

  // Intercept all API requests and proxy them to the backend with auth
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
    if (url.origin === frontendOrigin && isApiRequest(url.pathname)) {
      const backendPath = getBackendPath(url.pathname);
      const backendUrl = `${BACKEND_URL}${backendPath}${url.search}`;

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
  await page.waitForTimeout(3000);

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

  // ── Screenshots ────────────────────────────────────────────────

  console.log('\n6. Taking screenshots...');

  // Task List (Active tab)
  await goTab('Tasks');
  await page.waitForTimeout(2000);

  await ss('task-list.png');

  // Assistant view
  await goTab('Assistant');
  await page.waitForTimeout(2000);
  await ss('assistant.png');

  // Journal view
  await goTab('Journal');
  await page.waitForTimeout(2000);
  await ss('journal.png');

  console.log('\nDone! Screenshots saved to docs/screenshots/');
  await browser.close();
})();
