// server.js
import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRateLimiter, valrRateLimiter, exchangeRateLimiter, combinedRateLimiter } from './rate-limiter.js';

config(); // Load environment variables from .env

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const server = createServer(app);
const wss = new WebSocketServer({ server });

// API Keys - use environment variables first, fallback to hardcoded values
const VALR_API_KEY = process.env.VALR_API_KEY || "a147c5067273a303bae52b4abe829342ba045062bbe94f5bb2c600d74824f742";
const EXCHANGERATE_API_KEY = process.env.EXCHANGERATE_API_KEY || "acf8292c20a6f49789feba08";
const OPEN_EXCHANGE_APP_ID = process.env.OPEN_EXCHANGE_APP_ID || "9a477dfc12504d3b9cabdc9f233ca135";
const FIXER_API_KEY = process.env.FIXER_API_KEY || "944614a5c8afb31c1354ce7773a9d382";

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

// Optimize cache saving to reduce disk I/O
let cacheIsDirty = false;
function saveCache() {
  if (!cacheIsDirty) return;
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(ratesCache));
    cacheIsDirty = false;
  } catch (error) {
    console.error('Error saving cache:', error);
  }
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
  cacheIsDirty = true;
  saveCache();

  res.json({ success: true, marketRate: ratesCache.manualMarketRate });

  // Broadcast update to all connected clients
  broadcastRates();
});

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

