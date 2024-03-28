const express = require('express');
const axios = require('axios');
const redis = require('redis');
const fs = require('fs');
const { getDatabase } = require('firebase-admin/database');
var admin = require("firebase-admin");
var serviceAccount = require("../../resources/firebase/firebase-admin.json");
const EIGHTEEN = 1000000000000000000;
const EIGHT = 100000000;
const SIX = 1000000;
const WBTC = "ibc/301DAF9CB0A9E247CD478533EF0E21F48FF8118C4A51F77C8BC3EB70E5566DBC"; 
const tokenMap = {
  "ibc/301DAF9CB0A9E247CD478533EF0E21F48FF8118C4A51F77C8BC3EB70E5566DBC": { symbol: 'WBTC', decimals: EIGHT },
  "factory/kujira1qk00h5atutpsv900x202pxx42npjr9thg58dnqpa72f2p7m2luase444a7/uusk": { symbol: "USK", decimals: SIX },
  "ukuji": { symbol: "KUJI", decimals: SIX },
  "ibc/FE98AAD68F02F03565E9FA39A5E627946699B2B07115889ED812D8BA639576A9": { symbol: "USDC", decimals: SIX },
  "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2": { symbol: "ATOM", decimals: SIX },
  "ibc/1B38805B1C75352B28169284F96DF56BDEBD9E8FAC005BDCC8CF0378C82AA8E7": { symbol: "wETH", decimals: SIX },
  "ibc/E5CA126979E2FFB4C70C072F8094D07ECF27773B37623AD2BF7582AD0726F0F3": { symbol: "whSOL", decimals: SIX },
  "ibc/47BD209179859CDE4A2806763D7189B6E6FE13A17880FE2B42DE1E6C1E329E23" : { symbol: "OSMO", decimals: SIX },
  "ibc/4F393C3FCA4190C0A6756CE7F6D897D5D1BE57D6CCB80D0BC87393566A7B6602": { symbol: "STARS", decimals: SIX },
  "ibc/295548A78785A1007F232DE286149A6FF512F180AF5657780FC89C009E2C348F": { symbol: "axlUSDC", decimals: SIX },
  "ibc/DA59C009A0B3B95E0549E6BF7B075C8239285989FF457A8EDDBB56F10B2A6986": { symbol: "LUNA", decimals: SIX },
  "ibc/EFF323CC632EC4F747C61BCE238A758EFDB7699C3226565F7C20DA06509D59A5": { symbol: "JUNO", decimals: SIX },
  "ibc/5A3DCF59BC9EC5C0BB7AA0CA0279FC2BB126640CB8B8F704F7BC2DC42495041B": { symbol: "INJ", decimals: EIGHTEEN },
  'factory/kujira1643jxg8wasy5cfcn7xm8rd742yeazcksqlg4d7/umnta': {symbol: "MNTA", decimals: SIX}
  // Add more token mappings as needed
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://parallax-analytics-server-default-rtdb.firebaseio.com"
});

const db = getDatabase();
const firebaseCryptoKujiraTransactions = db.ref('crypto/kujiraTransactions');

const router = express.Router();
// const redisClient = redis.createClient({
//   // url: `${process.env.REDIS_URL}` 
//   url: "redis://:8R3rayhaJe66wIYQRKaY7UnsnlWBDvi4@redis-15972.c274.us-east-1-3.ec2.cloud.redislabs.com:15972"
// });
// redisClient.connect();

