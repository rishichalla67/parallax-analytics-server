const express = require('express');
const axios = require('axios');
const redis = require('redis');
const { response } = require('../app');
const EIGHTEEN = 1000000000000000000;
const EIGHT = 100000000;
const SIX = 1000000;
const OPHIR_TOTAL_SUPPLY = 1000000000;
const OPHIR = "factory/migaloo1t862qdu9mj5hr3j727247acypym3ej47axu22rrapm4tqlcpuseqltxwq5/ophir"; 
const LUNA = 'ibc/4627AD2524E3E0523047E35BB76CC90E37D9D57ACF14F0FCBCEB2480705F3CB8';
const cache = {
    lastFetch: 0,
    whiteWhalePoolRawData: null,
    ophirCirculatingSupply: null,
    coinGeckoPrices: null,
    ophirStakedSupplyRaw: null
};
let treasuryCache = {
    lastFetch: 0, // Timestamp of the last fetch
    treasuryValues: null // Cached data
};
let treasuryBalances, treasuryDelegations, treasuryUnbondings, treasuryRedelegations, totalTreasuryAssets, prices;
const CACHE_IN_MINUTES = 1 * 60 * 1000; // 5 minutes in milliseconds

const tokenMappings = {
    'ibc/517E13F14A1245D4DE8CF467ADD4DA0058974CDCC880FA6AE536DBCA1D16D84E': { symbol: 'bWhale', decimals: 6 },
    'ibc/B3F639855EE7478750CC8F82072307ED6E131A8EFF20345E1D136B50C4E5EC36': { symbol: 'ampWhale', decimals: 6 },
    'factory/migaloo1t862qdu9mj5hr3j727247acypym3ej47axu22rrapm4tqlcpuseqltxwq5/ophir': {symbol: 'ophir', decimals: 6},
    'uwhale': {symbol: "whale", decimals: 6},
    'ibc/EA459CE57199098BA5FFDBD3194F498AA78439328A92C7D136F06A5220903DA6': { symbol: 'ampWHALEt', decimals: 6},
    'ibc/B65E189D3168DB40C88C6A6C92CA3D3BB0A8B6310325D4C43AB5702F06ECD60B': {symbol: 'wBTC', decimals: 8},
    'ibc/4627AD2524E3E0523047E35BB76CC90E37D9D57ACF14F0FCBCEB2480705F3CB8': {symbol: 'luna', decimals: 6},
  };

const router = express.Router();
// const redisClient = redis.createClient({
//   // url: `${process.env.REDIS_URL}` 
//   url: "redis://:8R3rayhaJe66wIYQRKaY7UnsnlWBDvi4@redis-15972.c274.us-east-1-3.ec2.cloud.redislabs.com:15972"
// });
// redisClient.connect();

function filterPoolsWithPrice(data) {
    const filteredData = data
        .filter(item => parseFloat(item.Price) > 0)
        .reduce((acc, item) => {
            acc[item.pool_id] = item.Price;
            return acc;
        }, {});

    return filteredData;
} 

function getContractBalance(data){
    const ophirTokenInfo = tokenMappings[OPHIR];
    ubalance = data.balances[OPHIR];
    balance = ubalance / Math.pow(10, ophirTokenInfo.decimals);
    return balance;
}

const formatNumber = (number, decimal) => {
    return number.toLocaleString('en-US', {
      minimumFractionDigits: decimal,
      maximumFractionDigits: decimal,
    });
  };

async function fetchStatData() {
    cache.whiteWhalePoolRawData = await axios.get('https://www.api-white-whale.enigma-validator.com/summary/migaloo/all/current');
    cache.ophirCirculatingSupply = await axios.get('https://therealsnack.com/ophircirculatingsupply');
    cache.ophirStakedSupplyRaw = await axios.get('https://migaloo.explorer.interbloc.org/account/migaloo1kv72vwfhq523yvh0gwyxd4nc7cl5pq32v9jt5w2tn57qtn57g53sghgkuh');
    cache.coinGeckoPrices = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=terra-luna-2,white-whale,bitcoin&vs_currencies=usd&include_last_updated_at=true');
    cache.lastFetch = Date.now();

    return cache;
}

function swapKeysWithSymbols(balances) {
    let swappedBalances = {};

    for (let key in balances) {
        if (tokenMappings[key]) {
            swappedBalances[tokenMappings[key].symbol] = balances[key];
        } else {
            // If no mapping found, keep the original key
            swappedBalances[key] = balances[key];
        }
    }

    return swappedBalances;
}

