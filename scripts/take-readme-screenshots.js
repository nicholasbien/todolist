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
  const cleanPath = pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
  return API_PREFIXES.some(prefix => cleanPath.startsWith(prefix));
}

function getBackendPath(pathname) {
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
  const categories = ['Dev', 'Product', 'Infrastructure', 'Design', 'Personal'];
  for (const name of categories) {
    await api('POST', '/categories', token, { name, space_id: spaceId });
  }
  console.log(`   Created ${categories.length} categories`);

  // ── 3. Populate demo tasks ──────────────────────────────────
  console.log('3. Adding demo tasks...');

  const today = new Date();
  const dayOffset = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // Realistic developer task list — ordered so auto sort (High -> newest first)
  // shows the most visually diverse tasks at the top of the viewport.
  // Auto sort: High priority first, then by dateAdded desc (newest first).
  // So the LAST-created High-priority task appears first.
  const todos = [
    // Completed tasks (these go to Completed tab, order doesn't matter for screenshot)
    { text: 'Upgrade Next.js to v15 and fix breaking changes', completed: true, category: 'Dev', priority: 'High' },
    { text: 'Fix N+1 query in dashboard analytics endpoint', completed: true, category: 'Dev', priority: 'High' },
    { text: 'Ship pricing page A/B test results', completed: true, category: 'Product', priority: 'High' },
    { text: 'Migrate CI from CircleCI to GitHub Actions', completed: true, category: 'Infrastructure', priority: 'Medium' },
    { text: 'Submit expense report for team offsite', completed: true, category: 'Personal', priority: 'Medium' },

    // Low priority (appear at bottom)
    { text: 'Add OpenTelemetry tracing to API gateway', completed: false, category: 'Dev', priority: 'Low' },
    { text: 'Update component library with new color tokens', completed: false, category: 'Design', priority: 'Low' },
    { text: 'Finish reading "Designing Data-Intensive Applications"', completed: false, category: 'Personal', priority: 'Low' },

    // Medium priority (appear in middle)
    { text: 'Write spec for collaborative editing feature', completed: false, category: 'Product', priority: 'Medium', dueDate: dayOffset(7) },
    { text: 'Review mobile nav redesign mockups', completed: false, category: 'Design', priority: 'Medium', dueDate: dayOffset(1) },
    { text: 'Analyze user drop-off in onboarding funnel', completed: false, category: 'Product', priority: 'Medium', dueDate: dayOffset(4) },
    { text: 'Configure Datadog alerts for P99 latency > 500ms', completed: false, category: 'Infrastructure', priority: 'Medium', dueDate: dayOffset(3) },
    { text: 'Migrate user sessions from Redis to PostgreSQL', completed: false, category: 'Dev', priority: 'Medium', dueDate: dayOffset(5) },
    { text: 'Review PR #342 — search query optimization', completed: false, category: 'Dev', priority: 'Medium', dueDate: dayOffset(1) },

    // High priority — created LAST so they appear first in auto sort.
    // Order: last created = top of list. We want diverse categories visible.
    { text: 'Set up staging environment on AWS ECS', completed: false, category: 'Infrastructure', priority: 'High', dueDate: dayOffset(2) },
    { text: 'Book flights for React Summit conference', completed: false, category: 'Personal', priority: 'High', dueDate: dayOffset(5) },
    { text: 'Draft Q2 roadmap and review with stakeholders', completed: false, category: 'Product', priority: 'High', dueDate: dayOffset(3) },
    { text: 'Write integration tests for payments webhook handler', completed: false, category: 'Dev', priority: 'High', dueDate: dayOffset(2) },
    { text: 'Rotate production database credentials', completed: false, category: 'Infrastructure', priority: 'High', dueDate: dayOffset(0) },
    { text: 'Fix auth token refresh race condition', completed: false, category: 'Dev', priority: 'High', dueDate: dayOffset(0) },
  ];

  for (const todo of todos) {
    await api('POST', '/todos', token, { ...todo, space_id: spaceId });
  }
  console.log(`   Added ${todos.length} tasks`);

  // ── 4. Add journal entries ───────────────────────────────────
  console.log('4. Adding journal entries...');
  const journals = [
    { date: dayOffset(0), text: 'Productive morning — fixed the auth token race condition before standup. The issue was a missing mutex on the refresh endpoint; two concurrent requests could both trigger a refresh and invalidate each other\'s tokens.\n\nAfternoon deep work on the payments webhook handler. Stripe\'s idempotency key handling is tricky but the test coverage is solid now. Need to add edge cases for partial refunds tomorrow.\n\nQuick sync with Jamie about the staging environment — ECS cluster is up, just need the load balancer configured. Should be ready for QA by Thursday.\n\nEvening: read two chapters of DDIA. The section on linearizability vs serializability finally clicked.' },
    { date: dayOffset(-1), text: 'Started the day reviewing PR #342 — clever approach to search optimization using trigram indexes. Left a few comments about query plan caching but approved after the fixes.\n\nSpent most of the afternoon on the Q2 roadmap draft. Customer survey results are in — top requests are collaborative editing and better mobile experience. Both align with what we\'ve been planning.\n\nGood 1:1 with the team about the Redis to PostgreSQL migration. We\'ll go with a dual-write approach to avoid downtime. Target is end of month.\n\nBookmarked flights for React Summit — early bird pricing ends Friday.' },
    { date: dayOffset(-2), text: 'Monday kickoff meeting went well. Team aligned on sprint priorities: auth fix, staging env, and the search optimization PR are the top three.\n\nMigrated CI from CircleCI to GitHub Actions. Build times dropped from 12 minutes to 4 minutes with better caching. The matrix strategy for running tests across Node versions is much cleaner.\n\nFixed the N+1 query in the dashboard analytics endpoint — was hitting the DB 200+ times for a single page load. Single aggregation pipeline now, response time went from 2.3s to 180ms.\n\nSubmitted expense report for last week\'s team offsite. Good team bonding over the escape room.' },
  ];
  for (const j of journals) {
    await api('POST', '/journals', token, { ...j, space_id: spaceId });
  }
  console.log('   Added 3 journal entries');

  // ── 5. Create chat sessions for assistant tab ──────────────────
  console.log('5. Creating chat sessions...');
  const assistantSession = await api('POST', '/agent/sessions', token, {
    space_id: spaceId,
    title: 'Help with Redis to PostgreSQL migration',
    initial_message: 'I need to migrate our user session store from Redis to PostgreSQL. What are the best strategies for zero-downtime migration?',
    initial_role: 'user',
  });
  const assistantSessionId = assistantSession.session_id || assistantSession._id;
  await api('POST', `/agent/sessions/${assistantSessionId}/messages`, token, {
    role: 'assistant',
    content: 'Great question! For a zero-downtime Redis to PostgreSQL migration, I recommend a **dual-write strategy** with these phases:\n\n**Phase 1 — Dual Write:**\n- Write to both Redis and PostgreSQL simultaneously\n- Read from Redis (still the primary)\n- This validates PostgreSQL can handle the write load\n\n**Phase 2 — Shadow Read:**\n- Continue dual-writing\n- Read from both and compare results\n- Log any discrepancies for investigation\n\n**Phase 3 — Cutover:**\n- Switch reads to PostgreSQL\n- Keep Redis writes as a fallback for 48 hours\n- Monitor latency and error rates\n\n**Phase 4 — Cleanup:**\n- Remove Redis writes\n- Decommission Redis instance\n\nWant me to create subtasks for each phase?',
  });
  console.log('   Created chat session with messages');

  // ── 6. Launch browser with route interception ────────────────
  console.log('\n6. Launching browser...');
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

  // ── Screenshots ──────────────────────────────────────────────────
  console.log('\n7. Taking screenshots...');

  // Task List (Active tab)
  await goTab('Tasks');
  await page.waitForTimeout(2000);
  await ss('task-list.png');

  // Journal
  await goTab('Journal');
  await page.waitForTimeout(2000);
  await ss('journal.png');

  // Assistant — try to load the conversation we created
  await goTab('Assistant');
  await page.waitForTimeout(2000);

  // Try to open "Past Chats" dropdown and click the session
  try {
    const pastChatsBtn = await page.$('button:has-text("Past Chats")');
    if (pastChatsBtn) {
      await pastChatsBtn.click();
      await page.waitForTimeout(1000);
      // Click the first session in the dropdown
      const sessionItem = await page.$('text=Help with Redis to PostgreSQL migration');
      if (sessionItem) {
        await sessionItem.click();
        await page.waitForTimeout(2000);
        console.log('   Loaded assistant conversation');
      }
    }
  } catch (e) {
    console.log('   Could not load session:', e.message);
  }

  await ss('assistant.png');

  console.log('\nDone! Screenshots saved to docs/screenshots/');
  await browser.close();
})();
