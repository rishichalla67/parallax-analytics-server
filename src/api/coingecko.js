const express = require('express');
const axios = require('axios');
const redis = require('redis');

const router = express.Router();
const redisClient = redis.createClient();
redisClient.connect();

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

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${symbolList}&vs_currencies=usd&include_last_updated_at=true`;
    const response = await axios.get(url);
    await redisClient.setEx(cacheKey, 160, JSON.stringify(response.data)); // Cache for 2.5 minutes
    res.json(response.data);
  } catch (error) {
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
    const cacheKey = `prices:${symbolList}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log('Serving from cache');
      return res.json(JSON.parse(cachedData));
    }

    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${symbolList}&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d%2C14d%2C30d%2C200d%2C1y`;
    const response = await axios.get(url);
    await redisClient.setEx(cacheKey, 160, JSON.stringify(response.data)); // Cache for 2.5 minutes
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching prices:', error);
    res.status(500).send('Error fetching prices');
  }
});

router.get('/chartData', async (req, res) => {
  try {
    const { symbol } = req.query;
    if (!symbol) {
      return res.status(400).send('No symbols provided');
    }
    const cacheKey = `prices:${symbol}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log('Serving from cache');
      return res.json(JSON.parse(cachedData));
    }

    const url = `https://api.coingecko.com/api/v3/coins/${symbol}/market_chart?vs_currency=usd&days=max`;
    const response = await axios.get(url);
    await redisClient.setEx(cacheKey, 160, JSON.stringify(response.data)); // Cache for 2.5 minutes
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching prices:', error);
    res.status(500).send('Error fetching prices');
  }
});

router.get('/search', async (req, res) => {
  try {
    const { symbol } = req.query;
    if (!symbol) {
      return res.status(400).send('No symbols provided');
    }
    const cacheKey = `prices:${symbol}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log('Serving from cache');
      return res.json(JSON.parse(cachedData));
    }

    const url = `https://api.coingecko.com/api/v3/search?query=${symbol}`;
    const response = await axios.get(url);
    await redisClient.setEx(cacheKey, 160, JSON.stringify(response.data)); // Cache for 2.5 minutes
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching prices:', error);
    res.status(500).send('Error fetching prices');
  }
});

module.exports = router;
