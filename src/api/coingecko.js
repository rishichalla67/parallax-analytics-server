const express = require('express');
const axios = require('axios');
const redis = require('redis');
const rateLimit = require('axios-rate-limit');

const router = express.Router();
const redisClient = redis.createClient({
  url: process.env.REDIS_URL 
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
function processSymbolQueue() {
  const symbolsToFetch = Array.from(priceSymbolQueue.symbols).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(symbolsToFetch)}&vs_currencies=usd&include_last_updated_at=true`;

  axios.get(url).then(response => {
    const data = response.data;
    // Call each handler with the corresponding data
    priceSymbolQueue.handlers.forEach(handler => {
      const symbolData = {};
      handler.symbols.forEach(symbol => {
        symbolData[symbol] = data[symbol] || null;
      });
      handler.res.json(symbolData);
    });
  }).catch(error => {
    // Handle errors by sending an error response to all handlers
    priceSymbolQueue.handlers.forEach(handler => {
      handler.res.status(500).send('Error fetching prices');
    });
  }).finally(() => {
    // Reset the queue and timer
    priceSymbolQueue.symbols.clear();
    priceSymbolQueue.handlers = [];
    priceSymbolQueue.timer = null;
  });
}

// Function to process the queued symbol data requests
async function processSymbolDataQueue() {
  const symbolsToFetch = Array.from(dataSymbolQueue.symbols).join(',');
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(symbolsToFetch)}&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d%2C14d%2C30d%2C200d%2C1y`;

  try {
    const response = await http.get(url);

    // Store the response in cache
    const cacheKey = `symbolData:${symbolsToFetch}`;
    await redisClient.setEx(cacheKey, 160, JSON.stringify(response.data));

    // Distribute the data to the appropriate handlers
    dataSymbolQueue.handlers.forEach(handler => {
      const relevantData = response.data.filter(item => handler.symbols.includes(item.id));
      handler.res.json(relevantData);
    });
  } catch (error) {
    console.error('Error fetching symbol data:', error);
    // Send an error response to all handlers
    dataSymbolQueue.handlers.forEach(handler => {
      handler.res.status(500).send('Error fetching symbol data');
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

  // Remove any repeat values in the symbols list
  let symbolList = removeDuplicates(symbolListDups);
  const cacheKey = `priceData:${symbolList.join(',')}`;
  const cachedData = await redisClient.get(cacheKey);
  if (cachedData) {
    console.log('Serving from cache');
    return res.json(JSON.parse(cachedData));
  }
  else{
    // Split the symbols and add them to the queue
    symbolList.forEach(symbol => priceSymbolQueue.symbols.add(symbol));
    // Add the response handler to the queue
    priceSymbolQueue.handlers.push({ symbols: symbolList, res });
  }

  // If the timer is not set, set it to process the queue after 2.5 seconds
  if (!priceSymbolQueue.timer) {
    priceSymbolQueue.timer = setTimeout(processSymbolQueue, 2500);
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

  // Check cache first before adding to the queue
  const cacheKey = `symbolData:${symbolList.join(',')}`;
  const cachedData = await redisClient.get(cacheKey);
  if (cachedData) {
    console.log('Serving from cache');
    return res.json(JSON.parse(cachedData));
  }
  else{
    // Add the symbols and the response handler to the queue
    symbolList.forEach(symbol => dataSymbolQueue.symbols.add(symbol));
    dataSymbolQueue.handlers.push({ symbols: symbolList, res });
  }  

  // If the timer is not set, set it to process the queue after 2.5 seconds
  if (!dataSymbolQueue.timer) {
    dataSymbolQueue.timer = setTimeout(processSymbolDataQueue, 2500);
  }
});

router.get('/chartData', async (req, res) => {
  try {
    const { symbol } = req.query;
    if (!symbol) {
      return res.status(400).send('No symbol provided');
    }
    const cacheKey = `chartData:${symbol}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log('Serving from cache');
      return res.json(JSON.parse(cachedData));
    }

    const url = `https://api.coingecko.com/api/v3/coins/${symbol}/market_chart?vs_currency=usd&days=max`;
    const response = await http.get(url);

    if (response.status === 429) {
      return res.status(429).send('Too many requests, please try again later.');
    }

    await redisClient.setEx(cacheKey, 160, JSON.stringify(response.data)); // Cache for 2.5 minutes
    res.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response && error.response.status === 429) {
      return res.status(429).send('Too many requests, please try again later.');
    }
    console.error('Error fetching chart data:', error);
    res.status(500).send('Error fetching chart data');
  }
});

router.get('/search', async (req, res) => {
  try {
    const { symbol } = req.query;
    if (!symbol) {
      return res.status(400).send('No symbol provided');
    }
    const cacheKey = `search:${symbol}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log('Serving from cache');
      return res.json(JSON.parse(cachedData));
    }

    const url = `https://api.coingecko.com/api/v3/search?query=${symbol}`;
    const response = await http.get(url);

    if (response.status === 429) {
      return res.status(429).send('Too many requests, please try again later.');
    }

    await redisClient.setEx(cacheKey, 160, JSON.stringify(response.data)); // Cache for 2.5 minutes
    res.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response && error.response.status === 429) {
      return res.status(429).send('Too many requests, please try again later.');
    }
    console.error('Error fetching search results:', error);
    res.status(500).send('Error fetching search results');
  }
});

router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

/**
 * Removes duplicate values from an array.
 * @param {Array} array - The array to remove duplicates from.
 * @returns {Array} A new array with only unique values.
 */
function removeDuplicates(strings) {
  return [...new Set(strings)];
}

module.exports = router;
