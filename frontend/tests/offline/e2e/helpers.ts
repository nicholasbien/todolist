import { expect, Page } from '@playwright/test';

const EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const CODE = process.env.TEST_CODE || '000000';
const API_URL = process.env.API_URL || 'http://localhost:8000';

export async function loginTestUser(page: Page) {
  await resetBrowserState(page);
  await page.addInitScript(() => {
    (window as any).__E2E_SKIP_AUTH_VERIFY = true;
    const style = document.createElement('style');
    style.innerHTML = `
      * {
        transition-duration: 0s !important;
        animation-duration: 0s !important;
      }
    `;
    document.head.appendChild(style);
  });
  const response = await page.request.post(`${API_URL}/auth/login`, {
    data: { email: EMAIL, code: CODE },
  });
  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  }
  const data = await response.json();
  const user = data.user;
  const token = data.token;
  const userId = user?.id || user?._id || user?.user_id || user?.email || EMAIL;

  await page.addInitScript(
    ({ tokenValue, userValue }) => {
      localStorage.setItem('auth_token', tokenValue);
      localStorage.setItem('auth_user', JSON.stringify(userValue));
      sessionStorage.clear();
    },
    { tokenValue: token, userValue: user }
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await waitForServiceWorkerReady(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureServiceWorkerAuth(page, token, userId);

  await expect(page.getByPlaceholder('Add a new task...')).toBeVisible({ timeout: 20_000 });
}

export async function waitForServiceWorkerReady(page: Page, timeoutMs: number = 5000) {
  await page
    .evaluate((timeout) => {
      return new Promise((resolve) => {
        if (!('serviceWorker' in navigator)) return resolve(false);
        const timer = setTimeout(() => resolve(false), timeout);
        navigator.serviceWorker.ready
          .then(() => {
            clearTimeout(timer);
            resolve(true);
          })
          .catch(() => resolve(false));
      });
    }, timeoutMs)
    .catch(() => null);
}

export async function setOffline(page: Page, offline: boolean) {
  await page.context().setOffline(offline);
  await page
    .evaluate((isOffline) => {
      try {
        Object.defineProperty(navigator, 'onLine', {
          configurable: true,
          get: () => !isOffline,
        });
      } catch {}
      window.dispatchEvent(new Event(isOffline ? 'offline' : 'online'));
    }, offline)
    .catch(() => null);
  await page.waitForTimeout(500);
}

export function uniqueLabel(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

async function resetBrowserState(page: Page) {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' }).catch(() => null);
  await page
    .evaluate(async () => {
      try {
        const registrations = await navigator.serviceWorker?.getRegistrations?.();
        if (registrations?.length) {
          await Promise.all(registrations.map((reg) => reg.unregister()));
        }
      } catch {}

      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch {}

      try {
        if (indexedDB.databases) {
          const dbs = await indexedDB.databases();
          await Promise.all(
            dbs
              .map((db) => db.name)
              .filter(Boolean)
              .map(
                (name) =>
                  new Promise<void>((resolve) => {
                    const req = indexedDB.deleteDatabase(name as string);
                    req.onsuccess = () => resolve();
                    req.onerror = () => resolve();
                    req.onblocked = () => resolve();
                  })
              )
          );
        }
      } catch {}

      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
    })
    .catch(() => null);

  await page.context().clearCookies().catch(() => null);
  await page.goto('about:blank').catch(() => null);
}

async function ensureServiceWorkerAuth(page: Page, token: string, userId: string, attempts: number = 2) {
  for (let i = 0; i < attempts; i++) {
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 5000 }).catch(() => null);
    await page
      .evaluate(
        ({ tokenValue, userIdValue }) =>
          new Promise((resolve) => {
            if (!navigator.serviceWorker?.controller) return resolve(null);
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve(null);
            navigator.serviceWorker.controller.postMessage(
              { type: 'SET_AUTH', token: tokenValue, userId: userIdValue },
              [channel.port2]
            );
          }),
        { tokenValue: token, userIdValue: userId }
      )
      .catch(() => null);

    const auth: any = await page
      .evaluate(() => {
        return new Promise((resolve) => {
          if (!navigator.serviceWorker?.controller) return resolve(null);
          const channel = new MessageChannel();
          channel.port1.onmessage = (event) => resolve(event?.data?.payload || null);
          navigator.serviceWorker.controller.postMessage({ type: 'GET_AUTH' }, [channel.port2]);
        });
      })
      .catch(() => null);

    if (auth?.token && auth?.userId) {
      return;
    }

    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => null);
  }
}
