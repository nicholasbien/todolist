// Improved API proxy for offline PWA functionality
const BACKEND_URL = process.env.BACKEND_URL || (
  process.env.NODE_ENV === 'production'
    ? 'https://backend-production-e920.up.railway.app'
    : 'http://localhost:8000'
);

export default async function handler(req, res) {
  const { proxy } = req.query;
  let path = Array.isArray(proxy) ? proxy.join('/') : proxy;

  // Log all incoming requests - force to console and alert in dev
  const logMsg = `🔗 PROXY START: ${req.method} /api/${path} -> ${BACKEND_URL}/${path}`;
  console.log(logMsg);
  console.error(logMsg); // Also log as error to make sure it shows up

  // Test endpoint to verify proxy is working
  if (path === 'test-proxy') {
    return res.status(200).json({
      message: 'Proxy is working!',
      path: path,
      method: req.method,
      backend: BACKEND_URL
    });
  }

  try {
    // Build backend URL
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const backendUrl = `${BACKEND_URL}/${path}${queryString}`;

    // Simple header handling
    const headers = {
      'content-type': 'application/json',
    };

    // Add auth header if present
    if (req.headers.authorization) {
      headers.authorization = req.headers.authorization;
    }

    // Handle request body
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      if (req.body) {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        console.log(`🔗 PROXY BODY: ${body.substring(0, 200)}`);
      }
    }

    // Make request to backend
    console.log(`🔗 PROXY FETCH: ${backendUrl}`);
    const response = await fetch(backendUrl, {
      method: req.method,
      headers,
      body,
    });

    console.log(`🔗 PROXY RESPONSE: ${response.status} ${response.statusText}`);

    // Handle special responses
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      return res.status(200).end();
    }

    // Forward response
    res.status(response.status);

    // Forward important headers
    ['content-type', 'cache-control', 'etag', 'last-modified'].forEach(header => {
      const value = response.headers.get(header);
      if (value) res.setHeader(header, value);
    });

    // Send response data
    const data = await response.text();
    console.log(`🔗 PROXY SUCCESS: ${data.length} bytes`);
    res.send(data);

  } catch (error) {
    console.error(`🔗 PROXY ERROR for ${req.method} /api/${path}:`, {
      message: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    // Return detailed error in development, generic in production
    const errorResponse = {
      error: 'Proxy request failed',
      path: path,
      backend: BACKEND_URL,
      ...(process.env.NODE_ENV === 'development' && {
        details: error.message,
        code: error.code
      })
    };

    res.status(500).json(errorResponse);
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: '10mb',
  },
}
