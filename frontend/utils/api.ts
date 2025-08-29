import { Capacitor } from '@capacitor/core';

/**
 * Get the correct API base URL for the current environment
 */
function getApiBaseUrl(forceBackend = false): string {
  // Check if we're in Capacitor (native app)
  if (Capacitor.isNativePlatform()) {
    // Always use production backend for iOS (no localhost access)
    return 'https://backend-production-e920.up.railway.app';
  }

  // Check if service worker is available (web environment)
  if (!forceBackend && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    // Use relative URLs - service worker will handle routing
    return '';
  }

  // Fallback for web without service worker or when forcing direct backend access
  return window.location.hostname === 'todolist.nyc'
    ? 'https://backend-production-e920.up.railway.app'
    : 'http://localhost:8000';
}

/**
 * Enhanced fetch wrapper that handles environment-specific routing
 */
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
  // Clean endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const isAuthEndpoint = cleanEndpoint.startsWith('auth');

  const baseUrl = getApiBaseUrl(isAuthEndpoint);

  // Build URL
  let url;
  if (baseUrl === '') {
    // Use /api/ prefix for service worker routing
    url = `/api/${cleanEndpoint}`;
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

  return fetch(url, requestOptions);
}