// WebSocket connection handler - simplified for better performance
wss.on('connection', (ws) => {
  clients.add(ws);

  // Send initial rates when client connects
  fetchAndSendRates(ws);

  ws.on('message', (message) => {
    const messageStr = message.toString();

    // If client sends "fetchRates", process the request
    if (messageStr === 'fetchRates') {
      // Process the request - this will use cached data if available
      fetchAndSendRates(ws);
    }
  });

  ws.on('close', () => {
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
  let originalMarketRate = ratesCache.manualMarketRate;

  // If no manual rate, use API rate
  if (originalMarketRate === null) {
    originalMarketRate = ratesCache.marketRate;
  }

  const valrRate = ratesCache.valrRate;

  // Apply a 0.4% markup to the market rate to account for bank fees
  const MARKET_RATE_MARKUP = 0.004; // 0.4%
  const adjustedMarketRate = originalMarketRate * (1 + MARKET_RATE_MARKUP);

  // Calculate spread if both rates are available
  let spread = 0;
  if (valrRate !== null && adjustedMarketRate !== null) {
    spread = ((valrRate / adjustedMarketRate) - 1) * 100;
  }

  return {
    valrRate,
    marketRate: adjustedMarketRate,
    originalMarketRate,
    markup: MARKET_RATE_MARKUP * 100, // Store the markup percentage
    spread,
    lastUpdated: new Date().toISOString()
  };
}

// Function to fetch rates and send to a specific client or all clients
async function fetchAndSendRates(ws = null) {
  try {
    // Check if we have recent VALR data in cache (within last 3 minutes)
    const now = new Date();
    const lastValrUpdate = ratesCache.lastValrUpdate ? new Date(ratesCache.lastValrUpdate) : null;
    const valrCacheAge = lastValrUpdate ? now - lastValrUpdate : Infinity;

    // Only fetch fresh VALR rate if cache is older than 3 minutes or doesn't exist
    if (valrCacheAge > 3 * 60 * 1000 || ratesCache.valrRate === null) {
      // Apply rate limiting for VALR API
      if (valrRateLimiter.tryConsume()) {
        await fetchValrRate();
      }
    }

    // For market rate, check if we should fetch a new one
    const lastMarketUpdate = ratesCache.lastMarketUpdate ? new Date(ratesCache.lastMarketUpdate) : null;
    const marketCacheAge = lastMarketUpdate ? now - lastMarketUpdate : Infinity;

    // If we've never fetched or it's been more than 3 hours
    if (marketCacheAge > 3 * 60 * 60 * 1000 || ratesCache.marketRate === null) {
      // Apply rate limiting for exchange rate APIs
      if (exchangeRateLimiter.tryConsume()) {
        try {
          // Try Open Exchange Rates first
          await fetchOpenExchangeRate();
        } catch (openExchangeError) {
          try {
            // Then try Exchange Rate API
            await fetchExchangeRateAPI();
          } catch (exchangeRateError) {
            try {
              // Finally try Fixer as last resort
              await fetchFixerRate();
            } catch (fixerError) {
              // Silent error handling
            }
          }
        }
      }
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
    // Silent error handling for better performance
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
    // Configure headers with API key if provided
    const headers = {};
    if (VALR_API_KEY) {
      headers['X-Api-Key'] = VALR_API_KEY;
    }

    const response = await fetch('https://api.valr.com/v1/public/USDCZAR/marketsummary', { headers });
    if (!response.ok) {
      throw new Error(`VALR API error`);
    }
    const data = await response.json();
    ratesCache.valrRate = parseFloat(data.lastTradedPrice);
    ratesCache.lastValrUpdate = new Date().toISOString();
    cacheIsDirty = true;
    return ratesCache.valrRate;
  } catch (error) {
    throw error;
  }
}

// Fetch market rate from Open Exchange Rates API
async function fetchOpenExchangeRate() {
  try {
    const response = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${OPEN_EXCHANGE_APP_ID}&symbols=ZAR`);
    if (!response.ok) {
      throw new Error(`Open Exchange Rates API error`);
    }
    const data = await response.json();

    if (!data.rates || !data.rates.ZAR) {
      throw new Error('ZAR rate not found');
    }

    ratesCache.marketRate = data.rates.ZAR;
    ratesCache.lastMarketUpdate = new Date().toISOString();
    cacheIsDirty = true;
    saveCache();
    return ratesCache.marketRate;
  } catch (error) {
    throw error;
  }
}

// Fetch market rate from Exchange Rate API
async function fetchExchangeRateAPI() {
  try {
    const response = await fetch(`https://v6.exchangerate-api.com/v6/${EXCHANGERATE_API_KEY}/latest/USD`);
    if (!response.ok) {
      throw new Error(`Exchange Rate API error`);
    }
    const data = await response.json();

    if (data.result !== 'success') {
      throw new Error(`Exchange Rate API error`);
    }

    if (!data.conversion_rates || !data.conversion_rates.ZAR) {
      throw new Error('ZAR rate not found');
    }

    ratesCache.marketRate = data.conversion_rates.ZAR;
    ratesCache.lastMarketUpdate = new Date().toISOString();
    cacheIsDirty = true;
    saveCache();
    return ratesCache.marketRate;
  } catch (error) {
    throw error;
  }
}

// Fetch market rate from Fixer API (as backup)
async function fetchFixerRate() {
  try {
    const response = await fetch(`http://data.fixer.io/api/latest?access_key=${FIXER_API_KEY}&symbols=ZAR,USD`);
    if (!response.ok) {
      throw new Error(`Fixer API error`);
    }
    const data = await response.json();

    if (!data.success) {
      throw new Error(`Fixer API error`);
    }

    if (!data.rates || !data.rates.ZAR || !data.rates.USD) {
      throw new Error('Required rates not found');
    }

    // Fixer base currency is EUR, so we need to calculate USD/ZAR
    const zarPerEur = data.rates.ZAR;
    const usdPerEur = data.rates.USD;
    const zarPerUsd = zarPerEur / usdPerEur;

    ratesCache.marketRate = zarPerUsd;
    ratesCache.lastMarketUpdate = new Date().toISOString();
    cacheIsDirty = true;
    saveCache();
    return ratesCache.marketRate;
  } catch (error) {
    throw error;
  }
}

// Combined rates endpoint
app.get('/api/rates', async (req, res) => {
  try {
    // Check if this is a forced refresh request
    const forceRefresh = req.query.force === 'true';

    // Set cache control headers
    if (forceRefresh) {
      // No caching for forced refreshes
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
    } else {
      // Allow caching for normal requests
      res.set('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
    }

    // Apply rate limiting (but allow more frequent calls for forced refreshes)
    if (!forceRefresh && !combinedRateLimiter.tryConsume()) {
      const waitTime = combinedRateLimiter.getWaitTimeInMs();
      console.log(`Rate limit exceeded for /api/rates. Retry after ${Math.ceil(waitTime / 1000)} seconds.`);
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(waitTime / 1000)
      });
    }

    // Check if we have recent data in cache (within last 5 minutes)
    const now = new Date();
    const lastValrUpdate = ratesCache.lastValrUpdate ? new Date(ratesCache.lastValrUpdate) : null;
    const valrCacheAge = lastValrUpdate ? now - lastValrUpdate : Infinity;

    // Always fetch fresh VALR rate if force refresh is requested
    if (forceRefresh) {
      console.log('Force refreshing VALR rate');
      try {
        await fetchValrRate();
      } catch (error) {
        console.error('Error fetching VALR rate for forced refresh:', error);
        // If we don't have a VALR rate at all, return an error
        if (ratesCache.valrRate === null) {
          return res.status(500).json({ error: 'Failed to fetch VALR rate' });
        }
      }
    }
    // Otherwise, only fetch if cache is older than 5 minutes
    else if (valrCacheAge > 5 * 60 * 1000) {
      try {
        console.log('Cache expired, fetching fresh VALR rate');
        await fetchValrRate();
      } catch (error) {
        console.error('Error fetching VALR rate for /api/rates:', error);
        // If we don't have a VALR rate at all, return an error
        if (ratesCache.valrRate === null) {
          return res.status(500).json({ error: 'Failed to fetch VALR rate' });
        }
      }
    } else {
      console.log('Using cached VALR rate to reduce API calls');
    }

    // For market rate, check if we should fetch a new one
    const lastMarketUpdate = ratesCache.lastMarketUpdate ? new Date(ratesCache.lastMarketUpdate) : null;
    const marketCacheAge = lastMarketUpdate ? now - lastMarketUpdate : Infinity;

    // Always fetch fresh market rate if force refresh is requested
    if (forceRefresh) {
      try {
        console.log('Force refreshing market rate');
        // Try APIs in sequence
        await fetchOpenExchangeRate();
      } catch (openExchangeError) {
        try {
          await fetchExchangeRateAPI();
        } catch (exchangeRateError) {
          try {
            await fetchFixerRate();
          } catch (fixerError) {
            console.log('All APIs failed, using cached rate if available');
          }
        }
      }
    }
    // Otherwise, only fetch if cache is older than 2 hours
    else if (!lastMarketUpdate || marketCacheAge > 2 * 60 * 60 * 1000) {
      try {
        console.log('Cache expired, fetching fresh market rate');
        // Try APIs in sequence
        await fetchOpenExchangeRate();
      } catch (openExchangeError) {
        try {
          await fetchExchangeRateAPI();
        } catch (exchangeRateError) {
          try {
            await fetchFixerRate();
          } catch (fixerError) {
            console.log('All APIs failed, using cached rate if available');
          }
        }
      }
    } else {
      console.log('Using cached market rate to reduce API calls');
    }

    // Use manual market rate if available
    const marketRate = ratesCache.manualMarketRate !== null ?
      ratesCache.manualMarketRate : ratesCache.marketRate;

    // Original spread calculation is no longer needed as we'll use the adjusted spread

    // Apply a 0.4% markup to the market rate to account for bank fees
    const MARKET_RATE_MARKUP = 0.004; // 0.4%
    const adjustedMarketRate = marketRate * (1 + MARKET_RATE_MARKUP);

    // Recalculate spread with the adjusted market rate
    let adjustedSpread = 0;
    if (ratesCache.valrRate !== null && adjustedMarketRate !== null) {
      adjustedSpread = ((ratesCache.valrRate / adjustedMarketRate) - 1) * 100;
    }

    res.json({
      valrRate: ratesCache.valrRate,
      marketRate: adjustedMarketRate,
      originalMarketRate: marketRate,
      markup: MARKET_RATE_MARKUP * 100, // Store the markup percentage
      spread: adjustedSpread,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating rates response:', error);
    res.status(500).json({ error: 'Failed to fetch rates' });
  }
});

// VALR rate endpoint with rate limiting
app.get('/api/valr_rate', async (_, res) => {
  try {
    // Apply rate limiting
    if (!valrRateLimiter.tryConsume()) {
      const waitTime = valrRateLimiter.getWaitTimeInMs();
      console.log(`Rate limit exceeded for /api/valr_rate. Retry after ${Math.ceil(waitTime / 1000)} seconds.`);
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(waitTime / 1000)
      });
    }

    // Check if we have recent data in cache (within last 2 minutes)
    const now = new Date();
    const lastUpdate = ratesCache.lastValrUpdate ? new Date(ratesCache.lastValrUpdate) : null;
    const cacheAge = lastUpdate ? now - lastUpdate : Infinity;

    // Only fetch fresh data if cache is older than 2 minutes
    if (cacheAge > 2 * 60 * 1000) {
      console.log('Fetching fresh VALR rate for API endpoint');

      // Configure headers with API key if provided
      const headers = {};
      if (VALR_API_KEY) {
        headers['X-Api-Key'] = VALR_API_KEY;
      }

      const response = await fetch('https://api.valr.com/v1/public/USDCZAR/marketsummary', { headers });
      if (!response.ok) {
        throw new Error(`VALR API error: ${response.statusText}`);
      }
      const data = await response.json();

      // Update our cache
      ratesCache.valrRate = parseFloat(data.lastTradedPrice);
      ratesCache.lastValrUpdate = new Date().toISOString();
      cacheIsDirty = true;
      saveCache();

      res.json(data);
    } else {
      console.log('Using cached VALR rate to reduce API calls');

      // Return cached data in a format similar to the API response
      res.json({
        currencyPair: "USDCZAR",
        lastTradedPrice: ratesCache.valrRate.toString(),
        cachedAt: ratesCache.lastValrUpdate,
        fromCache: true
      });
    }
  } catch (error) {
    console.error('Error fetching VALR rate:', error);
    res.status(500).json({ error: 'Failed to fetch VALR rate' });
  }
});

// Exchange rate endpoint with rate limiting
app.get('/api/exchange_rate', async (_, res) => {
  try {
    // Apply rate limiting
    if (!exchangeRateLimiter.tryConsume()) {
      const waitTime = exchangeRateLimiter.getWaitTimeInMs();
      console.log(`Rate limit exceeded for /api/exchange_rate. Retry after ${Math.ceil(waitTime / 1000)} seconds.`);
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(waitTime / 1000)
      });
    }

    const now = new Date();
    const lastUpdate = ratesCache.lastMarketUpdate ? new Date(ratesCache.lastMarketUpdate) : null;

    // Only fetch a fresh rate if it's been a while (increased from 1 hour to 3 hours)
    if (!lastUpdate || (now - lastUpdate) > 3 * 60 * 60 * 1000) {
      try {
        // Try APIs in sequence
        await fetchOpenExchangeRate();
      } catch (openExchangeError) {
        try {
          await fetchExchangeRateAPI();
        } catch (exchangeRateError) {
          try {
            await fetchFixerRate();
          } catch (fixerError) {
            console.log('All APIs failed, using cached rate if available');
          }
        }
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

    // Return in a compatible format
    res.json({
      result: 'success',
      time_last_update_utc: ratesCache.lastMarketUpdate,
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

// Note: We're using on-demand updates instead of interval-based updates

// Add memory leak prevention
setInterval(() => {
  if (clients.size > 100) { // Set a reasonable maximum
    console.log(`Pruning inactive clients. Before: ${clients.size}`);
    // Keep only active clients
    clients.forEach(client => {
      if (client.readyState !== 1) clients.delete(client);
    });
    console.log(`After pruning: ${clients.size}`);
  }
}, 10 * 60 * 1000); // Check every 10 minutes

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});