import '../styles/globals.css';
import { useEffect } from 'react';
import { OfflineProvider } from '../context/OfflineContext';
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Register service worker in all environments
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register(`/sw.js?v=${Date.now()}`, { updateViaCache: 'none' })
        .then((registration) => {
          // Force update check on load
          registration.update();

          // Listen for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker is available, tell it to skip waiting
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  console.log('New service worker available. Reloading...');
                  window.location.reload();
                }
              });
            }
          });
        })
        .catch((registrationError) => {
          console.log('Service Worker registration failed: ', registrationError);
        });
    }

    // OfflineProvider handles online/offline events
  }, []);

  return (
    <OfflineProvider>
      <Component {...pageProps} />
    </OfflineProvider>
  );
}

export default MyApp;