function extractAllianceAssetBalances(dataArray) {
    let balances = {};

    dataArray.forEach(item => {
        if(item.balance > 0){
            let assetKey = item.asset.native;
            let balance = item.balance;
            balances[assetKey] = balance;
        }
    });
    // console.log(swapKeysWithSymbols(balances));
    return swapKeysWithSymbols(balances);
}

function extractAllianceRewardsPerAsset(dataArray) {
    let rewards = {};

    dataArray.forEach(item => {
        let assetKey = item.staked_asset.native;
        let reward = item.rewards;
        rewards[assetKey] = reward;
    });
    // console.log(swapKeysWithSymbols(rewards))
    return swapKeysWithSymbols(rewards);
}

function combineAllianceAssetsWithRewards(assets, rewards){
    let combined = {};

    for (let key in assets) {
        combined[key] = {
            balance: assets[key],
            rewards: rewards[key] || "0" // Fallback to "0" if no reward is found for the key
        };
    }
    return combined;
}

function addAllianceAssetsAndRewardsToTreasury(alliance, treasury) {
    let combined = {};

    // Process alliance data
    for (let key in alliance) {
        combined[key] = { 
            ...alliance[key], 
            location: 'allianceStake' 
        };
    }

    // Process treasury data
    for (let key in treasury) {
        if (combined[key]) {
            combined[key].balance = treasury[key];
        } else {
            combined[key] = {
                balance: treasury[key],
                rewards: '0',
                location: 'treasury'
            };
        }
    }
    return combined;
}

function getDecimalForSymbol(symbol) {
    for (let key in tokenMappings) {
        if (tokenMappings[key].symbol === symbol) {
            return tokenMappings[key].decimals;
        }
    }
    return null; // Return null if the symbol is not found
}

function adjustDecimals(data) {
    let adjustedData = {};

    for (let key in data) {
        let balance = Number(data[key].balance) / Math.pow(10, getDecimalForSymbol(key) || 0);
        let rewards = Number(data[key].rewards);
        if (rewards !== 0) {
            let decimal = data[key].location === 'allianceStake' ? tokenMappings[LUNA].decimals : getDecimalForSymbol(key) || 0;
            rewards = rewards / Math.pow(10, decimal);
        }

        adjustedData[key] = {
            ...data[key],
            balance: balance.toString(),
            rewards: rewards.toString()
        };
    }
    return adjustedData;
} 

async function caclulateAndAddTotalTreasuryValue(balances) {
    let totalValue = 0;
    let totalValueWithoutOphir = 0;
    let statData;
    if (!cache.coinGeckoPrices) {
        statData = await fetchStatData();
    }
    const whalePrice = statData?.coinGeckoPrices.data['white-whale']?.usd || cache?.coinGeckoPrices.data['white-whale']?.usd;
    const whiteWhalePoolFilteredData = filterPoolsWithPrice(statData?.whiteWhalePoolRawData.data || cache.whiteWhalePoolRawData.data) || 0;

    prices = {
        whale: whalePrice,
        ophir: whiteWhalePoolFilteredData["OPHIR-WHALE"] * whalePrice,
        bWhale: whiteWhalePoolFilteredData["bWHALE-WHALE"] * whalePrice,
        ampWhale: whiteWhalePoolFilteredData['ampWHALE-WHALE'] * whalePrice,
        wBTC: statData?.coinGeckoPrices.data['bitcoin']?.usd || cache?.coinGeckoPrices.data['bitcoin']?.usd,
        ampWHALEt: whiteWhalePoolFilteredData["bWHALE-WHALE"] * whalePrice,  //update when there is a ampWHALEt pool
        luna: statData?.coinGeckoPrices.data["terra-luna-2"]?.usd || cache?.coinGeckoPrices.data['terra-luna-2']?.usd,
        ash: whiteWhalePoolFilteredData['ASH-WHALE'] * whalePrice
    }

    for (let key in balances) {
        let balance = balances[key].balance;
        let price = prices[key] || 0; // Assuming 0 if price is not available
        totalValue += balance * price;

        // Exclude Ophir asset for the second total
        if (key !== 'ophir') {
            totalValueWithoutOphir += balance * price;
        }
    }

    return {
        "totalTreasuryValue": formatNumber(totalValue, 2),
        "treasuryValueWithoutOphir": formatNumber(totalValueWithoutOphir, 2)
    };
}

