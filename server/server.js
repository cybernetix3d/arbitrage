// server.js
import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

config(); // Load environment variables from .env

const app = express();
const PORT = process.env.PORT || 5000;
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Store connected clients
const clients = new Set();

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);

  // Send initial rates when client connects
  fetchAndSendRates(ws);

  ws.on('message', (message) => {
    console.log('Received message:', message.toString());
    
    // If client sends "fetchRates", send updated rates
    if (message.toString() === 'fetchRates') {
      fetchAndSendRates(ws);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

// Function to fetch rates and send to a specific client or all clients
async function fetchAndSendRates(ws = null) {
  try {
    // Fetch VALR rate
    const valrResponse = await fetch('https://api.valr.com/v1/public/USDCZAR/marketsummary', {
      headers: { 'X-Api-Key': process.env.VALR_API_KEY }
    });
    if (!valrResponse.ok) {
      throw new Error(`VALR API error: ${valrResponse.statusText}`);
    }
    const valrData = await valrResponse.json();
    const valrRate = parseFloat(valrData.lastTradedPrice);

    // Fetch market rate from Exchange Rate API
    const exchangeRateResponse = await fetch(`https://v6.exchangerate-api.com/v6/${process.env.EXCHANGERATE_API_KEY}/latest/USD`);
    if (!exchangeRateResponse.ok) {
      throw new Error(`Exchange Rate API error: ${exchangeRateResponse.statusText}`);
    }
    const exchangeRateData = await exchangeRateResponse.json();
    const marketRate = exchangeRateData.conversion_rates.ZAR;

    const spread = ((valrRate / marketRate) - 1) * 100;

    const rates = {
      valrRate,
      marketRate,
      spread,
      lastUpdated: new Date().toISOString()
    };

    const message = JSON.stringify({
      type: 'rates',
      data: rates
    });

    // Send to specific client or broadcast to all
    if (ws) {
      ws.send(message);
    } else {
      clients.forEach(client => {
        if (client.readyState === 1) { // Check if connection is open
          client.send(message);
        }
      });
    }
  } catch (error) {
    console.error('Error fetching rates:', error);
    const errorMessage = JSON.stringify({
      type: 'error',
      data: { message: 'Failed to fetch rates' }
    });
    
    if (ws) {
      ws.send(errorMessage);
    }
  }
}

// Maintain REST endpoints as fallback
app.get('/api/valr_rate', async (req, res) => {
  try {
    const response = await fetch('https://api.valr.com/v1/public/USDCZAR/marketsummary', {
      headers: { 'X-Api-Key': process.env.VALR_API_KEY }
    });
    if (!response.ok) {
      throw new Error(`VALR API error: ${response.statusText}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching VALR rate:', error);
    res.status(500).json({ error: 'Failed to fetch VALR rate' });
  }
});

app.get('/api/exchange_rate', async (req, res) => {
  try {
    const response = await fetch(`https://v6.exchangerate-api.com/v6/${process.env.EXCHANGERATE_API_KEY}/latest/USD`);
    if (!response.ok) {
      throw new Error(`Exchange Rate API error: ${response.statusText}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    res.status(500).json({ error: 'Failed to fetch exchange rate' });
  }
});

// Set up a periodic broadcast to all connected clients
const RATE_UPDATE_INTERVAL = 60000; // 1 minute
setInterval(() => {
  if (clients.size > 0) {
    console.log(`Broadcasting rates to ${clients.size} clients`);
    fetchAndSendRates();
  }
}, RATE_UPDATE_INTERVAL);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});