const express = require('express');
const axios = require('axios');
const redis = require('redis');
const fs = require('fs');
// const SymbolSchema = require('../../resources/schemas/SymbolSchema');
const { getDatabase } = require('firebase-admin/database');
var admin = require("firebase-admin");
var serviceAccount = require("../../resources/firebase/firebase-admin.json");
let REFRESH_TIMER_MINUTES = 30;
let CHART_DATA_REFRESH_TIMER_MINUTES = 60;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://parallax-analytics-server-default-rtdb.firebaseio.com"
});
// LOG
const logIdentifier = `logs/log_${new Date().toISOString().split('T')[0]}.txt`;

// Variable to track the number of API calls
let apiCallCount = 0;

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

class PriceDataSchema{
  constructor(symbolData){
    this.usd = symbolData.current_price,
    this.last_updated_at = new Date(symbolData.last_updated).getTime() / 1000 
  }
}

const db = getDatabase();
const firebaseCryptoSymbolsRef = db.ref('crypto/symbols');
const firebaseCryptoSymbolChartDataRef = db.ref('crypto/symbolsChartData');
const firebaseCryptoKujiraTransactions = db.ref('crypto/kujiraTransactions');

const router = express.Router();
const redisClient = redis.createClient({
  // url: `${process.env.REDIS_URL}` 
  url: "redis://:8R3rayhaJe66wIYQRKaY7UnsnlWBDvi4@redis-15972.c274.us-east-1-3.ec2.cloud.redislabs.com:15972"
});
redisClient.connect();

router.get('/kujiraGhostBalance', async (req, res) => {
  const { address, forceRefresh } = req.query;
  if (!address) {
    console.log(`${new Date().toISOString()} No kujira address provided in request`);
    return res.status(400).send('No kujira address provided');
  }
  let offset = 0;
  let allData = [];
  console.log(`${new Date().toISOString()} Fetching kujira transactions for address: ${address}`);
  
  firebaseCryptoKujiraTransactions.child(`${address}/ghost`).once('value', snapshot => {
    const cachedData = snapshot.val();
    const oneHour = (60 * 60 * 1000);
    if (forceRefresh === "false" && snapshot.exists() && (Date.now() - cachedData.last_updated) < oneHour) {
        console.log(`${new Date().toISOString()} Cached kujira transactions found for address: ${address}`);
        calculateGhostPnL(Object.values(cachedData)).then(data => res.json(data))
         
    } else {
      const fetchAllData = async (address, offset) => {
        try {
          const response = await getKujiraAddressData(address, offset);
          if (response.data && response.data.txs.length > 0) {
            allData = allData.concat(response.data.txs);
            console.log(`Completed querying ${offset+100} transactions...`)
            return fetchAllData(address, offset + 100);
          } else {
            return allData;
          }
        } catch (error) {
          throw error;
        }
      };
      
      fetchAllData(address, offset)
        .then(data => {
          console.log(`${new Date().toISOString()} Successfully fetched all kujira transactions`);
          return filterKujiraGhost({ txs: data });
        })
        .then(processedData => {
          console.log(`${new Date().toISOString()} Successfully processed Kujira data`);
          const timestampedData = {
            ...processedData,
            last_updated: Date.now()
          };
          firebaseCryptoKujiraTransactions.child(`${address}/ghost`).set(timestampedData);
          calculateGhostPnL(processedData).then(data => res.json(data))
        })
        .catch(error => {
          console.error(`${new Date().toISOString()} Error: ${error}`);
          res.status(500).send('Internal Server Error');
        });
    }
  });
});

