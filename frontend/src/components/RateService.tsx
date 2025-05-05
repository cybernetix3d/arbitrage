import React, { useEffect, useRef, useState, useCallback } from 'react';
import { database } from '../lib/firebase';
import { ref, set } from 'firebase/database';

const RateService: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
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

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Connection opened
    ws.onopen = () => {
      setIsConnected(true);

      // Request initial rates
      ws.send('fetchRates');

      // Clear any pending reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // We'll no longer set up automatic periodic updates via WebSocket
      // This reduces CPU and network usage
      // Users can manually refresh using the refresh button instead
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
            lastRateUpdateRef.current = Date.now();
          } catch (error) {
            // Silent error handling to reduce console noise
          }
        }
      } catch (error) {
        // Silent error handling to reduce console noise
      }
    };

    // Connection closed
    ws.onclose = () => {
      setIsConnected(false);

      // Simple reconnection with fixed delay to reduce CPU usage
      const delay = 10000; // Fixed 10-second delay

      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, delay);
    };

    // Connection error - silent handler
    ws.onerror = () => {
      // The onclose handler will be called after this
    };
  }, [reconnectAttempts]);

  // HTTP fetch as backup with reasonable interval
  const fetchRatesHttp = useCallback(async () => {
    const now = Date.now();

    // Only fetch via HTTP if it's been at least 2 minutes since our last update
    // This prevents excessive API calls while still providing a fallback
    if (now - lastRateUpdateRef.current < 120000) {
      return;
    }

    try {
      const apiBaseUrl = 'https://arbitrage-dw9h.onrender.com';

      const response = await fetch(`${apiBaseUrl}/api/rates`);

      if (!response.ok) {
        // Handle rate limiting response (HTTP 429)
        if (response.status === 429) {
          return;
        }
        return;
      }

      const data = await response.json();

      // Update Firebase
      try {
        const ratesRef = ref(database, 'currentRates');
        await set(ratesRef, data);
        lastRateUpdateRef.current = now;
      } catch (error) {
        // Silent error handling
      }
    } catch (error) {
      // Silent error handling
    }
  }, [lastRateUpdateRef]);

  useEffect(() => {
    // Start with WebSocket connection
    connectWebSocket();

    // Also try HTTP right away as backup
    fetchRatesHttp();

    // Set up periodic HTTP check if WebSocket fails
    // This is a fallback that only runs if the WebSocket is disconnected
    const httpFallbackInterval = setInterval(() => {
      if (!isConnected) {
        fetchRatesHttp();
      }
    }, 300000); // Check every 5 minutes

    // Clean up
    return () => {
      if (wsRef.current) {
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