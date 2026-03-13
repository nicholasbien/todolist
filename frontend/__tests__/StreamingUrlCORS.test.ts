/**
 * Regression tests for streaming URL construction.
 *
 * The built-in assistant uses EventSource (SSE) to stream from /agent/stream.
 * EventSource cannot set custom headers, so cross-origin requests fail unless
 * the backend explicitly allows the frontend origin via CORS.
 *
 * Previous bug: getStreamingBackendUrl() always returned NEXT_PUBLIC_BACKEND_URL
 * (e.g. https://backend-openclaw.up.railway.app), making EventSource hit a
 * different origin and triggering a CORS error in production.
 *
 * Fix: On web, return '' (same-origin relative URL) and rely on a Next.js
 * rewrite to proxy /agent/stream to the backend.  Only use the absolute URL
 * on Capacitor where the origin is file://.
 */

// Mock Capacitor before importing the module under test
let mockIsNative = false;

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mockIsNative,
  },
}));

describe('Streaming URL CORS regression', () => {
  const originalEnv = process.env.NEXT_PUBLIC_BACKEND_URL;

  afterEach(() => {
    // Restore env
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_BACKEND_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
    }
    mockIsNative = false;
    // Clear module cache so each test gets a fresh import
    jest.resetModules();
  });

  async function importGetStreamingBackendUrl() {
    const mod = await import('../utils/api');
    return mod.getStreamingBackendUrl;
  }

  test('web: returns empty string (same-origin) to avoid CORS', async () => {
    mockIsNative = false;
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend-openclaw.up.railway.app';
    const getStreamingBackendUrl = await importGetStreamingBackendUrl();

    const url = getStreamingBackendUrl();
    expect(url).toBe('');
  });

  test('web: streaming URL for /agent/stream is relative (same-origin)', async () => {
    mockIsNative = false;
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend-openclaw.up.railway.app';
    const getStreamingBackendUrl = await importGetStreamingBackendUrl();

    const backendUrl = getStreamingBackendUrl();
    const agentUrl = `${backendUrl}/agent/stream?q=hello`;

    // Must start with / (relative) — NOT with http:// or https://
    expect(agentUrl).toBe('/agent/stream?q=hello');
    expect(agentUrl).not.toMatch(/^https?:\/\//);
  });

  test('web: streaming URL never contains a different origin', async () => {
    mockIsNative = false;
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend-openclaw.up.railway.app';
    const getStreamingBackendUrl = await importGetStreamingBackendUrl();

    const backendUrl = getStreamingBackendUrl();
    const agentUrl = `${backendUrl}/agent/stream?q=test&space_id=abc&token=xyz`;

    expect(agentUrl).not.toContain('backend-openclaw');
    expect(agentUrl).not.toContain('railway.app');
  });

  test('Capacitor: returns absolute backend URL (file:// origin needs it)', async () => {
    mockIsNative = true;
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend-openclaw.up.railway.app';
    const getStreamingBackendUrl = await importGetStreamingBackendUrl();

    const url = getStreamingBackendUrl();
    expect(url).toBe('https://backend-openclaw.up.railway.app');
  });

  test('Capacitor: falls back to localhost when env var is unset', async () => {
    mockIsNative = true;
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    const getStreamingBackendUrl = await importGetStreamingBackendUrl();

    const url = getStreamingBackendUrl();
    expect(url).toBe('http://localhost:8141');
  });

  test('next.config.js has rewrite for /agent/stream', async () => {
    // Verify the Next.js config includes the rewrite that makes same-origin streaming work
    delete process.env.CAPACITOR_BUILD;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nextConfig = require('../next.config.js');

    expect(nextConfig.rewrites).toBeDefined();
    const rewrites = await nextConfig.rewrites();
    const streamRewrite = rewrites.find(
      (r: any) => r.source === '/agent/stream'
    );
    expect(streamRewrite).toBeDefined();
    expect(streamRewrite.destination).toMatch(/\/agent\/stream$/);
    // destination should be an absolute URL pointing at the backend
    expect(streamRewrite.destination).toMatch(/^https?:\/\//);
  });
});
