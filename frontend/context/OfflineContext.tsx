import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { useOfflineData } from '../hooks/useOfflineData';

interface OfflineContextType {
  isOffline: boolean;
  isSyncing: boolean;
  queuedCount: number;
  lastSyncTime: Date | null;
  syncNow: () => Promise<void>;
  clearOfflineData: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType>({
  isOffline: false,
  isSyncing: false,
  queuedCount: 0,
  lastSyncTime: null,
  syncNow: async () => {},
  clearOfflineData: async () => {}
});

export const useOffline = () => useContext(OfflineContext);

interface OfflineProviderProps {
  children: ReactNode;
}

export const OfflineProvider = ({ children }: OfflineProviderProps) => {
  const [isOffline, setIsOffline] = useState(false);
  const offlineData = useOfflineData();

  useEffect(() => {
    const updateStatus = async () => {
      let offline = !navigator.onLine;

      // Use Capacitor Network plugin if available for more accurate status
      if (Capacitor.isNativePlatform()) {
        try {
          const status = await Network.getStatus();
          offline = !status.connected;
        } catch (error) {
          console.error('Failed to get network status:', error);
        }
      }

      setIsOffline(offline);

      // Auto-sync when coming back online (handled by useOfflineData hook)
      if (!offline) {
        console.log('📶 Network back online, sync will be handled by useOfflineData');
      }
    };

    // Initial check
    updateStatus();

    // Listen for network changes
    const handleOnline = () => updateStatus();
    const handleOffline = () => updateStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Capacitor network listener
    let networkListener: any;
    if (Capacitor.isNativePlatform()) {
      Network.addListener('networkStatusChange', (status) => {
        setIsOffline(!status.connected);
        if (status.connected) {
          console.log('📶 Capacitor: Network back online, sync will be handled by useOfflineData');
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (networkListener) {
        networkListener.remove();
      }
    };
  }, []);

  const contextValue: OfflineContextType = {
    isOffline: !offlineData.isOnline, // Use the network status from useOfflineData
    isSyncing: offlineData.isSyncing,
    queuedCount: offlineData.queuedCount,
    lastSyncTime: offlineData.lastSyncTime,
    syncNow: offlineData.syncNow,
    clearOfflineData: offlineData.clearOfflineData
  };

  return <OfflineContext.Provider value={contextValue}>{children}</OfflineContext.Provider>;
};
