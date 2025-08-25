// API proxy to forward all requests to the backend
// This allows the service worker to intercept same-origin requests in production

const BACKEND_URL = process.env.BACKEND_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://backend-production-e920.up.railway.app');

export default async function handler(req, res) {
  const { proxy } = req.query;
  const path = Array.isArray(proxy) ? proxy.join('/') : proxy;

  // Construct the backend URL with query parameters
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const backendUrl = `${BACKEND_URL}/${path}${queryString}`;

  try {
    // Prepare headers, removing Next.js specific ones
    const headers = { ...req.headers };
    delete headers.host;
    delete headers['x-forwarded-for'];
    delete headers['x-forwarded-host'];
    delete headers['x-forwarded-proto'];
    delete headers['x-real-ip'];
    delete headers.connection;

    // Handle request body for POST/PUT requests
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      if (req.body && typeof req.body === 'object') {
        body = JSON.stringify(req.body);
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(body).toString();
      } else if (req.body) {
        body = req.body;
        if (typeof body === 'string') {
          headers['content-length'] = Buffer.byteLength(body).toString();
        }
      }
    }

    // Forward the request to the backend
    const response = await fetch(backendUrl, {
      method: req.method,
      headers,
      body,
    });

    // Handle OPTIONS preflight requests
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(200).end();
      return;
    }

    // Set response status
    res.status(response.status);

    // Forward important response headers
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('content-type', contentType);
    }

    // Get response data
    const data = await response.text();
    res.send(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy request failed' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}
