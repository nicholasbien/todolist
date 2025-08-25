require('@testing-library/jest-dom');

// Polyfill for Request API in test environment
global.Request = class Request {
  constructor(url, options = {}) {
    // Convert relative URLs to absolute for testing
    this.url = url.startsWith('/') ? `http://localhost:3000${url}` : url;
    this.method = options.method || 'GET';
    this.headers = new Map(Object.entries(options.headers || {}));
    this.body = options.body;
  }

  clone() {
    return new Request(this.url, {
      method: this.method,
      headers: Object.fromEntries(this.headers),
      body: this.body
    });
  }

  async text() {
    return this.body || '';
  }
};

// Polyfill for Response API in test environment
global.Response = class Response {
  constructor(body, options = {}) {
    this.body = body;
    this.status = options.status || 200;
    this.statusText = options.statusText || 'OK';
    this.headers = new Map(Object.entries(options.headers || {}));
    this.ok = this.status >= 200 && this.status < 300;
  }

  async json() {
    return JSON.parse(this.body);
  }

  async text() {
    return this.body;
  }
};

// Mock global self for service worker testing
global.self = global.self || {
  location: { origin: 'http://localhost:3000' },
  navigator: { onLine: false }, // Default to offline for testing
};
