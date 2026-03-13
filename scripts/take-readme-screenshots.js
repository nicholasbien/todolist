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

  // ── 2. Populate demo data ────────────────────────────────────
  console.log('2. Adding demo tasks...');
  const todos = [
    { text: 'Review Q4 project proposals', completed: false, category: 'Work' },
    { text: 'Prepare slides for Monday team meeting', completed: false, category: 'Work' },
    { text: 'Update project documentation', completed: true, category: 'Work' },
    { text: 'Fix bug in authentication system', completed: true, category: 'Work' },
    { text: 'Optimize database queries', completed: false, category: 'Work' },
    { text: 'Schedule 1:1 with team members', completed: false, category: 'Work' },
    { text: 'Book dentist appointment', completed: false, category: 'Personal' },
    { text: 'Plan weekend hiking trip', completed: false, category: 'Personal' },
    { text: 'Call mom for her birthday', completed: true, category: 'Personal' },
    { text: 'Review monthly budget', completed: false, category: 'Personal' },
    { text: 'Morning yoga session', completed: true, category: 'Health' },
    { text: 'Meal prep for the week', completed: false, category: 'Health' },
    { text: 'Schedule annual checkup', completed: false, category: 'Health' },
    { text: 'Complete Python course module', completed: false, category: 'Learning' },
    { text: 'Read Atomic Habits chapter 3', completed: true, category: 'Learning' },
    { text: 'Practice Spanish on Duolingo', completed: false, category: 'Learning' },
    { text: 'Buy groceries for dinner party', completed: false, category: 'Shopping' },
    { text: 'Order new running shoes', completed: true, category: 'Shopping' },
  ];
  for (const todo of todos) {
    await api('POST', '/todos', token, { ...todo, space_id: spaceId });
  }
  console.log(`   Added ${todos.length} tasks`);

  console.log('3. Adding journal entries...');
  const journals = [
    { date: '2026-03-13', text: 'Great day today! Completed several important tasks and feeling productive.\n\nMade progress on the project and had good meetings with the team. Everyone is aligned and motivated.\n\nTook time for a walk this afternoon which helped clear my mind. Sometimes stepping away brings the best solutions.\n\nLooking forward to tomorrow\'s challenges and opportunities.' },
    { date: '2026-03-12', text: 'Solid progress today despite some unexpected challenges.\n\nDebugged a tricky issue that took longer than expected, but learned a lot in the process.\n\nHad an excellent brainstorming session with the team. New ideas are flowing.\n\nEvening was relaxing - caught up on reading and planned tomorrow\'s priorities.' },
    { date: '2026-03-11', text: 'Wrapped up the week strong and feeling accomplished.\n\nCompleted all planned tasks and tackled items from the backlog.\n\nTeam sync was productive - everyone\'s excited about what we\'re building.' },
  ];
  for (const j of journals) {
    await api('POST', '/journals', token, { ...j, space_id: spaceId });
  }
  console.log('   Added 3 journal entries');

  // ── 3. Launch browser with route interception ────────────────
  console.log('\n4. Launching browser...');
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

  // ── Task List ──────────────────────────────────────────────────
  console.log('\n5. Taking screenshots...');
  await goTab('Tasks');
  await page.waitForTimeout(2000);
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
