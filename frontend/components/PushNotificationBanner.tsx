import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import {
  isPushSupported,
  getPermissionState,
  hasOptedIn,
  subscribeToPush,
} from '../utils/pushNotifications';

const DISMISSED_KEY = 'push_banner_dismissed';

/**
 * A banner that prompts the user to enable push notifications.
 * Shows only when:
 *  - Browser supports push
 *  - User hasn't already opted in
 *  - User hasn't dismissed the banner
 *  - Permission hasn't been denied
 */
export default function PushNotificationBanner() {
  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    if (hasOptedIn()) return;

    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed === 'true') return;

    const perm = getPermissionState();
    if (perm === 'denied') return;

    // Show the banner
    setVisible(true);
  }, []);

  const handleEnable = async () => {
    setSubscribing(true);
    const success = await subscribeToPush();
    setSubscribing(false);
    if (success) {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="bg-blue-900/80 border border-blue-700 rounded-lg px-4 py-3 mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Bell size={18} className="text-blue-300 flex-shrink-0" />
        <span className="text-sm text-gray-200">
          Get notified when agents finish tasks
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleEnable}
          disabled={subscribing}
          className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-50 transition-colors"
        >
          {subscribing ? 'Enabling...' : 'Enable'}
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
