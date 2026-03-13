import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.todolistnyc.aitodo',
  appName: 'AI Todo List',
  webDir: 'out',
  server: {
    // Production: Load from your live PWA site to enable service worker
    url: 'https://app.todolist.nyc',
    // Development: For local testing, comment out the production URL above (uses webDir: 'out')
    // url: 'http://localhost:3141',
    hostname: 'localhost'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#000000',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      iosSpinnerStyle: 'large',
      spinnerColor: '#3b82f6'
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#000000'
    },
    Keyboard: {
      resizeOnFullScreen: true
    }
  },
  ios: {
    contentInset: 'never', // Manual safe area handling via CSS padding
    allowsLinkPreview: false,
    scrollEnabled: true, // Enable WebView scrolling for info pages (home/privacy/terms)
    backgroundColor: '#000000',
    // Required when Info.plist includes WKAppBoundDomains
    limitsNavigationsToAppBoundDomains: true
  },
  // Capacitor 7+ setting for service worker support (default: true)
  // resolveServiceWorkerRequests: true
};

export default config;
