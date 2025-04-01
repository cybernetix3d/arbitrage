import React, { useEffect, useRef, useState, useCallback } from 'react';
import { database } from '../lib/firebase';
import { ref, set } from 'firebase/database';

const RateService: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Implement exponential backoff for reconnection
  const MAX_RECONNECT_DELAY = 60000; // 1 minute maximum
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Initialize WebSocket connection
  const connectWebSocket = useCallback(() => {
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Convert https:// to wss:// if needed
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

  // HTTP fetch as backup
  const fetchRatesHttp = useCallback(async () => {
    try {
      const apiBaseUrl = 'https://arbitrage-dw9h.onrender.com';
      
      console.log('Fetching rates via HTTP');
      const response = await fetch(`${apiBaseUrl}/api/rates`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch rates: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Received rate data:', data);
      
      // Update Firebase
      try {
        const ratesRef = ref(database, 'currentRates');
        await set(ratesRef, data);
        console.log('Updated Firebase via HTTP');
      } catch (error) {
        console.error('Firebase error:', error);
      }
    } catch (error) {
      console.error('Error fetching rates via HTTP:', error);
    }
  }, []);

  useEffect(() => {
    console.log('RateService starting...');
    
    // Start with WebSocket connection
    connectWebSocket();
    
    // Also try HTTP right away as backup
    fetchRatesHttp();

    // Set up periodic HTTP check if WebSocket fails
    const httpFallbackInterval = setInterval(() => {
      if (!isConnected) {
        console.log('WebSocket not connected, using HTTP fallback');
        fetchRatesHttp();
      }
    }, 60000); // Check every minute

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