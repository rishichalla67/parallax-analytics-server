const express = require('express');
const axios = require('axios');
const redis = require('redis');
const fs = require('fs');
// const SymbolSchema = require('../../resources/schemas/SymbolSchema');
const { getDatabase } = require('firebase-admin/database');
var admin = require("firebase-admin");
var serviceAccount = require("../../resources/firebase/firebase-admin.json");
let REFRESH_TIMER_MINUTES = 10;
let CHART_DATA_REFRESH_TIMER_MINUTES = 60;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://parallax-analytics-server-default-rtdb.firebaseio.com"
});
// LOG
const logIdentifier = `logs/log_${new Date().toISOString().split('T')[0]}.txt`;

class SymbolSchema {
  constructor(symbolData) {
      this.id = symbolData.id; // "bitcoin"
      this.symbol = symbolData.symbol; // "btc"
      this.name = symbolData.name; // "Bitcoin"
      this.image = symbolData.image; // "https://assets.coingecko.com/coins/images/1/large/bitcoin.png?1696501400"
      this.current_price = symbolData.current_price; // 43630
      this.market_cap = symbolData.market_cap; // 854012244623
      this.market_cap_rank = symbolData.market_cap_rank; // 1
      this.fully_diluted_valuation = symbolData.fully_diluted_valuation; // 916139924604
      this.total_volume = symbolData.total_volume; // 28415939279
      this.high_24h = symbolData.high_24h; // 44201
      this.low_24h = symbolData.low_24h; // 42238
      this.price_change_24h = symbolData.price_change_24h; // 1326.15
      this.price_change_percentage_24h = symbolData.price_change_percentage_24h; // 3.1348
      this.market_cap_change_24h = symbolData.market_cap_change_24h; // 25936223830
      this.market_cap_change_percentage_24h = symbolData.market_cap_change_percentage_24h; // 3.13211
      this.circulating_supply = symbolData.circulating_supply;
      this.total_supply = symbolData.total_supply;
      this.max_supply = symbolData.max_supply;
      this.price_change_percentage_14d_in_currency = symbolData.price_change_percentage_14d_in_currency;
      this.price_change_percentage_1h_in_currency = symbolData.price_change_percentage_1h_in_currency;
      this.price_change_percentage_1y_in_currency = symbolData.price_change_percentage_1y_in_currency;
      this.price_change_percentage_200d_in_currency = symbolData.price_change_percentage_200d_in_currency;
      this.price_change_percentage_24h_in_currency = symbolData.price_change_percentage_24h_in_currency;
      this.price_change_percentage_30d_in_currency = symbolData.price_change_percentage_30d_in_currency;
      this.price_change_percentage_7d_in_currency = symbolData.price_change_percentage_7d_in_currency;
  }
}

const db = getDatabase();
const firebaseCryptoSymbolsRef = db.ref('crypto/symbols');
const firebaseCryptoSymbolChartDataRef = db.ref('crypto/symbolsChartData');

const router = express.Router();
const redisClient = redis.createClient({
  // url: `${process.env.REDIS_URL}` 
  url: "redis://:8R3rayhaJe66wIYQRKaY7UnsnlWBDvi4@redis-15972.c274.us-east-1-3.ec2.cloud.redislabs.com:15972"
});
redisClient.connect();

