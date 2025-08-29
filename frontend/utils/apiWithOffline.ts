import { Capacitor } from '@capacitor/core';

// Configuration - keep in sync with service worker
const CONFIG = {
  PRODUCTION_BACKEND: 'https://backend-production-e920.up.railway.app',
  PRODUCTION_DOMAIN: 'todolist.nyc'
};

/**
 * Get the correct API base URL for the current environment
 */
function getApiBaseUrl(): string {
  // Check if we're in Capacitor (native app) - special case for mobile
  if (Capacitor.isNativePlatform()) {
    return CONFIG.PRODUCTION_BACKEND;
  }

  // For web environments, always use relative URLs that go through Next.js API routes
  // This ensures consistent behavior and proper proxy handling
  return '';
}

/**
 * Enhanced fetch wrapper that works with React offline hooks
 */
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
  // Clean endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

  // Build URL
  const baseUrl = getApiBaseUrl();
  const url = baseUrl ? `${baseUrl}/${cleanEndpoint}` : `/api/${cleanEndpoint}`;

  // Get token from localStorage if available
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const requestOptions: RequestInit = {
    ...options,
    headers,
  };

  console.log(`🔗 API Request: ${endpoint} -> ${url} (Capacitor: ${Capacitor.isNativePlatform()})`);

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

// Export the original function for backward compatibility
export { apiRequest as default };
