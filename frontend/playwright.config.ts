import { defineConfig } from '@playwright/test';

const baseURL = process.env.APP_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: 'tests/offline/e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['list']],
});
