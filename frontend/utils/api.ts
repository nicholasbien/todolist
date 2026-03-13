import { Capacitor } from '@capacitor/core';

/**
 * Get the correct API base URL for the current environment
 */
function getApiBaseUrl(forceBackend = false): string {
  // IMPORTANT: Always use relative URLs (empty string) so service worker can intercept
  // The service worker will then route to the correct backend based on environment
  // This is critical for offline functionality on both web and Capacitor

  // For web environments (both dev and production), always use service worker + proxy
  // For Capacitor, also use service worker routing to enable offline functionality
  // The service worker detects Capacitor via protocol === 'file:' and routes correctly
  return '';
}

/**
 * Get the base URL for SSE streaming (EventSource).
 *
 * On web (including production), returns '' so the EventSource uses a
 * same-origin relative URL.  A Next.js rewrite in next.config.js forwards
 * /agent/stream to the real backend, which avoids CORS issues (EventSource
 * cannot set custom headers, so cross-origin requests fail unless the
 * backend explicitly allows the frontend origin).
 *
 * On Capacitor (native mobile), the origin is file:// so we must use the
 * absolute backend URL directly.
 */
export function getStreamingBackendUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8141';
  }
  // Web: use same-origin relative URL — Next.js rewrite proxies to backend
  return '';
}

/**
 * Enhanced fetch wrapper that handles environment-specific routing
 */
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
  // Clean endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const isAuthEndpoint = cleanEndpoint.startsWith('auth');

  // Always use consistent routing approach
  const baseUrl = getApiBaseUrl(false);

  // Build URL
  let url;
  if (baseUrl === '') {
    // Use relative URLs - service worker will handle routing
    url = `/${cleanEndpoint}`;
  } else {
    // Direct backend call
    url = `${baseUrl}/${cleanEndpoint}`;
  }

  // Get token from localStorage if available
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  // Only set JSON content type when a body is provided
  if (options.body !== undefined && options.body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    console.log(`🔑 Auth header added for ${endpoint}`);
  } else {
    console.log(`⚠️ No auth token for ${endpoint}`);
  }

  const requestOptions: RequestInit = {
    ...options,
    headers,
  };

  console.log(`🔗 API Request: ${endpoint} -> ${url} (Capacitor: ${Capacitor.isNativePlatform()}, via SW: ${baseUrl === ''})`);

  // Debug logging for service worker routing
  if (baseUrl === '') {
    console.log(`📡 Request will be intercepted by service worker: ${url}`);
  }

  // Handle Railway redirects by following them automatically
  return fetch(url, {
    ...requestOptions,
    redirect: 'follow', // Automatically follow redirects
    headers: {
      ...requestOptions.headers,
      // Prevent Railway from adding trailing slashes by indicating we're an API call
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
}
