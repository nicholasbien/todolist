import { Capacitor } from '@capacitor/core';

/**
 * Get the correct API base URL for the current environment
 */
function getApiBaseUrl(forceBackend = false): string {
  // Check if we're in Capacitor (native app) - special case for mobile
  if (Capacitor.isNativePlatform()) {
    return 'https://backend-production-e920.up.railway.app';
  }

  // For web environments (both dev and production), always use service worker + proxy
  // This ensures consistent behavior everywhere
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

  // Add alert for iOS debugging
  if (Capacitor.isNativePlatform()) {
    alert(`API Call: ${endpoint} -> ${url}`);
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
