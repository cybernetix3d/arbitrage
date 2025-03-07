// server.js
import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';

config(); // Load environment variables from .env

const app = express();
const PORT = process.env.PORT || 5000;
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST'], // Allowed methods
  allowedHeaders: ['Content-Type', 'X-Api-Key'], // Allowed headers
  credentials: true // Allow cookies
}));

app.use(express.json());

// Cache file path
const CACHE_FILE = path.join(__dirname, 'rates_cache.json');

// Default cache values
let ratesCache = {
  valrRate: null,
  marketRate: null,
  lastValrUpdate: null,
  lastMarketUpdate: null,
  manualMarketRate: null
};

// Try to load cache from file
try {
  if (fs.existsSync(CACHE_FILE)) {
    const cacheData = fs.readFileSync(CACHE_FILE, 'utf8');
    ratesCache = JSON.parse(cacheData);
    console.log('Loaded rates cache from file');
  }
} catch (error) {
  console.error('Error loading cache file:', error);
}

// Add a route to manually set market rate
app.post('/api/set_market_rate', (req, res) => {
  const { marketRate } = req.body;
  
  if (!marketRate || isNaN(parseFloat(marketRate))) {
    return res.status(400).json({ error: 'Invalid market rate' });
  }
  
  ratesCache.manualMarketRate = parseFloat(marketRate);
  ratesCache.lastMarketUpdate = new Date().toISOString();
  
  // Save to cache file
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(ratesCache));
  } catch (error) {
    console.error('Error saving cache file:', error);
  }
  
  res.json({ success: true, marketRate: ratesCache.manualMarketRate });
  
  // Broadcast update to all connected clients
  broadcastRates();
});

// Save cache function
function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(ratesCache));
  } catch (error) {
    console.error('Error saving cache:', error);
  }
}

