const express = require('express');
const axios = require('axios');
const redis = require('redis');
const rateLimit = require('axios-rate-limit');

const router = express.Router();
const redisClient = redis.createClient({
  url: `${process.env.REDIS_URL}` 
});
redisClient.connect();

const http = rateLimit(axios.create(), { maxRequests: 29, perMilliseconds: 60000 });

// Object to hold the queue of symbols and their response handlers
const priceSymbolQueue = {
  symbols: new Set(),
  handlers: [],
  timer: null
};

const dataSymbolQueue = {
  symbols: new Set(),
  handlers: [],
  timer: null
};

// Function to process the queued symbols
async function processSymbolQueue() {
  try {
    const symbolsToFetch = Array.from(priceSymbolQueue.symbols).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(symbolsToFetch)}&vs_currencies=usd&include_last_updated_at=true`;
    const response = await axios.get(url);
    const data = response.data;
    // Store each symbol's data in cache separately
    for (const [symbol, priceData] of Object.entries(data)) {
      const cacheKey = `priceData:${symbol}`;
      await redisClient.setEx(cacheKey, 600, JSON.stringify(priceData));
    }

    priceSymbolQueue.handlers.forEach(handler => {
      // Combine cached responses with the new data
      const combinedData = { ...handler.cachedResponses };
      for (const [symbol, priceData] of Object.entries(data)) {
        combinedData[symbol] = priceData;
      }
      handler.res.json(combinedData);
    });
  } catch (error) {
    console.error('Error fetching or caching prices:', error);
    // Handle errors by sending an error response to all handlers
    priceSymbolQueue.handlers.forEach(handler => {
      handler.res.status(500).send('Error fetching prices');
    });
  } finally {
    // Reset the queue and timer
    priceSymbolQueue.symbols.clear();
    priceSymbolQueue.handlers = [];
    priceSymbolQueue.timer = null;
  }
}

async function processSymbolDataQueue() {
  try {
    const symbolsToFetch = Array.from(dataSymbolQueue.symbols).join(',');
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(symbolsToFetch)}&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d%2C14d%2C30d%2C200d%2C1y`;
    const response = await axios.get(url);
    const data = response.data;
    // Store each symbol's data in cache separately
    for (const symbolData of data) {
      const cacheKey = `symbolData:${symbolData.id}`;
      await redisClient.setEx(cacheKey, 1000, JSON.stringify(symbolData));
    }

    dataSymbolQueue.handlers.forEach(handler => {
      // Combine cached responses with the new data
      const combinedData = [...handler.cachedResponses];
      combinedData.push(...data);
      handler.res.json(combinedData);
    });
  } catch (error) {
    console.error('Error fetching or caching prices:', error);
    // Handle errors by sending an error response to all handlers
    dataSymbolQueue.handlers.forEach(handler => {
      handler.res.status(500).send('Error fetching prices');
    });
  } finally {
    // Reset the queue and timer
    dataSymbolQueue.symbols.clear();
    dataSymbolQueue.handlers = [];
    dataSymbolQueue.timer = null;
  }
}

router.get('/prices', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) {
    return res.status(400).send('No symbols provided');
  }

  let symbolListDups = symbols.split(',');
  let symbolList = removeDuplicates(symbolListDups);

  // Check cache for each symbol and only queue those not in cache
  let symbolsToFetch = [];
  let cachedResponses = {};
  for (const symbol of symbolList) {
    const symbolCacheKey = `priceData:${symbol}`;
    const cachedData = await redisClient.get(symbolCacheKey);
    if (cachedData) {
      cachedResponses[symbol] = JSON.parse(cachedData);
    } else {
      symbolsToFetch.push(symbol);
    }
  }
  if (Object.keys(cachedResponses).length === symbolList.length) {
    console.log('Serving all symbols from cache');
    return res.json(cachedResponses);
  }
  else{
    symbolsToFetch.forEach(symbol => priceSymbolQueue.symbols.add(symbol));
    // Include cached responses with the handler in a key:value format
    priceSymbolQueue.handlers.push({ symbols: symbolList, res, cachedResponses });
  }

  // If the timer is not set, set it to process the queue after .25 seconds
  if (!priceSymbolQueue.timer) {
    priceSymbolQueue.timer = setTimeout(processSymbolQueue, 250);
  }
});



router.get('/symbolData', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) {
    return res.status(400).send('No symbols provided');
  }
  let dataSymbolListDups = symbols.split(',');

  // Remove any repeat values in the symbols list
  let symbolList = removeDuplicates(dataSymbolListDups);

  // Check cache for each symbol and only queue those not in cache
  let symbolsToFetch = [];
  let cachedResponses = [];
  for (const symbol of symbolList) {
    const symbolCacheKey = `symbolData:${symbol}`;
    const cachedData = await redisClient.get(symbolCacheKey);
    if (cachedData) {
      cachedResponses.push(JSON.parse(cachedData));
    } else {
      symbolsToFetch.push(symbol);
    }
  }
  if (Object.keys(cachedResponses).length === symbolList.length) {
    console.log('Serving all symbols from cache');
    return res.json(cachedResponses);
  }
  else{
    // Add the symbols and the response handler to the queue
    symbolsToFetch.forEach(symbol => dataSymbolQueue.symbols.add(symbol));
    // Include cached responses with the handler
    dataSymbolQueue.handlers.push({ symbols: symbolList, res, cachedResponses });
  }  

  // If the timer is not set, set it to process the queue after .52 seconds
  if (!dataSymbolQueue.timer) {
    dataSymbolQueue.timer = setTimeout(processSymbolDataQueue, 250);
  }
});

router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

function removeDuplicates(strings) {
  return [...new Set(strings)];
}

// Function to refresh popular coins cache
function refreshPopularCoinsCache() {
  axios.get('https://api.coingecko.com/api/v3/coins/markets', {
    params: {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 100,
      page: 1
    }
  })
  .then(response => {
    const topCoins = response.data.map(coin => coin.id);
    const symbols = topCoins.join(',');
    http.get(`/prices?symbols=${encodeURIComponent(symbols)}`)
      .then(response => console.log('Cache refreshed for popular coins.'))
      .catch(error => console.error('Error refreshing cache for popular coins:', error));
  })
  .catch(error => console.error('Error fetching top coins:', error));
  const symbols = topCoins.join(',');
  http.get(`/prices?symbols=${encodeURIComponent(symbols)}`)
    .then(response => console.log('Cache refreshed for popular coins.'))
    .catch(error => console.error('Error refreshing cache for popular coins:', error));
}

let inactivityTimer = null;

function resetInactivityTimer() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  inactivityTimer = setTimeout(() => {
    refreshPopularCoinsCache();
  }, 300000); // 5 minutes
}

// Reset inactivity timer on every API call except /health
router.use((req, res, next) => {
  if (req.path !== '/health') {
    resetInactivityTimer();
  }
  next();
});

module.exports = router;
