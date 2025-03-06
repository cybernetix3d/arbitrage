import React, { useEffect, useRef, useState, useCallback } from 'react';
import { database } from '../lib/firebase';
import { ref, set } from 'firebase/database';

const RateService: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize WebSocket connection
  const connectWebSocket = useCallback(() => {
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:5000';
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
          const ratesRef = ref(database, 'currentRates');
          set(ratesRef, {
            valrRate,
            marketRate,
            spread,
            lastUpdated
          });
          console.log('RateService: updated Firebase currentRates via WebSocket');
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
      
      // Attempt to reconnect after a delay
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...');
        connectWebSocket();
      }, 5000); // Try to reconnect after 5 seconds
    };

    // Connection error
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // The onclose handler will be called after this
    };
  }, []);

  // Fallback HTTP method in case WebSocket fails
  const fetchRatesHttp = useCallback(async () => {
    try {
      const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:5000';
      const baseUrl = wsUrl.replace('wss:', 'https:').replace('ws:', 'http:');
      
      // Fetch VALR rate via your proxy endpoint
      const valrResponse = await fetch(`${baseUrl}/api/valr_rate`);
      if (!valrResponse.ok) throw new Error('Failed to fetch VALR rate from proxy');
      const valrData = await valrResponse.json();
      const valrRate = parseFloat(valrData.lastTradedPrice);

      // Fetch market rate from Exchange Rate API
      const exchangeRateResponse = await fetch(`${baseUrl}/api/exchange_rate`);
      if (!exchangeRateResponse.ok) throw new Error('Failed to fetch exchange rate');
      const exchangeRateData = await exchangeRateResponse.json();
      const marketRate = exchangeRateData.conversion_rates.ZAR;

      const spread = ((valrRate / marketRate) - 1) * 100;

      const ratesRef = ref(database, 'currentRates');
      await set(ratesRef, {
        valrRate,
        marketRate,
        spread,
        lastUpdated: new Date().toISOString()
      });
      console.log('RateService: updated Firebase currentRates via HTTP fallback');
    } catch (error) {
      console.error('Error updating rates via HTTP:', error);
    }
  }, []);

  useEffect(() => {
    // Initialize WebSocket connection
    connectWebSocket();

    // Set up fallback mechanism using HTTP if WebSocket is disconnected for too long
    const httpFallbackInterval = setInterval(() => {
      if (!isConnected) {
        console.log('Using HTTP fallback to update rates');
        fetchRatesHttp();
      }
    }, 1 * 60 * 1000); // Check every 1 minute

    // Clean up on component unmount
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