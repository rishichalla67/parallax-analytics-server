const express = require('express');
const axios = require('axios');
const OPHIR_TOTAL_SUPPLY = 1000000000;
const OPHIR = "factory/migaloo1t862qdu9mj5hr3j727247acypym3ej47axu22rrapm4tqlcpuseqltxwq5/ophir"; 
const LUNA = 'ibc/4627AD2524E3E0523047E35BB76CC90E37D9D57ACF14F0FCBCEB2480705F3CB8';

const cache = {
    lastFetch: 0,
    whiteWhalePoolRawData: null,
    ophirCirculatingSupply: null,
    coinPrices: null,
    ophirStakedSupplyRaw: null
};
const priceAssetList = ['wBTC', 'luna', 'whale', 'kuji', 'wBTC.axl'];
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
    'ibc/6E5BF71FE1BEBBD648C8A7CB7A790AEF0081120B2E5746E6563FC95764716D61': { symbol: 'wBTC', decimals: 8},
    'ibc/EF4222BF77971A75F4E655E2AD2AFDDC520CE428EF938A1C91157E9DFBFF32A3': { symbol: 'kuji', decimals: 6},
    'ibc/B65E189D3168DB40C88C6A6C92CA3D3BB0A8B6310325D4C43AB5702F06ECD60B': {symbol: 'wBTCaxl', decimals: 8},
    'ibc/4627AD2524E3E0523047E35BB76CC90E37D9D57ACF14F0FCBCEB2480705F3CB8': {symbol: 'luna', decimals: 6},
    'factory/migaloo1p5adwk3nl9pfmjjx6fu9mzn4xfjry4l2x086yq8u8sahfv6cmuyspryvyu/uLP': {symbol: 'ophirWhaleLp', decimals: 6},
    'factory/migaloo1axtz4y7jyvdkkrflknv9dcut94xr5k8m6wete4rdrw4fuptk896su44x2z/uLP': {symbol: 'whalewBtcLp', decimals: 6},
    'factory/migaloo1xv4ql6t6r8zawlqn2tyxqsrvjpmjfm6kvdfvytaueqe3qvcwyr7shtx0hj/uLP': {symbol: 'usdcWhaleLp', decimals: 6}
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

function getOphirContractBalance(data){
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

async function fetchWithTimeout(url, timeout = 5000, fallback = null) {
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
            console.error(`Request to ${url} timed out`);
            resolve(fallback); // Resolve with fallback on timeout
        }, timeout);

        axios.get(url).then(response => {
            clearTimeout(timeoutId);
            resolve(response);
        }).catch(error => {
            clearTimeout(timeoutId);
            console.error(`Failed to fetch from ${url}:`, error.message);
            resolve(fallback); // Resolve with fallback on error
        });
    });
}

async function fetchStatData() {
    const ophirCirculatingSupplyResponse = await fetchWithTimeout(
        'https://therealsnack.com/ophircirculatingsupply',
        5000,
        { data: OPHIR_TOTAL_SUPPLY } // Assuming OPHIR_TOTAL_SUPPLY is the desired fallback structure
    );

    cache.whiteWhalePoolRawData = await axios.get('https://www.api-white-whale.enigma-validator.com/summary/migaloo/all/current');
    cache.ophirCirculatingSupply = ophirCirculatingSupplyResponse;
    cache.ophirStakedSupplyRaw = await axios.get('https://migaloo.explorer.interbloc.org/account/migaloo1kv72vwfhq523yvh0gwyxd4nc7cl5pq32v9jt5w2tn57qtn57g53sghgkuh');
    cache.ophirInMine = await axios.get('https://migaloo.explorer.interbloc.org/account/migaloo1dpchsx70fe6gu9ljtnknsvd2dx9u7ztrxz9dr6ypfkj4fvv0re6qkdrwkh');
    cache.ophirWhalePoolData = await axios.get('https://migaloo-lcd.erisprotocol.com/cosmwasm/wasm/v1/contract/migaloo1p5adwk3nl9pfmjjx6fu9mzn4xfjry4l2x086yq8u8sahfv6cmuyspryvyu/smart/eyJwb29sIjp7fX0=');
    cache.whalewBtcPoolData = await axios.get('https://ww-migaloo-rest.polkachu.com/cosmwasm/wasm/v1/contract/migaloo1axtz4y7jyvdkkrflknv9dcut94xr5k8m6wete4rdrw4fuptk896su44x2z/smart/eyJwb29sIjp7fX0=');
    cache.coinPrices = await fetchCoinPrices();
    cache.lastFetch = Date.now();

    return cache;
}

