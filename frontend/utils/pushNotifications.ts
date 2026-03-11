/**
 * Push notification utilities.
 *
 * Handles requesting permission, subscribing to push via the service worker,
 * and sending the subscription to the backend.
 */

import { apiRequest } from './api';

const PUSH_OPTED_IN_KEY = 'push_notifications_opted_in';

/**
 * Check whether the browser supports push notifications.
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Get the current notification permission state.
 */
export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Whether the user has explicitly opted in (stored in localStorage).
 */
export function hasOptedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(PUSH_OPTED_IN_KEY) === 'true';
}

/**
 * Fetch the VAPID public key from the backend.
 */
async function fetchVapidKey(): Promise<string | null> {
  try {
    const res = await apiRequest('push/vapid-key');
    if (!res.ok) return null;
    const data = await res.json();
    return data.vapid_public_key || null;
  } catch {
    return null;
  }
}

/**
 * Convert a base64-encoded VAPID key to a Uint8Array for PushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Request notification permission and subscribe to push.
 *
 * Returns true if subscription was successful.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.log('Push notification permission denied');
    return false;
  }

  // Get VAPID key
  const vapidKey = await fetchVapidKey();
  if (!vapidKey) {
    console.error('Could not fetch VAPID public key');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
    }

    // Send subscription to backend
    const subJson = subscription.toJSON();
    const res = await apiRequest('push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        expirationTime: subJson.expirationTime || null,
      }),
    });

    if (res.ok) {
      localStorage.setItem(PUSH_OPTED_IN_KEY, 'true');
      console.log('Push subscription registered successfully');
      return true;
    }

    console.error('Failed to register push subscription with backend');
    return false;
  } catch (err) {
    console.error('Error subscribing to push:', err);
    return false;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Tell backend
      await apiRequest('push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      // Unsubscribe locally
      await subscription.unsubscribe();
    }

    localStorage.removeItem(PUSH_OPTED_IN_KEY);
    return true;
  } catch (err) {
    console.error('Error unsubscribing from push:', err);
    return false;
  }
}
