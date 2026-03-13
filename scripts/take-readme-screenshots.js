/**
 * take-readme-screenshots.js
 *
 * Captures high-quality feature screenshots for the README.
 * Creates a demo user via backend API, populates realistic demo data
 * with categories, priorities, due dates, subtasks, journal entries,
 * and assistant chat sessions, then takes screenshots of the
 * Tasks, Assistant, and Journal views.
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

// Helper to get a human-friendly day name for relative dates
function dayName(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
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

  // ── 2. Create categories via API ──────────────────────────────
  console.log('2. Creating categories via /categories API...');
  const categoryNames = ['Work', 'Personal', 'Health', 'Learning', 'Errands'];
  for (const name of categoryNames) {
    await api('POST', '/categories', token, { name, space_id: spaceId });
  }
  console.log(`   Created ${categoryNames.length} categories: ${categoryNames.join(', ')} (+ default General)`);

  // ── 3. Populate demo tasks (developer-oriented) ───────────────
  console.log('3. Adding demo tasks...');
  const todos = [
    // Work tasks - developer-oriented with due dates
    { text: 'Deploy hotfix for login timeout on production', completed: false, category: 'Work', priority: 'High', dueDate: dateOffset(0) },
    { text: 'Review Q1 roadmap', completed: false, category: 'Work', priority: 'High', dueDate: dateOffset(1) },
    { text: 'Write integration tests for payment flow', completed: false, category: 'Work', priority: 'High', dueDate: dateOffset(2) },
    { text: 'Refactor auth middleware to support OAuth2', completed: false, category: 'Work', priority: 'Medium', dueDate: dateOffset(3) },
    { text: 'Code review PRs from backend team', completed: false, category: 'Work', priority: 'Medium', dueDate: dateOffset(1) },
    { text: 'Update CI pipeline to run E2E tests on staging', completed: false, category: 'Work', priority: 'Medium', dueDate: dateOffset(5) },
    { text: 'Migrate user sessions to Redis', completed: true, category: 'Work', priority: 'High' },
    { text: 'Fix N+1 query in dashboard endpoint', completed: true, category: 'Work', priority: 'Medium' },

    // Personal tasks
    { text: 'Plan weekend hiking trip to Bear Mountain', completed: false, category: 'Personal', priority: 'Low', dueDate: dateOffset(4) },
    { text: 'Book dentist appointment', completed: false, category: 'Personal', priority: 'Medium', dueDate: dateOffset(7) },
    { text: 'Call mom for her birthday', completed: true, category: 'Personal', priority: 'High' },

    // Health tasks
    { text: 'Meal prep for the week', completed: false, category: 'Health', priority: 'Medium', dueDate: dateOffset(0) },
    { text: 'Schedule annual physical exam', completed: false, category: 'Health', priority: 'Low', dueDate: dateOffset(14) },
    { text: '30-min morning run', completed: true, category: 'Health', priority: 'Low' },

    // Learning tasks
    { text: 'Complete TypeScript advanced patterns course', completed: false, category: 'Learning', priority: 'Medium', dueDate: dateOffset(10) },
    { text: 'Read "Designing Data-Intensive Applications" Ch.6', completed: false, category: 'Learning', priority: 'Low', dueDate: dateOffset(6) },
    { text: 'Watch talk on event-driven architecture', completed: true, category: 'Learning', priority: 'Low' },

    // Errands
    { text: 'Pick up dry cleaning before Saturday', completed: false, category: 'Errands', priority: 'Medium', dueDate: dateOffset(2) },
    { text: 'Return Amazon package at UPS store', completed: false, category: 'Errands', priority: 'Low', dueDate: dateOffset(3) },
    { text: 'Buy groceries for dinner party', completed: true, category: 'Errands', priority: 'Medium' },
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

  // ── 3b. Add subtasks to "Review Q1 roadmap" ───────────────────
  console.log('   Adding subtasks to "Review Q1 roadmap"...');
  const roadmapTodo = createdTodos.find(t => t.text === 'Review Q1 roadmap');
  const roadmapId = roadmapTodo._id || roadmapTodo.id;

  const subtasks = [
    { text: 'Review backend API milestones', completed: true },
    { text: 'Review frontend feature priorities', completed: true },
    { text: 'Draft resource allocation plan', completed: false },
    { text: 'Schedule roadmap review meeting with stakeholders', completed: false },
  ];

  for (const sub of subtasks) {
    const result = await api('POST', '/todos', token, {
      text: sub.text,
      completed: sub.completed,
      category: 'Work',
      priority: 'Medium',
      parent_id: roadmapId,
      space_id: spaceId,
      dateAdded: new Date().toISOString(),
    });
    // Mark completed subtasks
    if (sub.completed && result._id) {
      await api('PUT', `/todos/${result._id}/complete`, token);
    }
  }
  console.log(`   Added ${subtasks.length} subtasks (${subtasks.filter(s => s.completed).length} completed, ${subtasks.filter(s => !s.completed).length} pending)`);

  // ── 4. Add journal entries (developer daily log) ──────────────
  console.log('4. Adding journal entries...');
  const journals = [
    {
      date: dateOffset(0),
      text: `Good progress today. Deployed the hotfix for the login timeout issue — turned out to be a race condition in the session refresh logic. Production looks stable now.\n\nSpent the afternoon writing integration tests for the payment flow. Got the happy path covered and most edge cases. Still need to add tests for the webhook retry scenario.\n\nStarted looking at the Q1 roadmap review. Finished reviewing the backend milestones and frontend priorities — need to draft the resource plan ${dayName(1)}.\n\nDid my meal prep and a morning run before work. Feeling good about the week ahead.`,
    },
    {
      date: dateOffset(-1),
      text: `Deep work day. Finally fixed that N+1 query in the dashboard endpoint — response time dropped from 1.2s to 80ms. The trick was batching the user lookups with a single aggregation pipeline.\n\nReviewed 3 PRs from the backend team. Left feedback on the caching strategy in Jake's PR — we should use Redis invalidation instead of TTL-based expiry.\n\nFinished migrating user sessions to Redis. Ran load tests and everything looks solid. Merged and deployed to staging.\n\nCalled mom for her birthday in the evening. She loved the gift.`,
    },
    {
      date: dateOffset(-2),
      text: `Monday standup went well. Aligned on sprint priorities: the auth middleware refactor is the big one this week.\n\nStarted sketching out the OAuth2 integration for the auth middleware. The existing session-based flow needs to coexist with token-based auth, so it's trickier than expected. Drafted the migration plan.\n\nWatched a great talk on event-driven architecture — some useful patterns we could apply to our notification system.\n\nReminder: need to pick up dry cleaning before the weekend.`,
    },
  ];
  for (const j of journals) {
    await api('POST', '/journals', token, { ...j, space_id: spaceId });
  }
  console.log('   Added 3 journal entries');

  // ── 5. Create a realistic assistant chat session ──────────────
  console.log('5. Creating assistant chat session...');

  // Find the hotfix task to link the chat to
  const hotfixTodo = createdTodos.find(t => t.text && t.text.includes('Deploy hotfix'));
  const hotfixId = hotfixTodo ? (hotfixTodo._id || hotfixTodo.id) : null;

  // Find the session that was auto-created for the hotfix task
  let sessionId = null;
  if (hotfixId) {
    const sessionResult = await api('GET', `/agent/sessions/by-todo/${hotfixId}`, token);
    if (sessionResult && sessionResult._id) {
      sessionId = sessionResult._id;
    }
  }

  // If no auto-created session, create one manually
  if (!sessionId) {
    const sessionResult = await api('POST', '/agent/sessions', token, {
      space_id: spaceId,
      title: 'Deploy hotfix for login timeout',
      todo_id: hotfixId,
      initial_message: 'The login timeout issue is affecting about 5% of users on production. Session tokens are expiring mid-request during the refresh window. Can you help me debug and deploy a fix?',
      initial_role: 'user',
      agent_id: 'claude',
    });
    sessionId = sessionResult._id || sessionResult.id;
  }

  if (sessionId) {
    // Add a realistic back-and-forth conversation
    const chatMessages = [
      {
        role: 'assistant',
        content: 'I can help with that. Based on your description, this sounds like a race condition in the token refresh flow. A few questions:\n\n1. Are you using sliding window expiration or fixed TTL for sessions?\n2. Is the refresh happening client-side or via middleware?\n3. When did this start — after a recent deploy?\n\nIn the meantime, I\'d suggest checking the session middleware for any async gaps between token validation and refresh. A common pattern is:\n\n```javascript\n// Check if token expires within the refresh window\nif (token.expiresAt - Date.now() < REFRESH_WINDOW) {\n  await refreshToken(token); // Gap here!\n}\n```\n\nThe gap between the check and the refresh can cause concurrent requests to race.',
        agent_id: 'claude',
      },
      {
        role: 'user',
        content: 'Good call — we\'re using sliding window with a 5-minute refresh threshold. The middleware does the refresh server-side. It started after we bumped the session TTL from 24h to 1h last Tuesday for the security audit.',
      },
      {
        role: 'assistant',
        content: 'That confirms it. With a 1-hour TTL and 5-minute refresh window, users hit the refresh path much more frequently than before. Here\'s a fix using an atomic compare-and-swap pattern:\n\n```javascript\nasync function refreshSession(sessionId) {\n  const result = await redis.eval(`\n    local current = redis.call(\'get\', KEYS[1])\n    if current == ARGV[1] then\n      redis.call(\'setex\', KEYS[1], ARGV[2], ARGV[3])\n      return 1\n    end\n    return 0\n  `, 1, `session:${sessionId}`, oldToken, TTL, newToken);\n  return result === 1;\n}\n```\n\nThis ensures only one request wins the refresh race. All other concurrent requests will see the already-refreshed token and continue normally.\n\nShould I also draft a rollback plan in case we need to revert quickly?',
        agent_id: 'claude',
      },
      {
        role: 'user',
        content: 'Perfect, that\'s exactly what we need. Yes please on the rollback plan. I\'ll implement the fix now and push to staging.',
      },
      {
        role: 'assistant',
        content: 'Great, here\'s the rollback plan:\n\n**Rollback Steps:**\n1. Revert the Redis CAS change: `git revert <commit-hash>`\n2. Temporarily increase the session TTL back to 24h: update `SESSION_TTL` in config\n3. Flush affected sessions: `redis-cli KEYS "session:*" | xargs redis-cli DEL`\n4. Monitor error rates on the `/auth/refresh` endpoint for 15 minutes\n\n**Monitoring:**\n- Watch the `session_refresh_race` metric in Grafana\n- Check Sentry for any new `TokenExpired` errors\n- If error rate stays below 0.1% for 15 min, the fix is stable\n\nThe key insight is that the CAS pattern is backward-compatible — if we revert, the worst case is we go back to the original race condition behavior, which only affected ~5% of users. No data loss risk.',
        agent_id: 'claude',
      },
    ];

    for (const msg of chatMessages) {
      await api('POST', `/agent/sessions/${sessionId}/messages`, token, {
        role: msg.role,
        content: msg.content,
        agent_id: msg.agent_id || undefined,
      });
    }
    console.log(`   Created chat session with ${chatMessages.length + 1} messages`);
  } else {
    console.log('   Warning: Could not create chat session');
  }

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

  // Verify logged in — look for task list content or tab navigation
  try {
    await page.getByRole('button', { name: 'Tasks' }).first().waitFor({ timeout: 15000 });
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

  console.log('\n7. Taking screenshots...');

  // Task List (Active tab)
  await goTab('Tasks');
  await page.waitForTimeout(2000);
  await ss('task-list.png');

  // Navigate to chat via the task's chat icon button (on the Tasks tab)
  // The "Deploy hotfix" task has a chat icon with a notification dot
  try {
    // Find the chat icon button on the "Deploy hotfix" task card
    // The task cards have chat buttons with aria-label or SVG icons
    const hotfixCard = page.locator('text=Deploy hotfix for login timeout').first();
    // The chat button is a sibling in the task card's action buttons
    const taskContainer = hotfixCard.locator('..').locator('..');
    const chatButton = taskContainer.locator('button').first();
    await chatButton.click({ force: true, timeout: 5000 });
    await page.waitForTimeout(4000);
    console.log('   Navigated to chat via task chat button');
  } catch (err) {
    // Fall back to just clicking the Assistant tab
    console.log('   Note: Could not navigate via task chat button:', err.message);
    await goTab('Assistant');
    await page.waitForTimeout(2000);
  }
  await ss('assistant.png');

  // Activity view
  await goTab('Activity');
  await page.waitForTimeout(2000);
  await ss('activity.png');

  console.log('\nDone! Screenshots saved to docs/screenshots/');
  await browser.close();
})();
