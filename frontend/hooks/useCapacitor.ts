import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { Network } from '@capacitor/network';

export const useCapacitor = () => {
  const [isNative, setIsNative] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<{ connected: boolean; connectionType: string }>({
    connected: true,
    connectionType: 'unknown'
  });

  useEffect(() => {
    // Check if running in native app
    setIsNative(Capacitor.isNativePlatform());

    const initializeNativeFeatures = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // Hide splash screen after app loads
          await SplashScreen.hide();

          // Set status bar style for dark theme
          if (Capacitor.getPlatform() === 'ios') {
            await StatusBar.setStyle({ style: Style.Dark });
            await StatusBar.setBackgroundColor({ color: '#000000' });
          }

          // Keyboard handling is configured in capacitor.config.ts

          // Set up network monitoring
          const status = await Network.getStatus();
          setNetworkStatus({
            connected: status.connected,
            connectionType: status.connectionType
          });

          // Listen for network changes
          Network.addListener('networkStatusChange', (status) => {
            setNetworkStatus({
              connected: status.connected,
              connectionType: status.connectionType
            });
          });

        } catch (error) {
          console.error('Error initializing native features:', error);
        }
      }
    };

    initializeNativeFeatures();
  }, []);

  // Haptic feedback for interactions
  const triggerHapticFeedback = async (style: ImpactStyle = ImpactStyle.Light) => {
    if (isNative) {
      try {
        await Haptics.impact({ style });
      } catch (error) {
        console.error('Haptic feedback error:', error);
      }
    }
  };

  // Native sharing functionality
  const shareContent = async (title: string, text: string, url?: string) => {
    if (isNative) {
      try {
        await Share.share({
          title,
          text,
          url,
          dialogTitle: 'Share Todo'
        });
      } catch (error) {
        console.error('Share error:', error);
        // Fallback to web share API
        if (navigator.share) {
          await navigator.share({ title, text, url });
        }
      }
    } else if (navigator.share) {
      // Web share API fallback
      await navigator.share({ title, text, url });
    }
  };

  // Disable iOS bounce/overscroll
  useEffect(() => {
    if (isNative && Capacitor.getPlatform() === 'ios') {
      document.body.style.overscrollBehavior = 'none';
      document.documentElement.style.overscrollBehavior = 'none';
    }
  }, [isNative]);

  return {
    isNative,
    platform: Capacitor.getPlatform(),
    networkStatus,
    triggerHapticFeedback,
    shareContent
  };
};

export default useCapacitor;
