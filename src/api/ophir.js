const express = require('express');
const axios = require('axios');
const redis = require('redis');
const { response } = require('../app');
const EIGHTEEN = 1000000000000000000;
const EIGHT = 100000000;
const SIX = 1000000;
const OPHIR_TOTAL_SUPPLY = 1000000000;
const OPHIR = "factory/migaloo1t862qdu9mj5hr3j727247acypym3ej47axu22rrapm4tqlcpuseqltxwq5/ophir"; 
const cache = {
    lastFetch: 0,
    whiteWhalePoolRawData: null,
    ophirCirculatingSupply: null,
    coinGeckoPrices: null,
    ophirStakedSupplyRaw: null
};

const FIVE_MINUTES = 5 * 60 * 1000; // 5 minutes in milliseconds

const tokenMappings = {
    'ibc/517E13F14A1245D4DE8CF467ADD4DA0058974CDCC880FA6AE536DBCA1D16D84E': { symbol: 'bWhale', decimals: 6 },
    'ibc/B3F639855EE7478750CC8F82072307ED6E131A8EFF20345E1D136B50C4E5EC36': { symbol: 'ampWhale', decimals: 6 },
    'factory/migaloo1t862qdu9mj5hr3j727247acypym3ej47axu22rrapm4tqlcpuseqltxwq5/ophir': {symbol: 'ophir', decimals: 6},
    'uwhale': {symbol: "whale", decimals: 6},
    'ibc/EA459CE57199098BA5FFDBD3194F498AA78439328A92C7D136F06A5220903DA6': { symbol: 'ampWHALEt', decimals: 6},
    'ibc/B65E189D3168DB40C88C6A6C92CA3D3BB0A8B6310325D4C43AB5702F06ECD60B': {symbol: 'wBTC', decimals: 8}
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

async function fetchStatData() {
    cache.whiteWhalePoolRawData = await axios.get('https://www.api-white-whale.enigma-validator.com/summary/migaloo/all/current');
    cache.ophirCirculatingSupply = await axios.get('https://therealsnack.com/ophircirculatingsupply');
    cache.coinGeckoPrices = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=terra-luna-2,white-whale,bitcoin&vs_currencies=usd&include_last_updated_at=true');
    cache.ophirStakedSupplyRaw = await axios.get('https://migaloo.explorer.interbloc.org/account/migaloo1kv72vwfhq523yvh0gwyxd4nc7cl5pq32v9jt5w2tn57qtn57g53sghgkuh');

    cache.lastFetch = Date.now();
}
 
router.get('/stats', async (req, res) => {
    // const whiteWhalePoolRawData = await axios.get('https://www.api-white-whale.enigma-validator.com/summary/migaloo/all/current');
    // const ophirCirculatingSupply = await axios.get('https://therealsnack.com/ophircirculatingsupply');
    // coinGeckoPrices = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=terra-luna-2,white-whale,bitcoin&vs_currencies=usd&include_last_updated_at=true');
    // const ophirStakedSupplyRaw = await axios.get('https://migaloo.explorer.interbloc.org/account/migaloo1kv72vwfhq523yvh0gwyxd4nc7cl5pq32v9jt5w2tn57qtn57g53sghgkuh')
    if (Date.now() - cache.lastFetch > FIVE_MINUTES) {
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
    const ophirTreasuryMigalooAssets = await axios.get('https://migaloo.explorer.interbloc.org/account/migaloo10gj7p9tz9ncjk7fm7tmlax7q6pyljfrawjxjfs09a7e7g933sj0q7yeadc');
    
})

module.exports = router;
