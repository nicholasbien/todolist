require('@testing-library/jest-dom');

// Mock ESM-only modules that Jest cannot transform
jest.mock('react-markdown', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children, components }) => {
      // Basic markdown rendering: handle numbered lists if components are provided
      if (typeof children === 'string' && components) {
        const lines = children.split('\n');
        const isNumberedList = lines.some(l => /^\d+\.\s/.test(l));
        if (isNumberedList && components.ol && components.li) {
          const OlComp = components.ol;
          const LiComp = components.li;
          const items = lines
            .filter(l => /^\d+\.\s/.test(l))
            .map((l, i) => React.createElement(LiComp, { key: i, node: {} }, l.replace(/^\d+\.\s*/, '')));
          return React.createElement('div', null, React.createElement(OlComp, { node: {} }, items));
        }
      }
      return React.createElement('div', null, children);
    },
  };
});
jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => {},
}));

// Polyfill for Request API in test environment
global.Request = class Request {
  constructor(url, options = {}) {
    // Convert relative URLs to absolute for testing
    this.url = url.startsWith('/') ? `http://localhost:3141${url}` : url;
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

// Mock navigator.serviceWorker with full API surface for components that use it
if (!navigator.serviceWorker) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      controller: { postMessage: jest.fn() },
      getRegistration: jest.fn().mockResolvedValue({ update: jest.fn() }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    configurable: true,
  });
} else {
  // Ensure addEventListener/removeEventListener exist on existing mock
  if (!navigator.serviceWorker.addEventListener) {
    navigator.serviceWorker.addEventListener = jest.fn();
  }
  if (!navigator.serviceWorker.removeEventListener) {
    navigator.serviceWorker.removeEventListener = jest.fn();
  }
}

// Mock global self for service worker testing
global.self = global.self || {
  location: { origin: 'http://localhost:3141' },
  navigator: { onLine: false }, // Default to offline for testing
};

// Drain background async chains between test files.
// Service worker code triggers fire-and-forget syncQueue() calls via handleApiRequest.
// In serial mode (--maxWorkers=1) those chains can still be running when the next
// file's beforeEach replaces global.self. Waiting here (after all tests in a file
// complete but before the next file starts) lets fake-indexeddb's setImmediate-based
// IDB operations finish while global.self.location is still valid.
afterAll(async () => {
  await new Promise(r => setTimeout(r, 50));
});
