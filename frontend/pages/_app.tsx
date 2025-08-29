import '../styles/globals.css';
import { useEffect } from 'react';
import { AuthProvider } from '../context/AuthContext';
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Service worker disabled - using React-based offline functionality instead
    console.log('📱 Service Worker disabled - using React offline hooks');

    // Clean up any existing service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach(registration => {
          console.log('🧹 Unregistering existing service worker');
          registration.unregister();
        });
      });
    }

    // Offline functionality now handled by useOfflineData hook in components
  }, []);

  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}

export default MyApp;
