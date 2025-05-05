import React, { createContext, useContext, useState, useCallback } from 'react';
import { database } from '../lib/firebase';
import { ref, set } from 'firebase/database';

interface RateContextType {
  refreshRates: () => Promise<void>;
  isRefreshing: boolean;
  lastRefreshed: Date | null;
}

const RateContext = createContext<RateContextType | null>(null);

export const useRates = () => {
  const context = useContext(RateContext);
  if (!context) {
    throw new Error('useRates must be used within a RateProvider');
  }
  return context;
};

export const RateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const refreshRates = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      const apiBaseUrl = 'https://arbitrage-dw9h.onrender.com';

      console.log('Manually refreshing rates via HTTP');

      // Add a cache-busting parameter to ensure we get a fresh response
      const cacheBuster = Date.now();
      const response = await fetch(`${apiBaseUrl}/api/rates?force=true&_=${cacheBuster}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        if (response.status === 429) {
          const data = await response.json();
          console.log(`Rate limited. Retry after ${data.retryAfter} seconds`);
          setIsRefreshing(false);
          return;
        }
        throw new Error(`Failed to fetch rates: ${response.status}`);
      }

      const data = await response.json();
      console.log('Received fresh rate data:', data);

      // Update Firebase directly with the received data
      // This ensures we don't rely on Firebase to propagate the changes
      const ratesRef = ref(database, 'currentRates');
      await set(ratesRef, {
        valrRate: data.valrRate,
        marketRate: data.marketRate,
        spread: data.spread,
        lastUpdated: data.lastUpdated || new Date().toISOString()
      });

      console.log('Updated Firebase with fresh rates');
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Error refreshing rates:', error);
      // Try a direct update to Firebase as a fallback
      try {
        // Just update the lastUpdated field to trigger a refresh
        const ratesRef = ref(database, 'currentRates');
        await set(ratesRef, {
          lastUpdated: new Date().toISOString()
        });
      } catch (fbError) {
        console.error('Firebase fallback error:', fbError);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const value = {
    refreshRates,
    isRefreshing,
    lastRefreshed
  };

  return (
    <RateContext.Provider value={value}>
      {children}
    </RateContext.Provider>
  );
};