router.get('/kujiraGhostBalance', async (req, res) => {
  const { address } = req.query;
  if (!address) {
    console.log(`${new Date().toISOString()} No kujira address provided in request`);
    return res.status(400).send('No kujira address provided');
  }
  console.log(`${new Date().toISOString()} Fetching kujira transactions for address: ${address}`);
  
  firebaseCryptoKujiraTransactions.child(`${address}/ghost`).once('value', async snapshot => {
    const cachedData = snapshot.val();
    try {
      const latestData = await fetchLatestData(address);
      const latestTransaction = latestData[0];
      const latestHeight = latestTransaction ? parseInt(latestTransaction.height) : 0;
      console.log(`Latest transaction height: ${latestHeight}`);
      if (snapshot.exists() && latestHeight > cachedData[0].height) {
        console.log(`${new Date().toISOString()} New kujira transactions found for address: ${address}`);
        const updatedTransactions = appendNewTransactions(latestData, cachedData, cachedData[0].height);
        await updateFirebaseData(address, 'ghost', updatedTransactions);
        const data = await calculateGhostPnL(Object.values(updatedTransactions));
        res.json(data);
      } else if (snapshot.exists()) {
        console.log(`${new Date().toISOString()} No new kujira transactions found for address: ${address}`);
        const data = await calculateGhostPnL(Object.values(cachedData));
        res.json(data);
      } else {
        console.log(`${new Date().toISOString()} No cached data, fetching new transactions...`);
        const newData = await fetchAllData(address);
        const processedData = await filterKujiraGhost({ txs: newData });
        const timestampedData = {
          ...processedData,
          last_updated: Date.now()
        };
        await updateFirebaseData(address, 'ghost', timestampedData);
        const data = await calculateGhostPnL(processedData);
        res.json(data);
      }
    } catch (error) {
      console.error(`${new Date().toISOString()} Error: ${error}`);
      res.status(500).send('Internal Server Error');
    }
  });
});

async function fetchLatestData(address) {
  const response = await getKujiraAddressData(address, 0);
  return filterKujiraGhost(response.data);
}

async function updateFirebaseData(address, dataType, data) {
  await firebaseCryptoKujiraTransactions.child(`${address}/${dataType}`).set(data);
}

const fetchAllDataCache = {};

async function fetchAllData(address) {
  const cacheKey = address;
  const currentTime = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  if (fetchAllDataCache[cacheKey] && (currentTime - fetchAllDataCache[cacheKey].timestamp) < fiveMinutes) {
    console.log(`Using cached data for address: ${address}`);
    return fetchAllDataCache[cacheKey].data;
  }
  
  let offset = 0;
  let allData = [];
  while (true) {
    const response = await getKujiraAddressData(address, offset);
    if (response.data && response.data.txs.length > 0) {
      allData = allData.concat(response.data.txs);
      console.log(`Completed querying ${offset + 100} transactions...`);
      offset += 100;
    } else {
      break;
    }
  }
  
  fetchAllDataCache[cacheKey] = {
    timestamp: currentTime,
    data: allData
  };
  
  return allData;
}

function appendNewTransactions(newData, cachedData, latestBlockHeight) {
  const cachedDataArray = Object.values(cachedData);
  const newTransactions = newData.filter(transaction => transaction.height > latestBlockHeight);
  return newTransactions.concat(cachedDataArray);
}


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
  // get net deposited
  let depositAssets = {};
  let withdrawAssets = {};
  let calculatedGhostAssetValues = {};

  ghostDeposits.forEach(deposit => {
    const denom = deposit.denom;
    if (!depositAssets[denom]) {
      depositAssets[denom] = uAssetToAsset(denom, deposit.amount);
    }
    else{
      depositAssets[denom] += uAssetToAsset(denom, deposit.amount);
    }
  });

  ghostWithdraws.forEach(withdraw => {
    const denom = withdraw.denom;
    if (!withdrawAssets[denom]) {
      withdrawAssets[denom] = uAssetToAsset(denom,withdraw.amount);
    }
    else{
      withdrawAssets[denom] += uAssetToAsset(denom,withdraw.amount);
    }
  });

  let allDenoms = new Set([...Object.keys(depositAssets), ...Object.keys(withdrawAssets)]);

  allDenoms.forEach(denom => {
    const netValue = depositAssets[denom] - (withdrawAssets[denom] || 0);
    if(netValue > 0){
      calculatedGhostAssetValues[filterToken(denom)] = netValue;
    }
  })
  // console.log(depositAssets)
  // console.log(withdrawAssets)
  return calculatedGhostAssetValues;
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

function filterToken(denom) {
  const tokenInfo = tokenMap[denom];
  return tokenInfo ? tokenInfo.symbol : denom;
}

