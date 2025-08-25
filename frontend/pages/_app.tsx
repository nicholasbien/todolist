import '../styles/globals.css';
import { useEffect } from 'react';
import { OfflineProvider } from '../context/OfflineContext';
import { AuthProvider } from '../context/AuthContext';
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Register service worker in all environments
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => {
          // Service Worker registered successfully
        })
        .catch((registrationError) => {
          console.log('Service Worker registration failed: ', registrationError);
        });
    }

    // OfflineProvider handles online/offline events
  }, []);

  return (
    <AuthProvider>
      <OfflineProvider>
        <Component {...pageProps} />
      </OfflineProvider>
    </AuthProvider>
  );
}

export default MyApp;