async function fetchCoinPrices(){
    const prices = {};

    for (const asset of priceAssetList) {
      try {
        const response = await axios.get(`https://api-osmosis.imperator.co/tokens/v2/price/${asset.toLowerCase()}`);
        prices[asset] = response.data.price;
      } catch (error) {
        console.error(`Error fetching price for ${asset}:`, error);
        prices[asset] = 'Error fetching data';
      }
    }
    
    //custom logic for '.' in asset name
    prices.wBTCaxl = prices['wBTC.axl'];
    delete prices['wBTC.axl'];

    console.log(prices);
    
    return prices;
}

function getLPPrice(data, ophirwhaleRatio, whalePrice) {
    // Extract total share
    
    const totalShare = data.data.total_share / Math.pow(10, 6);

    // Process each asset
    const assets = data.data.assets.reduce((acc, asset) => {
        acc[tokenMappings[asset.info.native_token.denom].symbol] = (Number(asset.amount) / Math.pow(10, getDecimalForSymbol(tokenMappings[asset.info.native_token.denom].symbol)));
        return acc;
    }, {});
    // console.log(assets)
    // console.log(totalShare)

    let whaleValue = assets['whale']*whalePrice;
    let ophirValue = assets['ophir']*(ophirwhaleRatio*whalePrice);
    return (whaleValue+ophirValue)/totalShare;
}

