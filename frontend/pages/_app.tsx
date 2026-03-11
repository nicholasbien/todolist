import '../styles/globals.css';
import { useEffect } from 'react';
import { OfflineProvider } from '../context/OfflineContext';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Register service worker in all environments
    if ('serviceWorker' in navigator) {
      console.log('📱 Registering service worker...');
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => {
          console.log('✅ Service Worker registered successfully:', registration);
          // Force an update check in dev to avoid stale SW script caching.
          registration.update().catch((err) => {
            console.log('⚠️ Service Worker update check failed:', err);
          });
        })
        .catch((registrationError) => {
          console.log('❌ Service Worker registration failed: ', registrationError);
        });
    } else {
      console.log('❌ Service Worker not supported');
    }

    // OfflineProvider handles online/offline events
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <OfflineProvider>
          <Component {...pageProps} />
        </OfflineProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default MyApp;