router.get('/symbols', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) {
    return res.status(400).send('No symbols provided');
  }
  // Split the symbols string into an array and remove duplicates
  let symbolList = removeDuplicates(symbols.split(','));

  try {
    let symbolsData = [];
    let timerSymbolsData = [];
    let symbolsToFetch = [];
    // Fetch each symbol's data from Firebase
    for (const symbol of symbolList) {
      const symbolSnapshot = await firebaseCryptoSymbolsRef.child(symbol).get();
      if (symbolSnapshot.exists()) {
        timerSymbolsData[symbol] = symbolSnapshot.val();
        symbolsData.push(symbolSnapshot.val());

        // Check if the last update was more than 5 minutes ago
        const currentTime = Date.now();
        const lastUpdated = new Date(timerSymbolsData[symbol]?.last_updated);
        const refreshTimer = REFRESH_TIMER_MINUTES * 60 * 1000; // minutes in milliseconds

        if (currentTime - lastUpdated >  refreshTimer) {
          console.log(`Expired symbol data, added to refresh list, ${symbol}`)
          symbolsToFetch.push(symbol);
        }
      } else {
        // If a symbol is not found, you can decide to omit it or return null
        symbolsToFetch.push(symbol);

      }
    }
    if(symbolsToFetch.length > 0){
      // Call POST /symbol with the symbol that was not found
      const serverHost = req.protocol + '://' + req.get('host');
      
      const logMessage = `GET /symbols request for missing symbols ${symbolsToFetch.join(",")}`;
      console.log(`${new Date().toISOString()} ${logMessage}`);
      axios.post(`${serverHost}/symbols?symbols=${symbolsToFetch.join(",")}`)
        .then(response => {
          console.log(logMessage, response.status);
          console.log(`${new Date().toISOString()} GET /symbols response status: ${response.status}`);
        });
    }

    res.json(symbolsData);
  } catch (error) {
    console.log(`${new Date().toISOString()} GET /symbols error: ${error}`);
    res.status(500).send(`Internal Server Error: ${error}`);
  }
});


router.post('/symbols', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) {
    return res.status(400).send('No symbols provided');
  }

  let symbolListDups = symbols.split(',');
  let symbolList = removeDuplicates(symbolListDups);

  try {
    const logMessage = `POST request to CoinGecko API for symbols: ${symbolList.join(",")}`;
    console.log(`${new Date().toISOString()} ${logMessage}`);
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${symbolList}&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d%2C14d%2C30d%2C200d%2C1y`);
    const symbolData = response.data;
    //Format Obj for Posting
    let dataToSave = []
    symbolList.map(symbol => {
      if(symbolData){
        symbolData.map(data => {
          if(symbol === data.id){
            firebaseCryptoSymbolsRef.child(symbol).set(data);
            let dataInSchema = new SymbolSchema(data);
            dataToSave.push({
              symbol: symbol,
              data: dataInSchema
            });
          }
        })
      }
    })
    // console.log(`${new Date().toISOString()} POST /symbols response data: ${JSON.stringify(dataToSave)}`);
    res.status(200).send(dataToSave);
  } catch (error) {
    console.log(`${new Date().toISOString()} POST /symbols error: ${error}`);
    res.status(500).send(`Internal Server Error: ${error}`);
  }
});

router.get('/symbols/chartData', async (req, res) => {
  const { symbol } = req.query;
  let queryCoingecko = false;
  if (!symbol) {
    return res.status(400).send('No symbol provided');
  }
  try {
    const symbolChartSnapshot = await firebaseCryptoSymbolChartDataRef.child(symbol).get();
    if (symbolChartSnapshot.exists()) {
      let dbResponse = symbolChartSnapshot.val();
      const currentTime = Date.now();
      const lastUpdated = dbResponse?.last_updated;
      const refreshTimer = CHART_DATA_REFRESH_TIMER_MINUTES * 60 * 1000; 
      if (currentTime - lastUpdated >  refreshTimer) {
        console.log(`Expired symbol data, added to refresh list, ${symbol}`)
        queryCoingecko = true;
      }
      else{
        // console.log(`${new Date().toISOString()} Data loaded from cache: ${JSON.stringify(symbolChartSnapshot.val())}`);
        res.status(200).send(symbolChartSnapshot.val())
      }
    }else{queryCoingecko = true;}

    if(queryCoingecko){
      const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${symbol}/market_chart?vs_currency=usd&days=1`); 
      const chartDataWithTimestamp = {
        ...response.data,
        last_updated: Date.now()
      };
      firebaseCryptoSymbolChartDataRef.child(symbol).set(chartDataWithTimestamp);
      // console.log(`${new Date().toISOString()} GET /symbol/chartData response data: ${JSON.stringify(chartDataWithTimestamp)}`);
      res.status(201).send(chartDataWithTimestamp);
    }
  }
  catch (error) {
    console.log(`${new Date().toISOString()} GET /symbols/chartData error: ${error}`);
    res.status(500).send(`Internal Server Error: ${error}`);
  }
});

router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

function removeDuplicates(strings) {
  return [...new Set(strings)];
}

module.exports = router;
