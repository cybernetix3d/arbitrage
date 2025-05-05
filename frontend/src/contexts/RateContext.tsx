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

      // Simple fetch with minimal overhead - force refresh to get latest rates
      const response = await fetch(`${apiBaseUrl}/api/rates?force=true`);

      if (!response.ok) {
        if (response.status === 429) {
          return;
        }
        return;
      }

      const data = await response.json();

      // Update Firebase with the latest rates
      // This will trigger updates in all components that listen to this data
      const ratesRef = ref(database, 'currentRates');
      await set(ratesRef, {
        valrRate: data.valrRate,
        marketRate: data.marketRate,
        spread: data.spread,
        lastUpdated: new Date().toISOString()
      });

      // Update last refreshed timestamp
      setLastRefreshed(new Date());
    } catch (error) {
      // Silent error handling
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
