// rate-limiter.js
// A simple token bucket rate limiter implementation

/**
 * Creates a new rate limiter with the token bucket algorithm
 * @param {number} maxTokens - Maximum number of tokens in the bucket
 * @param {number} refillRate - Number of tokens to add per second
 * @returns {Object} - Rate limiter functions
 */
export function createRateLimiter(maxTokens, refillRate) {
  // Initialize the bucket with maximum tokens
  let tokens = maxTokens;
  let lastRefillTimestamp = Date.now();
  
  // Refill the bucket based on elapsed time
  function refill() {
    const now = Date.now();
    const elapsedTimeInMs = now - lastRefillTimestamp;
    const elapsedTimeInSec = elapsedTimeInMs / 1000;
    const tokensToAdd = elapsedTimeInSec * refillRate;
    
    tokens = Math.min(maxTokens, tokens + tokensToAdd);
    lastRefillTimestamp = now;
  }
  
  /**
   * Check if a request can be processed
   * @param {number} tokenCost - Number of tokens required for this request (default: 1)
   * @returns {boolean} - Whether the request can proceed
   */
  function tryConsume(tokenCost = 1) {
    refill();
    
    if (tokens >= tokenCost) {
      tokens -= tokenCost;
      return true;
    }
    
    return false;
  }
  
  /**
   * Get the time in ms until the next token is available
   * @param {number} tokenCost - Number of tokens required
   * @returns {number} - Time in ms until enough tokens are available
   */
  function getWaitTimeInMs(tokenCost = 1) {
    refill();
    
    if (tokens >= tokenCost) {
      return 0;
    }
    
    // Calculate how many more tokens we need
    const tokensNeeded = tokenCost - tokens;
    
    // Calculate how long it will take to get those tokens
    return (tokensNeeded / refillRate) * 1000;
  }
  
  return {
    tryConsume,
    getWaitTimeInMs
  };
}

// Create rate limiters for different endpoints
export const valrRateLimiter = createRateLimiter(10, 1/10); // 10 requests max, refills at 1 per 10 seconds
export const exchangeRateLimiter = createRateLimiter(5, 1/60); // 5 requests max, refills at 1 per minute
export const combinedRateLimiter = createRateLimiter(20, 1/5); // 20 requests max, refills at 1 per 5 seconds