router.get('/kujiraWalletAssets', async (req, res) => {
  const { address, forceRefresh } = req.query;
  if (!address) {
    console.log(`${new Date().toISOString()} No kujira address provided in request`);
    return res.status(400).send('No kujira address provided');
  }
  let offset = 0;
  let allData = [];
  console.log(`${new Date().toISOString()} Fetching kujira transactions for address: ${address}`);
  
  firebaseCryptoKujiraTransactions.child(`${address}/assets`).once('value', snapshot => {
    const cachedData = snapshot.val();
    const oneHour = (60 * 60 * 1000);
    if (forceRefresh === "false" && snapshot.exists() && (Date.now() - cachedData.last_updated) < oneHour) {
        console.log(`${new Date().toISOString()} Cached kujira transactions found for address: ${address}`);
        calculateGhostPnL(Object.values(cachedData)).then(data => res.json(data))
         
    } else {
      const fetchAllData = async (address, offset) => {
        try {
          const response = await getKujiraAddressData(address, offset);
          if (response.data && response.data.txs.length > 0) {
            allData = allData.concat(response.data.txs);
            console.log(`Completed querying ${offset+100} transactions...`)
            return fetchAllData(address, offset + 100);
          } else {
            return allData;
          }
        } catch (error) {
          throw error;
        }
      };
      
      fetchAllData(address, offset)
        .then(data => {
          console.log(`${new Date().toISOString()} Successfully fetched all kujira transactions`);
          return filterKujiraSendRecieveAssets({ txs: data, address: address });
        })
        .then(processedData => {
          console.log(`${new Date().toISOString()} Successfully processed Kujira data`);
          const timestampedData = {
            ...processedData,
            last_updated: Date.now()
          };
          firebaseCryptoKujiraTransactions.child(`${address}/assets`).set(timestampedData);
          calculateKujiraAssets(processedData, address).then(data => res.json(data))
        })
        .catch(error => {
          console.error(`${new Date().toISOString()} Error: ${error}`);
          res.status(500).send('Internal Server Error');
        });
    }
  });
});

router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

async function calculateGhostPnL(allGhostTxns){
  let ghostWithdraws = [];
  let ghostDeposits = [];
  if(allGhostTxns.length > 0){
    allGhostTxns.forEach(txn => {
      if(txn.type === 'wasm-ghost/deposit'){
        ghostDeposits.push(txn)
      } else if(txn.type === 'wasm-ghost/withdraw'){
        ghostWithdraws.push(txn)
      }
    });
  }
  console.log(`ghostDeposits: ${ghostDeposits}`)
  console.log(`ghostWithdraws: ${ghostWithdraws}`)

  // get net deposited
  let depositAssets = {};
  let withdrawAssets = {};
  let calculatedGhostAssetValues = {};

  ghostDeposits.forEach(deposit => {
    const denom = deposit.denom;
    if (!depositAssets[denom]) {
      depositAssets[denom] = uAssetToAsset(deposit.amount);
    }
    depositAssets[denom] += uAssetToAsset(deposit.amount);
  });

  ghostWithdraws.forEach(withdraw => {
    const denom = withdraw.denom;
    if (!withdrawAssets[denom]) {
      withdrawAssets[denom] = uAssetToAsset(withdraw.amount);
    }
    withdrawAssets[denom] += uAssetToAsset(withdraw.amount);
  });

  let allDenoms = new Set([...Object.keys(depositAssets), ...Object.keys(withdrawAssets)]);

  allDenoms.forEach(denom => {
    const netValue = depositAssets[denom] - (withdrawAssets[denom] || 0);
    if(netValue > 0){
      calculatedGhostAssetValues[denom] = netValue;
    }
  })
  console.log(depositAssets)
  console.log(withdrawAssets)
  return calculatedGhostAssetValues;
}

