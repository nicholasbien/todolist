import '../styles/globals.css';
import { useEffect } from 'react';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Register service worker if supported
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // Service Worker registered successfully
        })
        .catch((registrationError) => {
          console.log('Service Worker registration failed: ', registrationError);
        });
    }

    // Listen for online/offline events
    const handleOnline = () => {
      // Trigger sync when coming back online
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SYNC_WHEN_ONLINE'
        });
      }
    };

    const handleOffline = () => {
      // Could show offline indicator here if needed
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return <Component {...pageProps} />;
}

export default MyApp;