function uAssetToAsset(denom, amount){
  const tokenInfo = tokenMap[denom];
  if (tokenInfo && tokenInfo.decimals) {
    return parseFloat(amount) / tokenInfo.decimals;
  }
  return parseFloat(amount); // Fallback if denom is not found in tokenMap
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

// router.get('/fetchGhostPrices', async (req, res) => {
//   const { contract } = req.query;
//   if (!contract) {
//     return res.status(400).send('Contract parameter is required');
//   }

//   try {
//     let pricesObj = {};
//     const response = await axios.get(`https://api.kujira.app/api/trades?contract=${contract}`);
//     const data = response.data;
//     if (data.trades && data.trades.length > 0) {
//       pricesObj["price"] = data.trades[0].trade_price;
//     }
//     console.log(pricesObj);
//     return res.json(pricesObj);
//   } catch (error) {
//     console.error(`Error fetching ghost prices for contract: ${contract} - ${error}`);
//     return res.status(500).send('Internal Server Error');
//   }
// });

router.get('/fetchGhostPrices', async (req, res) => {
  const { contracts } = req.query;
  if (!contracts) {
    return res.status(400).send('Contracts parameter is required');
  }

  try {
    let pricesObj = {};
    const contractsArray = contracts.split(','); // Assuming contracts are comma-separated
    for (const contract of contractsArray) {
      const response = await axios.get(`https://api.kujira.app/api/trades?contract=${contract.trim()}`);
      const data = response.data;
      if (data.trades && data.trades.length > 0) {
        pricesObj[contract] = data.trades[0].trade_price;
      } else {
        pricesObj[contract] = "No trade data available";
      }
    }
    return res.json(pricesObj);
  } catch (error) {
    console.error(`Error fetching ghost prices for contracts - ${error}`);
    return res.status(500).send('Internal Server Error');
  }
});


router.get('/findProfitablePaths', async (req, res) => {
  const { asset } = req.query;

  if (!asset) {
    return res.status(400).send('The asset parameter is required');
  }

  try {
    console.log(`${new Date().toISOString()} Fetching tickers for asset: ${asset}`);
    const response = await axios.get('https://api.kujira.app/api/coingecko/tickers');
    const tickers = response.data.tickers;
    console.log(`${new Date().toISOString()} Tickers fetched: ${tickers.length}`);

    // Create a graph of all possible trade paths
    const graph = tickers.reduce((acc, ticker) => {
      const { base_currency, target_currency, ask, bid, base_volume, last_price } = ticker;
      if (!acc[base_currency]) acc[base_currency] = {};
      acc[base_currency][target_currency] = { ask: parseFloat(ask), bid: parseFloat(bid), base_volume: parseFloat(base_volume), last_price: parseFloat(last_price) };
      return acc;
    }, {});

    // Find all paths that start and end with the given asset
    // Filter out subPaths with base_volume less than 1 before finding profitable paths
    const filteredGraph = Object.fromEntries(
      Object.entries(graph).map(([currency, subPaths]) => {
        const filteredSubPaths = Object.fromEntries(
          Object.entries(subPaths).filter(([_, data]) => data.base_volume*data.last_price >= 10000)
        );
        return filteredSubPaths && Object.keys(filteredSubPaths).length > 0
          ? [currency, filteredSubPaths]
          : null;
      }).filter(entry => entry !== null)
    );
    const profitablePaths = findProfitablePaths(filteredGraph, asset);
    console.log(`${new Date().toISOString()} Profitable paths found: ${profitablePaths.length}`);

    // Filter out paths that do not yield a profit greater than 0.05% and have a base_volume less than 1
    const profitablePathsOverOnePercent = profitablePaths.filter(path => path.profit > 0.05);
    console.log(`${new Date().toISOString()} Profitable paths over 0.05 percent: ${profitablePathsOverOnePercent.length}`);

    return res.json(profitablePathsOverOnePercent);
  } catch (error) {
    console.error(`${new Date().toISOString()} Error fetching tickers: ${error}`);
    return res.status(500).send('Internal Server Error');
  }
});

function getDirectionalPaths(graph){
  const newGraph = Object.fromEntries(
    Object.entries(graph).flatMap(([base, targets]) =>
      Object.entries(targets).flatMap(([target, data]) => {
        const { bid, ask, last_price } = data;
        const baseTargetKey = `${base}_${target}`;
        const targetBaseKey = `${target}_${base}`;
        return [
          [
            baseTargetKey,
            {
              bid,
              last_price,
              diff: last_price - bid
            }
          ],
          [
            targetBaseKey,
            {
              ask,
              last_price,
              diff: last_price - ask
            }
          ]
        ];
      })
    )
  );
return newGraph;
}


function filterPathsByStartAsset(pathsArray, startAsset) {
  console.log(pathsArray)
  const filteredPaths = pathsArray.filter(path => {
    const [prefix] = path.split('_');
    return prefix === startAsset;
  });
  console.log(filteredPaths)
  return filteredPaths;
}




function findProfitablePaths(graph, startAsset) {
  let profitablePaths = [];
  const allPaths = getDirectionalPaths(graph);
  console.log(allPaths)
  const filteredPathKeys = filterPathsByStartAsset(Object.keys(allPaths), startAsset);
  console.log(`Starting to find profitable paths for asset: ${startAsset}`);
  console.log(filteredPathKeys)

  const matchingPaths = filteredPathKeys.reduce((acc, key) => {
    if (allPaths[key].diff > 0) {
      acc[key] = allPaths[key].diff;
    }
    return acc;
  }, {});
  console.log(matchingPaths);
  
  // for (let currentAsset in graph) {
  //   for (let nextAsset in graph[currentAsset]) {

  //     console.log(`Trade data from ${currentAsset} to ${nextAsset}:`, graph[currentAsset][nextAsset]);
  //   }
  // }
  
  // Recursive function to traverse the graph and find all paths
  // function traverse(currentAsset, visited, rate, path, lastPrice) {
  //   console.log(`Traversing from asset: ${currentAsset}`);
  //   visited.add(currentAsset);
  //   path.push(currentAsset);

    
  //   // Base case: if the path has returned to the startAsset and is profitable
  //   if (currentAsset === startAsset && path.length > 1 ) {
  //     console.log(`Found profitable path: ${path.join(' -> ')} with profit: ${((rate - 1) * 100).toFixed(2)}%`);
  //     profitablePaths.push({ path: [...path], profit: ((rate - 1) * 100).toFixed(2) });
  //     return;
  //   }

  //   // Recursive case: visit each connected asset
  //   for (let nextAsset in graph[currentAsset]) {
  //     if (!visited.has(nextAsset)) {
  //       const tradeData = graph[currentAsset][nextAsset];
  //       let tradeRate;
  //       if (path.length === 1) { // First trade
  //         tradeRate = tradeData.bid - lastPrice; // Selling, so use bid price
  //       } else {
  //         tradeRate = lastPrice - tradeData.ask; // Buying, so use ask price
  //       }
  //       const nextRate = rate + tradeRate * 0.9995; // Account for 0.05% fee
  //       const nextLastPrice = tradeData.last_price; // Update last price for next trade
  //       console.log(`Considering trade from ${currentAsset} to ${nextAsset} with rate: ${nextRate}`);
  //       if (tradeRate > 0) { // Only continue if this trade is profitable
  //         traverse(nextAsset, new Set(visited), nextRate, path, nextLastPrice);
  //       } else {
  //         console.log(`Trade from ${currentAsset} to ${nextAsset} is not profitable, skipping`);
  //       }
  //     } else {
  //       console.log(`Asset ${nextAsset} has already been visited, skipping`);
  //     }
  //   }

  //   // Backtrack
  //   console.log(`Backtracking from asset: ${currentAsset}`);
  //   visited.delete(currentAsset);
  //   path.pop();
  // }

  // Start with the last_price of the startAsset as the initial lastPrice
  const firstKey = graph[filteredPathKeys[0]];
  const firstAsset = firstKey[startAsset];
  const initialLastPrice = firstAsset && firstAsset.last_price;
  if (initialLastPrice) {
    console.log(`Initial last price for ${startAsset}: ${initialLastPrice}`);
    // traverse(startAsset, new Set(), 0, [], initialLastPrice);
  } else {
    console.log(`No initial last price found for ${startAsset}, cannot start traversal`);
  }

  console.log(`Total profitable paths found for ${startAsset}: ${profitablePaths.length}`);
  return profitablePaths;
}


module.exports = router;