async function calculateKujiraAssets(allKujiraTransferTransactions, address){
  let coinsSpent = [];
  let coinsRecieved = [];
  let coinsTransfered = [];
  const keysToCheck = ['sender', 'spender', 'reciever', 'recipient'];

  if(allKujiraTransferTransactions.length > 0){

    allKujiraTransferTransactions.forEach(txn => {
      if(txn.type === 'coin_spent'){
        console.log("keysToCheck.includes(txn.key): " + keysToCheck.includes(txn.key))
        console.log("txn.value === address: " + txn.value === address)
        if(keysToCheck.includes(txn.key) && txn.value === address){
          coinsSpent.push(txn)
        }
      } else if(txn.type === 'coin_received'){
        coinsRecieved.push(txn)
      }
    });
  }
  // console.log(coinsSpent)
  // console.log(coinsRecieved)
  // console.log(coinsTransfered)


  // // get net deposited
  // let depositAssets = {};
  // let withdrawAssets = {};
  // let calculatedGhostAssetValues = {};

  // ghostDeposits.forEach(deposit => {
  //   const denom = deposit.denom;
  //   if (!depositAssets[denom]) {
  //     depositAssets[denom] = uAssetToAsset(deposit.amount);
  //   }
  //   depositAssets[denom] += uAssetToAsset(deposit.amount);
  // });

  // ghostWithdraws.forEach(withdraw => {
  //   const denom = withdraw.denom;
  //   if (!withdrawAssets[denom]) {
  //     withdrawAssets[denom] = uAssetToAsset(withdraw.amount);
  //   }
  //   withdrawAssets[denom] += uAssetToAsset(withdraw.amount);
  // });

  // let allDenoms = new Set([...Object.keys(depositAssets), ...Object.keys(withdrawAssets)]);

  // allDenoms.forEach(denom => {
  //   const netValue = depositAssets[denom] - (withdrawAssets[denom] || 0);
  //   if(netValue > 0){
  //     calculatedGhostAssetValues[denom] = netValue;
  //   }
  // })
  // console.log(depositAssets)
  // console.log(withdrawAssets)
  // return calculatedGhostAssetValues;
}

async function getKujiraAddressData(address, offset){
  return axios.get('https://api.kujira.app/api/txs', {
    params: {
      q: address,
      limit: 100,
      offset: offset,
      order_by: 'rowid',
      order_dir: 'desc'
    }
  });
}

function uAssetToAsset(uAsset){
  return parseInt(uAsset)/1000000;
}

async function filterKujiraGhost(kujiraData){
  const kujiTxs = kujiraData.txs;
  const transactions = kujiTxs.map(tx => {
    const events = tx.events.filter(event => 
      event.type === 'wasm-ghost/deposit' || 
      event.type === 'wasm-ghost/withdraw' || 
      event.type === 'tx'
    );
    return events.flatMap(event => 
      event.attributes.filter(attr => 
        attr.key === 'denom' || 
        attr.key === 'amount' || 
        attr.key === 'height'
      ).map(attr => ({
        ...attr,
        type: event.type
      }))
    );
  });
  const filteredAttributes = transactions.filter(attributes => attributes.length > 1);
  
  // Transform the filtered attributes into a more structured format
  const structuredData = filteredAttributes.map(attributes => {
    const data = {};
    attributes.forEach(attr => {
      data[attr.key] = attr.value;
      if (attr.type) {
        data['type'] = attr.type;
      }
    });
    return data;
  });
  return structuredData;
}

async function filterKujiraSendRecieveAssets(kujiraData, address){
  const kujiTxs = kujiraData.txs;
  const transactions = kujiTxs.map(tx => {
    const events = tx.events.filter(event => 
      event.type === 'coin_received' || 
      event.type === 'coin_spent' || 
      event.type === 'transfer'
    );
    return events.flatMap(event => 
      event.attributes.filter(attr => 
        attr.key === 'sender' || 
        attr.key === 'spender' ||
        attr.key === 'reciever' ||
        attr.key === 'recipient' ||
        attr.key === 'amount'
      ).map(attr => ({
        ...attr,
        type: event.type
      }))
    );
  });
  console.log(transactions);
  const filteredAttributes = transactions.filter(attributes => attributes.length > 1);
  
  // Transform the filtered attributes into a more structured format
  const structuredData = filteredAttributes.map(attributes => {
    const data = {};
    attributes.forEach(attr => {
      data[attr.key] = attr.value;
      if (attr.type) {
        data['type'] = attr.type;
      }
    });
    return data;
  });
  return structuredData;
}

module.exports = router;
