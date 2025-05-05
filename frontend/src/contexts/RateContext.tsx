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
      
      const response = await fetch(`${apiBaseUrl}/api/rates?force=true`);
      
      if (!response.ok) {
        if (response.status === 429) {
          const data = await response.json();
          console.log(`Rate limited. Retry after ${data.retryAfter} seconds`);
          return;
        }
        throw new Error(`Failed to fetch rates: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Received fresh rate data:', data);
      
      // Update Firebase
      try {
        const ratesRef = ref(database, 'currentRates');
        await set(ratesRef, data);
        console.log('Updated Firebase with fresh rates');
        setLastRefreshed(new Date());
      } catch (error) {
        console.error('Firebase error:', error);
      }
    } catch (error) {
      console.error('Error refreshing rates:', error);
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
