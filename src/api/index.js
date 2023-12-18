const express = require('express');

const coingecko = require('./coingecko');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    message: 'API - 👋🌎🌍🌏',
  });
});

router.use('/', coingecko);

module.exports = router;