function parseOphirDaoTreasury(migalooTreasuryData, allianceStakingAssetsData, allianceStakingRewardsData) {
    // Parse the JSON data
    // const data = JSON.parse(jsonData);

    let stakingAssets = extractAllianceAssetBalances(allianceStakingAssetsData);
    let stakingRewards = extractAllianceRewardsPerAsset(allianceStakingRewardsData);
    let unifiedAlliance = combineAllianceAssetsWithRewards(stakingAssets, stakingRewards)
    totalTreasuryAssets = addAllianceAssetsAndRewardsToTreasury(unifiedAlliance, swapKeysWithSymbols(migalooTreasuryData.balances));
    treasuryBalances = swapKeysWithSymbols(migalooTreasuryData.balances);
    treasuryDelegations = migalooTreasuryData.delegations;
    treasuryUnbondings = migalooTreasuryData.unbondings;
    treasuryRedelegations = migalooTreasuryData.redelegations;

    // Return the extracted data
}
 
router.get('/stats', async (req, res) => {
    if (Date.now() - cache.lastFetch > CACHE_IN_MINUTES) {
        await fetchStatData();
    }
    whiteWhalePoolFilteredData = filterPoolsWithPrice(cache.whiteWhalePoolRawData.data);
    ophirStakedSupply = getContractBalance(cache.ophirStakedSupplyRaw.data);
    ophirPrice = whiteWhalePoolFilteredData["OPHIR-WHALE"]*cache.coinGeckoPrices.data["white-whale"].usd;
    res.json({
        price: whiteWhalePoolFilteredData["OPHIR-WHALE"]*cache.coinGeckoPrices.data["white-whale"].usd,
        marketCap: cache.ophirCirculatingSupply.data*ophirPrice,
        fdv: ophirPrice*OPHIR_TOTAL_SUPPLY,
        circulatingSupply: cache.ophirCirculatingSupply.data,
        stakedSupply: ophirStakedSupply,
        totalSupply: OPHIR_TOTAL_SUPPLY
    });
});

router.get('/treasury', async (req, res) => {
    const now = Date.now();
    const oneMinute = 60000; // 60000 milliseconds in a minute

    // Check if cache is valid
    if (treasuryCache.lastFetch > now - oneMinute && treasuryCache.data) {
        return res.json(treasuryCache.data); // Return cached data if it's less than 1 minute old
    }

    // Fetch new data
    const ophirTreasuryMigalooAssets = await axios.get('https://migaloo.explorer.interbloc.org/account/migaloo10gj7p9tz9ncjk7fm7tmlax7q6pyljfrawjxjfs09a7e7g933sj0q7yeadc');
    const allianceStakingAssets = await axios.get('https://phoenix-lcd.terra.dev/cosmwasm/wasm/v1/contract/terra1jwyzzsaag4t0evnuukc35ysyrx9arzdde2kg9cld28alhjurtthq0prs2s/smart/ew0KICAiYWxsX3N0YWtlZF9iYWxhbmNlcyI6IHsNCiAgICAiYWRkcmVzcyI6ICJ0ZXJyYTFoZzU1ZGpheWNyd2dtMHZxeWR1bDNhZDNrNjRqbjBqYXRudWg5d2p4Y3h3dHhyczZteHpzaHhxamYzIg0KICB9DQp9');
    const allianceStakingRewards = await axios.get('https://phoenix-lcd.terra.dev/cosmwasm/wasm/v1/contract/terra1jwyzzsaag4t0evnuukc35ysyrx9arzdde2kg9cld28alhjurtthq0prs2s/smart/ewogICJhbGxfcGVuZGluZ19yZXdhcmRzIjogeyJhZGRyZXNzIjoidGVycmExaGc1NWRqYXljcndnbTB2cXlkdWwzYWQzazY0am4wamF0bnVoOXdqeGN4d3R4cnM2bXh6c2h4cWpmMyJ9Cn0=');
    
    parseOphirDaoTreasury(ophirTreasuryMigalooAssets.data, allianceStakingAssets.data.data, allianceStakingRewards.data.data);
    let treasuryValues = await caclulateAndAddTotalTreasuryValue(adjustDecimals(totalTreasuryAssets))

    // Cache the new data with the current timestamp
    treasuryCache = {
        lastFetch: now,
        data: {
            ...adjustDecimals(totalTreasuryAssets),
            totalTreasuryValue: treasuryValues.totalTreasuryValue,
            treasuryValueWithoutOphir: treasuryValues.treasuryValueWithoutOphir
        }
    };

    res.json(treasuryCache.data);
});

// router.get('/prices', async (req, res)) => {

// }

module.exports = router;
