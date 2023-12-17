const express = require('express');
const axios = require('axios');
const redis = require('redis');

const router = express.Router();
const redisClient = redis.createClient({
  url: process.env.REDIS_URL 
});
redisClient.connect();

let rateLimitTimer = null;

const setRateLimitTimer = () => {
  if (!rateLimitTimer) {
    rateLimitTimer = setTimeout(() => {
      rateLimitTimer = null;
    }, 60000); // Set timer for 1 minute
  }
};

const getSecondsUntilRateLimitEnds = () => {
  if (rateLimitTimer) {
    const timeLeft = Math.ceil((rateLimitTimer._idleStart + rateLimitTimer._idleTimeout - process.uptime() * 1000) / 1000);
    return timeLeft > 0 ? timeLeft : 0;
  }
  return 0;
};

const handleRateLimit = (res) => {
  const timeLeft = getSecondsUntilRateLimitEnds();
  res.status(429).send(`Sorry, too many requests at this time, please wait ${timeLeft} more seconds and refresh`);
};

router.get('/prices', async (req, res) => {
  try {
    const { symbols } = req.query;
    if (!symbols) {
      return res.status(400).send('No symbols provided');
    }
    const symbolList = symbols.split(',').join('%2C');
    const cacheKey = `prices:${symbolList}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log('Serving from cache');
      return res.json(JSON.parse(cachedData));
    }

    if (rateLimitTimer) return handleRateLimit(res);

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${symbolList}&vs_currencies=usd&include_last_updated_at=true`;
    const response = await axios.get(url);

    if (response.status === 429) {
      setRateLimitTimer();
      return handleRateLimit(res);
    }

    await redisClient.setEx(cacheKey, 160, JSON.stringify(response.data)); // Cache for 2.5 minutes
    res.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response && error.response.status === 429) {
      setRateLimitTimer();
      return handleRateLimit(res);
    }
    console.error('Error fetching prices:', error);
    res.status(500).send('Error fetching prices');
  }
});

router.get('/symbolData', async (req, res) => {
  try {
    const { symbols } = req.query;
    if (!symbols) {
      return res.status(400).send('No symbols provided');
    }
    const symbolList = symbols.split(',').join('%2C');
    const cacheKey = `symbolData:${symbolList}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log('Serving from cache');
      return res.json(JSON.parse(cachedData));
    }

    if (rateLimitTimer) return handleRateLimit(res);

    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${symbolList}&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d%2C14d%2C30d%2C200d%2C1y`;
    const response = await axios.get(url);

    if (response.status === 429) {
      setRateLimitTimer();
      return handleRateLimit(res);
    }

    await redisClient.setEx(cacheKey, 160, JSON.stringify(response.data)); // Cache for 2.5 minutes
    res.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response && error.response.status === 429) {
      setRateLimitTimer();
      return handleRateLimit(res);
    }
    console.error('Error fetching symbol data:', error);
    res.status(500).send('Error fetching symbol data');
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

    if (rateLimitTimer) return handleRateLimit(res);

    const url = `https://api.coingecko.com/api/v3/coins/${symbol}/market_chart?vs_currency=usd&days=max`;
    const response = await axios.get(url);

    if (response.status === 429) {
      setRateLimitTimer();
      return handleRateLimit(res);
    }

    await redisClient.setEx(cacheKey, 160, JSON.stringify(response.data)); // Cache for 2.5 minutes
    res.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response && error.response.status === 429) {
      setRateLimitTimer();
      return handleRateLimit(res);
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

    if (rateLimitTimer) return handleRateLimit(res);

    const url = `https://api.coingecko.com/api/v3/search?query=${symbol}`;
    const response = await axios.get(url);

    if (response.status === 429) {
      setRateLimitTimer();
      return handleRateLimit(res);
    }

    await redisClient.setEx(cacheKey, 160, JSON.stringify(response.data)); // Cache for 2.5 minutes
    res.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response && error.response.status === 429) {
      setRateLimitTimer();
      return handleRateLimit(res);
    }
    console.error('Error fetching search results:', error);
    res.status(500).send('Error fetching search results');
  }
});

router.get('/health', (req, res) => {
  res.status(200).send('OK');
});


module.exports = router;
