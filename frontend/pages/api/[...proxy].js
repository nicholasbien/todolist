// Simple API proxy for service worker routing
const BACKEND_URL = process.env.BACKEND_URL || (
  process.env.NODE_ENV === 'production'
    ? 'https://backend-production-e920.up.railway.app'
    : 'http://localhost:8000'
);

export default async function handler(req, res) {
  const { proxy } = req.query;
  let path = Array.isArray(proxy) ? proxy.join('/') : proxy;

  // Remove trailing slash from path since backend doesn't expect it
  if (path && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  console.log(`🔗 PROXY: ${req.method} /${path} -> ${BACKEND_URL}`);

  // Construct backend URL with query parameters
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const backendUrl = `${BACKEND_URL}/${path}${queryString}`;

  console.log(`🔗 PROXY: Full URL: ${backendUrl}`);

  try {
    // Forward headers (remove Next.js specific ones)
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;

    // Handle request body
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body && typeof req.body === 'object') {
        body = JSON.stringify(req.body);
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(body).toString();
      } else if (req.body && typeof req.body === 'string') {
        body = req.body;
        headers['content-length'] = Buffer.byteLength(body).toString();
      } else {
        body = null;
      }
    }

    console.log(`🔗 PROXY: Body type: ${typeof req.body}, Body: ${body?.substring(0, 100)}`);

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
    console.error('🔗 PROXY ERROR:', {
      message: error.message,
      stack: error.stack,
      url: backendUrl,
      method: req.method
    });
    res.status(500).json({
      error: 'Proxy failed',
      details: error.message,
      url: backendUrl
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}
