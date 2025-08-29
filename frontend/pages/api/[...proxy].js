// Simple API proxy for service worker routing
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export default async function handler(req, res) {
  const { proxy } = req.query;
  const path = Array.isArray(proxy) ? proxy.join('/') : proxy;

  // Construct backend URL with query parameters
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const backendUrl = `${BACKEND_URL}/${path}${queryString}`;

  try {
    // Forward headers (remove Next.js specific ones)
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;

    // Handle request body
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = req.body ? JSON.stringify(req.body) : null;
      if (body) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(body).toString();
      }
    }

    // Forward to backend
    const response = await fetch(backendUrl, {
      method: req.method,
      headers,
      body,
    });

    // Forward response
    res.status(response.status);
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('content-type', contentType);
    }

    const data = await response.text();
    res.send(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy failed' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}
