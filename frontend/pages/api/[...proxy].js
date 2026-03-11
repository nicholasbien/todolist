/**
 * Next.js API proxy to route requests to the backend
 *
 * IMPORTANT: This proxy serves as a FALLBACK for when the service worker is unavailable.
 *
 * Primary request flow:
 *   Frontend → Service Worker → Backend (handles 95% of requests with offline capability)
 *
 * Fallback request flow (when this proxy is used):
 *   Frontend → Next.js Proxy → Backend
 *
 * This proxy is used in these scenarios:
 *   1. Service worker registration failed or is disabled
 *   2. Browser doesn't support service workers
 *   3. Auth endpoints that intentionally bypass service worker
 *   4. Development/debugging when service worker is disabled
 *
 * Do NOT remove this proxy - it ensures the app works even when the service worker fails.
 */
const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');

export default async function handler(req, res) {
  const { proxy, ...queryParams } = req.query;
  const path = Array.isArray(proxy) ? proxy.join('/') : proxy;

  // Build query string from remaining query parameters
  const queryString = new URLSearchParams();
  Object.entries(queryParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => queryString.append(key, v));
    } else {
      queryString.set(key, value);
    }
  });

  // Build the target URL with query parameters
  const baseUrl = `${BACKEND_URL}/${path}`;
  const targetUrl = queryString.toString() ? `${baseUrl}?${queryString.toString()}` : baseUrl;

  console.log('🔀 Proxy request:', req.method, req.url);
  console.log('🔀 Parsed path:', path);
  console.log('🔀 Query params:', Object.keys(queryParams).length ? queryParams : 'None');
  console.log('🔀 Target URL:', targetUrl);
  console.log('🔀 Headers:', req.headers.authorization ? 'Auth present' : 'No auth');

  // Prepare request body
  let body = null;
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    // req.body is already parsed by Next.js, so we need to stringify it
    body = JSON.stringify(req.body);
    console.log('Proxy forwarding body:', body);
  }

  // Forward the request
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        // Only forward specific headers to avoid issues
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
      },
      body,
    });

    const data = await response.text();
    console.log('🔀 Response status:', response.status);
    console.log('🔀 Response data length:', data.length);
    console.log('🔀 Response preview:', data.substring(0, 200));

    // Forward the response
    res.status(response.status);

    // Copy response headers
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.send(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy request failed' });
  }
}