// Add a root route handler
app.get('/', (req, res) => {
  res.send('USD/ZAR Rate Tracking API. WebSocket connection available or use /api/valr_rate and /api/exchange_rate endpoints.');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

// Broadcast rates to all connected clients
function broadcastRates() {
  const rates = prepareRatesMessage();
  const message = JSON.stringify({
    type: 'rates',
    data: rates
  });
  
  clients.forEach(client => {
    if (client.readyState === 1) { // Check if connection is open
      client.send(message);
    }
  });
}

// Prepare rates message with best available data
function prepareRatesMessage() {
  // Use the most recent market rate (manual or API)
  let marketRate = ratesCache.manualMarketRate;
  
  // If no manual rate, use API rate
  if (marketRate === null) {
    marketRate = ratesCache.marketRate;
  }
  
  const valrRate = ratesCache.valrRate;
  
  // Calculate spread if both rates are available
  let spread = 0;
  if (valrRate !== null && marketRate !== null) {
    spread = ((valrRate / marketRate) - 1) * 100;
  }
  
  return {
    valrRate,
    marketRate,
    spread,
    lastUpdated: new Date().toISOString()
  };
}

// Function to fetch rates and send to a specific client or all clients
async function fetchAndSendRates(ws = null) {
  try {
    // Always fetch VALR rate - no rate limiting needed
    await fetchValrRate();
    
    // For market rate, check if we should fetch a new one
    const now = new Date();
    const lastUpdate = ratesCache.lastMarketUpdate ? new Date(ratesCache.lastMarketUpdate) : null;
    
    // If we've never fetched or it's been more than 12 hours
    if (!lastUpdate || (now - lastUpdate) > 12 * 60 * 60 * 1000) {
      console.log('Fetching fresh market rate from API');
      try {
        await fetchMarketRate();
      } catch (error) {
        console.log('Error fetching market rate, using cached value:', error.message);
      }
    } else {
      console.log('Using cached market rate to avoid rate limiting');
    }
    
    // Prepare rates message
    const rates = prepareRatesMessage();
    
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

// Fetch VALR rate - always fetch fresh data
async function fetchValrRate() {
  try {
    console.log('Fetching fresh VALR rate');
    const response = await fetch('https://api.valr.com/v1/public/USDCZAR/marketsummary');
    if (!response.ok) {
      throw new Error(`VALR API error: ${response.statusText}`);
    }
    const data = await response.json();
    ratesCache.valrRate = parseFloat(data.lastTradedPrice);
    ratesCache.lastValrUpdate = new Date().toISOString();
    saveCache();
    return ratesCache.valrRate;
  } catch (error) {
    console.error('Error fetching VALR rate:', error);
    throw error;
  }
}

// Fetch market rate from Exchange Rate API - rate limited
async function fetchMarketRate() {
  try {
    console.log('Fetching exchange rate from API');
    const response = await fetch(`https://v6.exchangerate-api.com/v6/${process.env.EXCHANGERATE_API_KEY}/latest/USD`);
    if (!response.ok) {
      throw new Error(`Exchange Rate API error: ${response.statusText}`);
    }
    const data = await response.json();
    ratesCache.marketRate = data.conversion_rates.ZAR;
    ratesCache.lastMarketUpdate = new Date().toISOString();
    saveCache();
    return ratesCache.marketRate;
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    // Keep using the last successful rate if available
    if (ratesCache.marketRate === null) {
      // If we've never had a successful rate, use a reasonable estimate
      ratesCache.marketRate = 18.5; // Approximate USD/ZAR rate
      ratesCache.lastMarketUpdate = new Date().toISOString();
      saveCache();
    }
    throw error;
  }
}

// Combined rates endpoint
app.get('/api/rates', async (req, res) => {
  try {
    // Always fetch fresh VALR rate
    try {
      await fetchValrRate();
    } catch (error) {
      console.error('Error fetching VALR rate for /api/rates:', error);
      // If we don't have a VALR rate at all, return an error
      if (ratesCache.valrRate === null) {
        return res.status(500).json({ error: 'Failed to fetch VALR rate' });
      }
    }
    
    // For market rate, check if we should fetch a new one
    const now = new Date();
    const lastUpdate = ratesCache.lastMarketUpdate ? new Date(ratesCache.lastMarketUpdate) : null;
    
    // If we've never fetched or it's been more than 12 hours
    if (!lastUpdate || (now - lastUpdate) > 12 * 60 * 60 * 1000) {
      try {
        await fetchMarketRate();
      } catch (error) {
        console.error('Error fetching market rate for /api/rates:', error);
        // Continue with cached rate
      }
    }
    
    // Use manual market rate if available
    const marketRate = ratesCache.manualMarketRate !== null ? 
      ratesCache.manualMarketRate : ratesCache.marketRate;
    
    // Calculate spread if both rates are available
    let spread = 0;
    if (ratesCache.valrRate !== null && marketRate !== null) {
      spread = ((ratesCache.valrRate / marketRate) - 1) * 100;
    }
    
    res.json({
      valrRate: ratesCache.valrRate,
      marketRate,
      spread,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating rates response:', error);
    res.status(500).json({ error: 'Failed to fetch rates' });
  }
});

// VALR rate endpoint - always fetch fresh data
app.get('/api/valr_rate', async (req, res) => {
  try {
    console.log('Fetching fresh VALR rate for API endpoint');
    const response = await fetch('https://api.valr.com/v1/public/USDCZAR/marketsummary');
    if (!response.ok) {
      throw new Error(`VALR API error: ${response.statusText}`);
    }
    const data = await response.json();
    
    // Update our cache
    ratesCache.valrRate = parseFloat(data.lastTradedPrice);
    ratesCache.lastValrUpdate = new Date().toISOString();
    saveCache();
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching VALR rate:', error);
    res.status(500).json({ error: 'Failed to fetch VALR rate' });
  }
});

// Exchange rate endpoint - rate limited
app.get('/api/exchange_rate', async (req, res) => {
  try {
    const now = new Date();
    const lastUpdate = ratesCache.lastMarketUpdate ? new Date(ratesCache.lastMarketUpdate) : null;
    
    // Only fetch a fresh rate if it's been a while
    if (!lastUpdate || (now - lastUpdate) > 12 * 60 * 60 * 1000) {
      try {
        await fetchMarketRate();
      } catch (error) {
        // Continue with cached value
        console.error('Using cached market rate due to API error:', error);
      }
    } else {
      console.log('Using cached market rate to avoid rate limiting');
    }
    
    // Use manual market rate if available
    const marketRate = ratesCache.manualMarketRate !== null ? 
      ratesCache.manualMarketRate : ratesCache.marketRate;
    
    if (marketRate === null) {
      return res.status(500).json({ error: 'No market rate available' });
    }
    
    // Return in the same format as the Exchange Rate API would
    res.json({
      result: 'success',
      documentation: 'https://www.exchangerate-api.com/docs',
      terms_of_use: 'https://www.exchangerate-api.com/terms',
      time_last_update_unix: Math.floor(new Date(ratesCache.lastMarketUpdate).getTime() / 1000),
      time_last_update_utc: ratesCache.lastMarketUpdate,
      time_next_update_unix: Math.floor(new Date(ratesCache.lastMarketUpdate).getTime() / 1000) + 24 * 60 * 60,
      time_next_update_utc: new Date(new Date(ratesCache.lastMarketUpdate).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      base_code: 'USD',
      conversion_rates: {
        ZAR: marketRate
      }
    });
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    res.status(500).json({ error: 'Failed to fetch exchange rate' });
  }
});

// Set up a periodic broadcast to all connected clients
const RATE_UPDATE_INTERVAL = 1 * 60 * 1000; // 1 minute for VALR updates
setInterval(() => {
  if (clients.size > 0) {
    console.log(`Broadcasting rates to ${clients.size} clients`);
    fetchAndSendRates();
  }
}, RATE_UPDATE_INTERVAL);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});