function getWhalewBtcLPPrice(data, whalewBtcRatio, whalePrice, wBTCPrice) {
    // Extract total share
    const totalShare = data.data.total_share / Math.pow(10, 6);
    // console.log(totalShare)
    // Process each asset
    const assets = data.data.assets.reduce((acc, asset) => {
        // console.log(tokenMappings[asset.info.native_token.denom].symbol)
        acc[tokenMappings[asset.info.native_token.denom].symbol] = (Number(asset.amount) / Math.pow(10, getDecimalForSymbol(tokenMappings[asset.info.native_token.denom].symbol)));
        return acc;
    }, {});
    console.log(assets)
    console.log(totalShare)

    let whaleValue = assets['whale']*whalePrice;
    let wbtcValue = assets['wBTC']*wBTCPrice;
    console.log(whaleValue)
    console.log(wbtcValue)
    console.log((whaleValue+wbtcValue)/totalShare);
    return (whaleValue+wbtcValue)/totalShare;
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
    let arrayData = Array.isArray(dataArray) ? dataArray : [dataArray];
    let balances = {};
    arrayData.forEach(item => {
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

function addAllianceAssetsAndRewardsToTreasury(lunaAlliance, migalooAlliance, treasury) {
    let combined = {};

    // Process alliance data
    for (let key in lunaAlliance) {
        combined[key] = { 
            ...lunaAlliance[key], 
            location: 'Luna Alliance' 
        };
    }

    for (let key in migalooAlliance) {
        combined[key] = { 
            ...migalooAlliance[key], 
            location: 'Migaloo Alliance' 
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
                location: 'Treasury'
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
            let decimal = data[key].location === 'Alliance' ? tokenMappings[LUNA].decimals : getDecimalForSymbol(key) || 0;
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
    if (!cache.coinPrices) {
        statData = await fetchStatData();
    }
    const whalePrice = statData?.coinPrices['whale'] || cache?.coinPrices['whale'];
    const whiteWhalePoolFilteredData = filterPoolsWithPrice(statData?.whiteWhalePoolRawData.data || cache.whiteWhalePoolRawData.data) || 0;
    const ophirWhaleLpPrice = getLPPrice(cache?.ophirWhalePoolData.data, whiteWhalePoolFilteredData["OPHIR-WHALE"], whalePrice);
    const whalewBtcLpPrice = getWhalewBtcLPPrice(cache?.whalewBtcPoolData.data, whiteWhalePoolFilteredData["WHALE-wBTC"], whalePrice, statData?.coinPrices['wBTC']?.usd || cache?.coinPrices['wBTC']);

    let prices = {
        whale: whalePrice,
        ophir: whiteWhalePoolFilteredData["OPHIR-WHALE"] * whalePrice,
        bWhale: whiteWhalePoolFilteredData["bWHALE-WHALE"] * whalePrice,
        ampWhale: whiteWhalePoolFilteredData['ampWHALE-WHALE'] * whalePrice,
        wBTC: statData?.coinPrices['wBTC']?.usd || cache?.coinPrices['wBTC'],
        wBTCaxl: statData?.coinPrices['wBTCaxl']?.usd || cache?.coinPrices['wBTCaxl'],
        ampWHALEt: whiteWhalePoolFilteredData["bWHALE-WHALE"] * whalePrice,  //update when there is a ampWHALEt pool
        luna: statData?.coinPrices["luna"] || cache?.coinPrices['luna'],
        ash: whiteWhalePoolFilteredData['ASH-WHALE'] * whalePrice,
        ophirWhaleLp: ophirWhaleLpPrice,
        kuji: statData?.coinPrices["kuji"] || cache?.coinPrices['kuji'],
        whalewBtcLp: whalewBtcLpPrice
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
    ophirStakedSupply = getOphirContractBalance(cache.ophirStakedSupplyRaw.data);

    return {
        "totalTreasuryValue": formatNumber(totalValue, 2),
        "treasuryValueWithoutOphir": formatNumber(totalValueWithoutOphir, 2),
        "ophirRedemptionPrice": (totalValueWithoutOphir/(cache.ophirCirculatingSupply.data+ophirStakedSupply))
    };
}

function compactAlliance(assetData, rewardsData){
    console.log(assetData)
    let stakingAssets = extractAllianceAssetBalances(assetData);
    let stakingRewards = extractAllianceRewardsPerAsset(rewardsData);
    return combineAllianceAssetsWithRewards(stakingAssets, stakingRewards);
}

function parseOphirDaoTreasury(migalooTreasuryData, allianceStakingAssetsData, allianceStakingRewardsData, allianceMigalooStakingAssetsData, allianceMigalooStakingRewardsData) {
    // Parse the JSON data
    // const data = JSON.parse(jsonData);

    let lunaAlliance = compactAlliance(allianceStakingAssetsData, allianceStakingRewardsData);
    let migalooAlliance = compactAlliance(allianceMigalooStakingAssetsData, allianceMigalooStakingRewardsData);

    console.log(lunaAlliance, migalooAlliance);

    totalTreasuryAssets = addAllianceAssetsAndRewardsToTreasury(lunaAlliance, migalooAlliance, swapKeysWithSymbols(migalooTreasuryData.balances));
    treasuryBalances = swapKeysWithSymbols(migalooTreasuryData.balances);
    treasuryDelegations = migalooTreasuryData.delegations;
    treasuryUnbondings = migalooTreasuryData.unbondings;
    treasuryRedelegations = migalooTreasuryData.redelegations;

    // Return the extracted data
}
 
router.get('/stats', async (req, res) => {
    try {
        if (Date.now() - cache.lastFetch > CACHE_IN_MINUTES * 60 * 1000) { // Ensure CACHE_IN_MINUTES is converted to milliseconds
            await fetchStatData();
        }
        let whiteWhalePoolFilteredData, ophirStakedSupply, ophirInMine, ophirPrice;
        try {
            whiteWhalePoolFilteredData = filterPoolsWithPrice(cache.whiteWhalePoolRawData.data);
        } catch (error) {
            console.error('Error filtering White Whale Pool data:', error);
            whiteWhalePoolFilteredData = {}; // Default to empty object to prevent further errors
        }
        try {
            ophirStakedSupply = getOphirContractBalance(cache.ophirStakedSupplyRaw.data);
        } catch (error) {
            console.error('Error getting Ophir Staked Supply:', error);
            ophirStakedSupply = 0; // Default to 0 to prevent further errors
        }
        try {
            ophirInMine = getOphirContractBalance(cache.ophirInMine.data);
        } catch (error) {
            console.error('Error getting Ophir in Mine:', error);
            ophirInMine = 0; // Default to 0 to prevent further errors
        }
        try {
            ophirPrice = whiteWhalePoolFilteredData["OPHIR-WHALE"] * cache.coinPrices["whale"];
        } catch (error) {
            console.error('Error calculating Ophir Price:', error);
            ophirPrice = 0; // Default to 0 to prevent further errors
        }
        res.json({
            price: ophirPrice,
            marketCap: (cache.ophirCirculatingSupply.data + ophirStakedSupply) * ophirPrice,
            fdv: ophirPrice * OPHIR_TOTAL_SUPPLY,
            circulatingSupply: cache.ophirCirculatingSupply.data,
            stakedSupply: ophirStakedSupply,
            totalSupply: OPHIR_TOTAL_SUPPLY,
            ophirInMine: ophirInMine
        });
    } catch (error) {
        console.error('An unexpected error occurred:', error);
        res.status(500).json({ error: 'An unexpected error occurred' });
    }
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
    const allianceMigalooStakingAssets = await axios.get('https://ww-migaloo-rest.polkachu.com/cosmwasm/wasm/v1/contract/migaloo190qz7q5fu4079svf890h4h3f8u46ty6cxnlt78eh486k9qm995hquuv9kd/smart/ewogICJzdGFrZWRfYmFsYW5jZSI6IHsiYWRkcmVzcyI6Im1pZ2Fsb28xeDZuOXpnNjNhdWh0dXZndWN2bmV6MHdobmFhZW1xcGdybmwwc2w4dmZnOWhqdmVkNzZwcW5ndG1nayIsCiAgICJhc3NldCI6ewogICAgICAgIm5hdGl2ZSI6ImZhY3RvcnkvbWlnYWxvbzFheHR6NHk3anl2ZGtrcmZsa252OWRjdXQ5NHhyNWs4bTZ3ZXRlNHJkcnc0ZnVwdGs4OTZzdTQ0eDJ6L3VMUCIKICAgfSAgIAogICAgICAKICB9CiAgCn0=');
    const allianceMigalooStakingRewards = await axios.get('https://ww-migaloo-rest.polkachu.com/cosmwasm/wasm/v1/contract/migaloo190qz7q5fu4079svf890h4h3f8u46ty6cxnlt78eh486k9qm995hquuv9kd/smart/eyJhbGxfcGVuZGluZ19yZXdhcmRzIjp7ImFkZHJlc3MiOiJtaWdhbG9vMXg2bjl6ZzYzYXVodHV2Z3Vjdm5lejB3aG5hYWVtcXBncm5sMHNsOHZmZzloanZlZDc2cHFuZ3RtZ2sifX0=');

    parseOphirDaoTreasury(ophirTreasuryMigalooAssets.data, allianceStakingAssets.data.data, allianceStakingRewards.data.data, allianceMigalooStakingAssets.data.data, allianceMigalooStakingRewards.data.data);
    let treasuryValues = await caclulateAndAddTotalTreasuryValue(adjustDecimals(totalTreasuryAssets))

    // Cache the new data with the current timestamp
    treasuryCache = {
        lastFetch: now,
        data: {
            ...adjustDecimals(totalTreasuryAssets),
            totalTreasuryValue: treasuryValues.totalTreasuryValue,
            treasuryValueWithoutOphir: treasuryValues.treasuryValueWithoutOphir,
            ophirRedemptionPrice: treasuryValues.ophirRedemptionPrice
        }
    };

    res.json(treasuryCache.data);
});

router.get('/prices', async (req, res) => {
    let statData;
    if (!cache.coinPrices) {
        statData = await fetchStatData();
    } 
    const whalePrice = statData?.coinPrices['whale'] || cache?.coinPrices['whale'];
    const whiteWhalePoolFilteredData = filterPoolsWithPrice(statData?.whiteWhalePoolRawData.data || cache.whiteWhalePoolRawData.data) || 0;
    const ophirWhaleLpPrice = getLPPrice(cache?.ophirWhalePoolData.data, whiteWhalePoolFilteredData["OPHIR-WHALE"], whalePrice);
    const whalewBtcLpPrice = getWhalewBtcLPPrice(cache?.whalewBtcPoolData.data, whiteWhalePoolFilteredData["WHALE-wBTC"], whalePrice, statData?.coinPrices['wBTC']?.usd || cache?.coinPrices['wBTC']);
    // console.log(ophirWhaleLpPrice)
    let prices = {
        whale: whalePrice,
        ophir: whiteWhalePoolFilteredData["OPHIR-WHALE"] * whalePrice,
        bWhale: whiteWhalePoolFilteredData["bWHALE-WHALE"] * whalePrice,
        ampWhale: whiteWhalePoolFilteredData['ampWHALE-WHALE'] * whalePrice,
        wBTC: statData?.coinPrices['wBTC']?.usd || cache?.coinPrices['wBTC'],
        wBTCaxl: statData?.coinPrices['wBTCaxl']?.usd || cache?.coinPrices['wBTCaxl'],
        ampWHALEt: whiteWhalePoolFilteredData["bWHALE-WHALE"] * whalePrice,  //update when there is a ampWHALEt pool
        luna: statData?.coinPrices["luna"] || cache?.coinPrices['luna'],
        ash: whiteWhalePoolFilteredData['ASH-WHALE'] * whalePrice,
        ophirWhaleLp: ophirWhaleLpPrice,
        kuji: statData?.coinPrices["kuji"] || cache?.coinPrices['kuji'],
        whalewBtcLp: whalewBtcLpPrice
    }
    res.json(prices);
});

module.exports = router;
