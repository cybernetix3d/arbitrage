import React, { useEffect, useRef, useState, useCallback } from 'react';
import { database } from '../lib/firebase';
import { ref, set } from 'firebase/database';

// Extend WebSocket type to include our custom properties
interface ExtendedWebSocket extends WebSocket {
  rateUpdateInterval?: NodeJS.Timeout;
}

const RateService: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<ExtendedWebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRateUpdateRef = useRef<number>(0);

  // Implement exponential backoff for reconnection
  const MAX_RECONNECT_DELAY = 60000; // 1 minute maximum
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Initialize WebSocket connection
  const connectWebSocket = useCallback(() => {
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Connect to WebSocket server
    const wsUrl = 'wss://arbitrage-dw9h.onrender.com';
    console.log('Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Connection opened
    ws.onopen = () => {
      console.log('WebSocket connection established');
      setIsConnected(true);

      // Request initial rates
      ws.send('fetchRates');

      // Clear any pending reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Set up periodic rate updates via WebSocket
      // This will request rates every 60 seconds if the connection is active
      const rateUpdateInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log('Requesting periodic rate update via WebSocket');
          ws.send('fetchRates');
        }
      }, 60000); // Every 60 seconds

      // Store the interval so we can clear it later
      ws.rateUpdateInterval = rateUpdateInterval;
    };

    // Listen for messages
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'rates') {
          const { valrRate, marketRate, spread, lastUpdated } = message.data;

          // Update Firebase with the received data
          try {
            const ratesRef = ref(database, 'currentRates');
            set(ratesRef, {
              valrRate,
              marketRate,
              spread,
              lastUpdated
            });
            console.log('Updated Firebase via WebSocket');
            lastRateUpdateRef.current = Date.now();
          } catch (error) {
            console.error('Firebase error:', error);
          }
        } else if (message.type === 'error') {
          console.error('WebSocket error:', message.data.message);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    // Connection closed
    ws.onclose = () => {
      console.log('WebSocket connection closed');
      setIsConnected(false);

      // Clear the rate update interval if it exists
      if (ws.rateUpdateInterval) {
        clearInterval(ws.rateUpdateInterval);
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        5000 * Math.pow(1.5, reconnectAttempts) + Math.random() * 1000,
        MAX_RECONNECT_DELAY
      );
      setReconnectAttempts(prevAttempts => prevAttempts + 1);

      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, delay);
    };

    // Connection error
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // The onclose handler will be called after this
    };
  }, [reconnectAttempts]);

  // HTTP fetch as backup with reasonable interval
  const fetchRatesHttp = useCallback(async () => {
    const now = Date.now();

    // Only fetch via HTTP if it's been at least 2 minutes since our last update
    // This prevents excessive API calls while still providing a fallback
    if (now - lastRateUpdateRef.current < 120000) {
      console.log('Skipping HTTP fetch - recent update available');
      return;
    }

    try {
      const apiBaseUrl = 'https://arbitrage-dw9h.onrender.com';

      console.log('Fetching rates via HTTP fallback');

      const response = await fetch(`${apiBaseUrl}/api/rates`);

      if (!response.ok) {
        // Handle rate limiting response (HTTP 429)
        if (response.status === 429) {
          const data = await response.json();
          console.log(`Rate limited. Retry after ${data.retryAfter} seconds`);
          return;
        }
        throw new Error(`Failed to fetch rates: ${response.status}`);
      }

      const data = await response.json();
      console.log('Received rate data via HTTP:', data);

      // Update Firebase
      try {
        const ratesRef = ref(database, 'currentRates');
        await set(ratesRef, data);
        console.log('Updated Firebase via HTTP');
        lastRateUpdateRef.current = now;
      } catch (error) {
        console.error('Firebase error:', error);
      }
    } catch (error) {
      console.error('Error fetching rates via HTTP:', error);
    }
  }, [lastRateUpdateRef]);

  useEffect(() => {
    console.log('RateService starting...');

    // Start with WebSocket connection
    connectWebSocket();

    // Also try HTTP right away as backup
    fetchRatesHttp();

    // Set up periodic HTTP check if WebSocket fails
    // This is a fallback that only runs if the WebSocket is disconnected
    const httpFallbackInterval = setInterval(() => {
      if (!isConnected) {
        console.log('WebSocket not connected, using HTTP fallback');
        fetchRatesHttp();
      }
    }, 300000); // Check every 5 minutes

    // Clean up
    return () => {
      if (wsRef.current) {
        // Clear the rate update interval if it exists
        if (wsRef.current.rateUpdateInterval) {
          clearInterval(wsRef.current.rateUpdateInterval);
        }
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      clearInterval(httpFallbackInterval);
    };
  }, [isConnected, connectWebSocket, fetchRatesHttp]);

  return null;
};

export default RateService;