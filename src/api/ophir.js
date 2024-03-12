const express = require('express');
const axios = require('axios');
const { getDatabase } = require('firebase-admin/database');
const admin = require("firebase-admin");
const OPHIR_TOTAL_SUPPLY = 1000000000;
const OPHIR = "factory/migaloo1t862qdu9mj5hr3j727247acypym3ej47axu22rrapm4tqlcpuseqltxwq5/ophir"; 
const LUNA = 'ibc/4627AD2524E3E0523047E35BB76CC90E37D9D57ACF14F0FCBCEB2480705F3CB8';
const AMPROAR_ERIS_CONSTANT = 1.0199;
const MUSDC_ERIS_CONSTANT = 1.0208;

const cache = {
    lastFetch: 0,
    whiteWhalePoolRawData: null,
    ophirCirculatingSupply: null,
    coinPrices: null,
    ophirStakedSupplyRaw: null
};
var serviceAccount = require("../../resources/firebase/firebase-admin.json");
const symbolDenomMap = {
    "chihuahua-token": "huahua",
    "comdex": "cmdx",
    "cosmos": "atom",
    "injective-protocol": "inj",
    "juno-network": "juno",
    "levana-protocol": "lvn",
    "lion-dao": "roar",
    "osmosis": "osmo",
    "sei-network": "sei",
    "shade-protocol": "shd",
    "terra-luna": "lunc",
    "terra-luna-2": "luna",
    "tether": "usdt",
    "usd-coin": "usdc",
    "white-whale": "whale",
    "wrapped-bitcoin": "wBTC"
}
const priceAssetList = ['wBTC.axl'];
let treasuryCache = {
    lastFetch: 0, // Timestamp of the last fetch
    treasuryValues: null // Cached data
};
let treasuryBalances, treasuryDelegations, treasuryUnbondings, treasuryRedelegations, totalTreasuryAssets, prices;
const CACHE_IN_MINUTES = 1 * 60 * 1000; // 5 minutes in milliseconds

const tokenMappings = {
    'ibc/517E13F14A1245D4DE8CF467ADD4DA0058974CDCC880FA6AE536DBCA1D16D84E': { symbol: 'bWhale', decimals: 6 },
    'ibc/917C4B1E92EE2F959FC11ECFC435C4048F97E8B00F9444592706F4604F24BF25': {symbol: 'bWhale', decimals: 6},
    'ibc/B3F639855EE7478750CC8F82072307ED6E131A8EFF20345E1D136B50C4E5EC36': { symbol: 'ampWhale', decimals: 6 },
    'ibc/834D0AEF380E2A490E4209DFF2785B8DBB7703118C144AC373699525C65B4223': {symbol: 'ampWhale', decimals: 6},
    'factory/migaloo1t862qdu9mj5hr3j727247acypym3ej47axu22rrapm4tqlcpuseqltxwq5/ophir': {symbol: 'ophir', decimals: 6},
    'uwhale': {symbol: "whale", decimals: 6},
    'ibc/EDD6F0D66BCD49C1084FB2C35353B4ACD7B9191117CE63671B61320548F7C89D': {symbol: "whale", decimals: 6},
    'ibc/EA459CE57199098BA5FFDBD3194F498AA78439328A92C7D136F06A5220903DA6': { symbol: 'ampWHALEt', decimals: 6},
    'ibc/6E5BF71FE1BEBBD648C8A7CB7A790AEF0081120B2E5746E6563FC95764716D61': { symbol: 'wBTC', decimals: 8},
    'ibc/EF4222BF77971A75F4E655E2AD2AFDDC520CE428EF938A1C91157E9DFBFF32A3': { symbol: 'kuji', decimals: 6},
    'ibc/50D7251763B4D5E9DD7A8A6C6B012353E998CDE95C546C1F96D68F7CCB060918': { symbol: 'ampKuji', decimals: 6},
    'ibc/B65E189D3168DB40C88C6A6C92CA3D3BB0A8B6310325D4C43AB5702F06ECD60B': {symbol: 'wBTCaxl', decimals: 8},
    'ibc/4627AD2524E3E0523047E35BB76CC90E37D9D57ACF14F0FCBCEB2480705F3CB8': {symbol: 'luna', decimals: 6},
    'factory/migaloo1erul6xyq0gk6ws98ncj7lnq9l4jn4gnnu9we73gdz78yyl2lr7qqrvcgup/ash': {symbol: 'ash', decimals: 6},
    'factory/migaloo1p5adwk3nl9pfmjjx6fu9mzn4xfjry4l2x086yq8u8sahfv6cmuyspryvyu/uLP': {symbol: 'ophirWhaleLp', decimals: 6},
    'factory/migaloo1axtz4y7jyvdkkrflknv9dcut94xr5k8m6wete4rdrw4fuptk896su44x2z/uLP': {symbol: 'whalewBtcLp', decimals: 6},
    'factory/migaloo1xv4ql6t6r8zawlqn2tyxqsrvjpmjfm6kvdfvytaueqe3qvcwyr7shtx0hj/uLP': {symbol: 'usdcWhaleLp', decimals: 6},
    'factory/osmo1rckme96ptawr4zwexxj5g5gej9s2dmud8r2t9j0k0prn5mch5g4snzzwjv/sail': {symbol: 'sail', decimals: 6},
    'factory/terra1vklefn7n6cchn0u962w3gaszr4vf52wjvd4y95t2sydwpmpdtszsqvk9wy/ampROAR': {symbol: 'ampRoar', decimals: 6},
    'factory/migaloo1cwk3hg5g0rz32u6us8my045ge7es0jnmtfpwt50rv6nagk5aalasa733pt/ampUSDC': {symbol: 'ampUSDC', decimals: 6},
    'ibc/BC5C0BAFD19A5E4133FDA0F3E04AE1FBEE75A4A226554B2CBB021089FF2E1F8A': {symbol: 'axlUSDC', decimals: 6},
  };

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://parallax-analytics-server-default-rtdb.firebaseio.com"
    });
}

const db = getDatabase();
const firebaseOphirTreasury = db.ref('crypto/ophir/treasury');
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

    // Fetch additional price data
    const priceDataResponse = await axios.get("https://fd60qhijvtes7do71ou6moc14s.ingress.pcgameservers.com/api/prices");
    const priceData = priceDataResponse.data.data;

    // Map the fetched price data to the prices object
    for (const [key, value] of Object.entries(priceData)) {
        // Use the value from symbolDenomMap if it exists, otherwise use the original key
        let formattedKey = symbolDenomMap[key] || key;
        prices[formattedKey] = value.usd;
    }

    prices['ampRoar'] = prices["roar"]*AMPROAR_ERIS_CONSTANT;

    // Custom logic for '.' in asset name
    prices.wBTCaxl = prices['wBTC.axl'];
    delete prices['wBTC.axl'];

    console.log(prices)

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

    let whaleValue = assets['whale']*whalePrice;
    let wbtcValue = assets['wBTC']*wBTCPrice;
    return (whaleValue+wbtcValue)/totalShare;
}

function getSailPriceFromLp(data, whalePrice){
    const assets = data.data.assets.reduce((acc, asset) => {
        acc[tokenMappings[asset.info.native_token.denom].symbol] = (Number(asset.amount) / Math.pow(10, getDecimalForSymbol(tokenMappings[asset.info.native_token.denom].symbol)));
        return acc;
    }, {});

    let whaleValue = assets['whale']*whalePrice;
    let sailPrice = whaleValue/assets['sail'];
    return sailPrice;
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

function addAllianceAssetsAndRewardsToTreasury(lunaAlliance, migalooAlliance, migalooTreasury, migalooVault, migalooHotWallet, stakedSail, osmosisWWAssets, ampRoarAllianceStaked, ampRoarAllianceRewards) {
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
    for (let key in migalooTreasury) {
        if (combined[key]) {
            combined[key].balance = migalooTreasury[key];
        } else {
            combined[key] = {
                balance: migalooTreasury[key],
                rewards: '0',
                location: 'Migaloo Treasury'
            };
        }
    }

    for (let key in osmosisWWAssets) {
        if (combined[key]) {
            // console.log(key)
            let oldBalance = combined[key].balance;
            let oldRewards = combined[key].rewards;
            combined[key].balance = Number(combined[key].balance) + Number(osmosisWWAssets[key].balance);
            combined[key].location = "WW Osmosis + Luna Alliance"
            combined[key].rewards = oldRewards;
            combined[key].composition = {
                "Luna Alliance": adjustSingleDecimal(key,oldBalance),
                "WW Osmosis": adjustSingleDecimal(key, osmosisWWAssets[key].balance)
            };
        } else {combined[key] = { 
            ...osmosisWWAssets[key], 
            rewards: '0',
            location: 'WW Osmosis' 
            };
        }
    }

    // add staked sail
    combined['sail'] = {
        balance: stakedSail,
        rewards: '0',
        location: "Staked in Sail DAO"
    }

    for (let key in migalooHotWallet) {
        if (combined[key]) {
            let oldBalance = combined[key].balance;
            combined[key].balance = Number(combined[key].balance) + Number(migalooHotWallet[key]);
            combined[key].location = "Migaloo Hot Wallet + Treasury"
            combined[key].composition = {
                "Migaloo Treasury": adjustSingleDecimal(key,oldBalance),
                "Migaloo Hot Wallet": adjustSingleDecimal(key, migalooHotWallet[key])
            };
        } else {
            combined[key] = {
                balance: migalooHotWallet[key],
                rewards: '0',
                location: 'Migaloo Hot Wallet'
            };
        }
    }

    for (let key in migalooVault) {
        let combinedCopy = { ...combined[key] };
        if (combined[key]) {
            combined[key].balance = Number(combinedCopy.balance) + Number(migalooVault[key]);
            combined[key].location = combinedCopy.location + " + Migaloo Vault";
            combined[key].composition = {
                [combinedCopy.location]: adjustSingleDecimal(key, combinedCopy.balance),
                "Migaloo Vault": adjustSingleDecimal(key, migalooVault[key])
            };
        } else {
            combined[key] = {
                balance: migalooVault[key],
                rewards: '0',
                location: 'Migaloo Vault'
            };
        }
    }

    // Special handling for wBTC
    if (combined['wBTC']) {
        let originalAmount = combined['wBTC'].balance;
        combined['wBTC'].balance = Number(combined['wBTC'].balance) + 28676272;
        combined['wBTC'].location = "Migaloo Treasury + Migaloo Alliance";
        combined['wBTC'].composition = {
            "Migaloo Treasury": adjustSingleDecimal('wBTC', originalAmount),
            "Migaloo Alliance": adjustSingleDecimal('wBTC', 28676272)
        };
    }

    let ampRoarBalance = 0;
    let ampRoarRewards = 0;


    ampRoarAllianceStaked.delegations.forEach(delegation => {
        ampRoarBalance += Number(delegation.balance.amount);
    });

    ampRoarRewards = ampRoarAllianceRewards.rewards.find(reward => reward.denom === 'uluna').amount;
    console.log(ampRoarRewards);

    combined['ampRoar'] = {
        balance: ampRoarBalance,
        rewards: ampRoarRewards,
        location: "ampRoar Alliance Staked"
    };



    return combined;
}

function getOsmosisBondedAssets(osmosisWWBondedAssets) {
    const bondedAssets = osmosisWWBondedAssets.data.bonded_assets;
    const totalBonded = osmosisWWBondedAssets.data.total_bonded;
    const output = {};

    bondedAssets.forEach(asset => {
        const denom = asset.info.native_token.denom;
        const amount = asset.amount;
        const tokenInfo = tokenMappings[denom];
        if (tokenInfo) {
            const balance = Number(amount) / Math.pow(10, getDecimalForSymbol(denom));
            output[tokenInfo.symbol] = {
                balance: balance,
                location: "WW Osmosis"
            };
        }
    });
    return output;
}

function getDecimalForSymbol(symbol) {
    for (let key in tokenMappings) {
        if (tokenMappings[key].symbol === symbol) {
            return tokenMappings[key].decimals;
        }
    }
    return null; // Return null if the symbol is not found
}

function adjustSingleDecimal(symbol, valueToAdjust) {
    return valueToAdjust/ Math.pow(10, getDecimalForSymbol(symbol));
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
            rewards: rewards.toString(),
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
    const sailWhaleLpData = await axios.get('https://lcd.osmosis.zone/cosmwasm/wasm/v1/contract/osmo1w8e2wyzhrg3y5ghe9yg0xn0u7548e627zs7xahfvn5l63ry2x8zstaraxs/smart/ewogICJwb29sIjoge30KfQo=');
    const ampKujiPrice = await axios.get('https://lcd-kujira.whispernode.com/oracle/denoms/AMPKUJI/exchange_rate');
    const kujiPrice = await axios.get('https://lcd-kujira.whispernode.com/oracle/denoms/KUJI/exchange_rate');

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
        kuji: kujiPrice.data.exchange_rate,
        ampKuji: ampKujiPrice.data.exchange_rate,
        whalewBtcLp: whalewBtcLpPrice,
        shd: statData?.coinPrices["shd"] || cache?.coinPrices['shd'],
        lvn: statData?.coinPrices["lvn"] || cache?.coinPrices['lvn'],
        juno: statData?.coinPrices["juno"] || cache?.coinPrices['juno'],
        inj: statData?.coinPrices["inj"] || cache?.coinPrices['inj'],
        osmo: statData?.coinPrices["osmo"] || cache?.coinPrices['osmo'],
        usdt: statData?.coinPrices["usdt"] || cache?.coinPrices['usdt'],
        sei: statData?.coinPrices["sei"] || cache?.coinPrices['sei'],
        atom: statData?.coinPrices["atom"] || cache?.coinPrices['atom'],
        cmdx: statData?.coinPrices["cmdx"] || cache?.coinPrices['cmdx'],
        huahua: statData?.coinPrices["huahua"] || cache?.coinPrices['huahua'],
        lunc: statData?.coinPrices["lunc"] || cache?.coinPrices['lunc'],
        sail: getSailPriceFromLp(sailWhaleLpData.data, whalePrice),
        roar: statData?.coinPrices["roar"] || cache?.coinPrices['roar'],
        ampRoar: statData?.coinPrices["ampRoar"] || cache?.coinPrices['ampRoar'],
        ampUSDC: statData?.coinPrices['usdc']*MUSDC_ERIS_CONSTANT || cache?.coinPrices['usdc']*MUSDC_ERIS_CONSTANT,
        axlUSDC: statData?.coinPrices['usdc'] || cache?.coinPrices['usdc']
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
        "ophirRedemptionPrice": (totalValue/(cache.ophirCirculatingSupply.data+ophirStakedSupply))
    };
}

function compactAlliance(assetData, rewardsData){
    let stakingAssets = extractAllianceAssetBalances(assetData);
    let stakingRewards = extractAllianceRewardsPerAsset(rewardsData);
    return combineAllianceAssetsWithRewards(stakingAssets, stakingRewards);
}

function parseOphirDaoTreasury(migalooTreasuryData, ophirVaultMigalooAssets, migalooHotWallet, allianceStakingAssetsData, allianceStakingRewardsData, allianceMigalooStakingAssetsData, allianceMigalooStakingRewardsData, stakedSail, osmosisWWBondedAssets, ampRoarAllianceStaked, ampRoarAllianceRewards) {
    // Parse the JSON data
    // const data = JSON.parse(jsonData);

    let lunaAlliance = compactAlliance(allianceStakingAssetsData, allianceStakingRewardsData);
    let migalooAlliance = compactAlliance(allianceMigalooStakingAssetsData, allianceMigalooStakingRewardsData);

    let osmosisWWAssets = getOsmosisBondedAssets(osmosisWWBondedAssets);
    // console.log(osmosisWWAssets) 

    totalTreasuryAssets = addAllianceAssetsAndRewardsToTreasury(lunaAlliance, migalooAlliance, swapKeysWithSymbols(migalooTreasuryData.balances), swapKeysWithSymbols(ophirVaultMigalooAssets.balances),swapKeysWithSymbols(migalooHotWallet.balances), stakedSail, osmosisWWAssets, ampRoarAllianceStaked, ampRoarAllianceRewards);
    treasuryBalances = swapKeysWithSymbols(migalooTreasuryData.balances);
    treasuryDelegations = migalooTreasuryData.delegations;
    treasuryUnbondings = migalooTreasuryData.unbondings;
    treasuryRedelegations = migalooTreasuryData.redelegations;

    // Return the extracted data
}
 
router.get('/stats', async (req, res) => {
    try {
        if (Date.now() - cache.lastFetch > CACHE_IN_MINUTES * 250 * 1000) { // Ensure CACHE_IN_MINUTES is converted to milliseconds
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
    res.json(await getTreasuryAssets());
});

router.get('/prices', async (req, res) => {
    res.json(await getPrices());
});

async function getTreasuryAssets(){
    const now = Date.now();
    const oneMinute = 250000; // 60000 milliseconds in a minute

    // Check if cache is valid
    if (treasuryCache.lastFetch > now - oneMinute && treasuryCache.data) {
        return treasuryCache.data; // Return cached data if it's less than 1 minute old
    }

    // Fetch new data
    const ophirTreasuryMigalooAssets = await axios.get('https://migaloo.explorer.interbloc.org/account/migaloo10gj7p9tz9ncjk7fm7tmlax7q6pyljfrawjxjfs09a7e7g933sj0q7yeadc');
    const ophirVaultMigalooAssets = await axios.get('https://migaloo.explorer.interbloc.org/account/migaloo14gu2xfk4m3x64nfkv9cvvjgmv2ymwhps7fwemk29x32k2qhdrmdsp9y2wu');
    const migalooHotWallet = await axios.get('https://migaloo.explorer.interbloc.org/account/migaloo19gc2kclw3ynjxl7wsddm5p08r5hu8a0gvzc4t3')
    const allianceStakingAssets = await axios.get('https://phoenix-lcd.terra.dev/cosmwasm/wasm/v1/contract/terra1jwyzzsaag4t0evnuukc35ysyrx9arzdde2kg9cld28alhjurtthq0prs2s/smart/ew0KICAiYWxsX3N0YWtlZF9iYWxhbmNlcyI6IHsNCiAgICAiYWRkcmVzcyI6ICJ0ZXJyYTFoZzU1ZGpheWNyd2dtMHZxeWR1bDNhZDNrNjRqbjBqYXRudWg5d2p4Y3h3dHhyczZteHpzaHhxamYzIg0KICB9DQp9');
    const allianceStakingRewards = await axios.get('https://phoenix-lcd.terra.dev/cosmwasm/wasm/v1/contract/terra1jwyzzsaag4t0evnuukc35ysyrx9arzdde2kg9cld28alhjurtthq0prs2s/smart/ewogICJhbGxfcGVuZGluZ19yZXdhcmRzIjogeyJhZGRyZXNzIjoidGVycmExaGc1NWRqYXljcndnbTB2cXlkdWwzYWQzazY0am4wamF0bnVoOXdqeGN4d3R4cnM2bXh6c2h4cWpmMyJ9Cn0=');
    const allianceMigalooStakingAssets = await axios.get('https://ww-migaloo-rest.polkachu.com/cosmwasm/wasm/v1/contract/migaloo190qz7q5fu4079svf890h4h3f8u46ty6cxnlt78eh486k9qm995hquuv9kd/smart/ewogICJzdGFrZWRfYmFsYW5jZSI6IHsiYWRkcmVzcyI6Im1pZ2Fsb28xeDZuOXpnNjNhdWh0dXZndWN2bmV6MHdobmFhZW1xcGdybmwwc2w4dmZnOWhqdmVkNzZwcW5ndG1nayIsCiAgICJhc3NldCI6ewogICAgICAgIm5hdGl2ZSI6ImZhY3RvcnkvbWlnYWxvbzFheHR6NHk3anl2ZGtrcmZsa252OWRjdXQ5NHhyNWs4bTZ3ZXRlNHJkcnc0ZnVwdGs4OTZzdTQ0eDJ6L3VMUCIKICAgfSAgIAogICAgICAKICB9CiAgCn0=');
    const allianceMigalooStakingRewards = await axios.get('https://ww-migaloo-rest.polkachu.com/cosmwasm/wasm/v1/contract/migaloo190qz7q5fu4079svf890h4h3f8u46ty6cxnlt78eh486k9qm995hquuv9kd/smart/eyJhbGxfcGVuZGluZ19yZXdhcmRzIjp7ImFkZHJlc3MiOiJtaWdhbG9vMXg2bjl6ZzYzYXVodHV2Z3Vjdm5lejB3aG5hYWVtcXBncm5sMHNsOHZmZzloanZlZDc2cHFuZ3RtZ2sifX0=');
    const stakedSailAmount = await axios.get('https://indexer.daodao.zone/osmosis-1/contract/osmo14gz8xpzm5sj9acxfmgzzqh0strtuyhce08zm7pmqlkq6n4g5g6wq0924n8/daoVotingTokenStaked/votingPower?address=osmo1esa9vpyfnmew4pg4zayyj0nlhgychuv5xegraqwfyyfw4ral80rqn7sdxf');
    const osmosisWWBondedAssets = await axios.get('https://lcd.osmosis.zone/cosmwasm/wasm/v1/contract/osmo1mfqvxmv2gx62hglaegdv3useqjj44kxrl69nlt4tkysy9dx8g25sq40kez/smart/ewogICJib25kZWQiOiB7CiAgICAiYWRkcmVzcyI6ICJvc21vMXR6bDAzNjJsZHRzcmFkc2duNGdtdThwZDg3OTRxank2NmNsOHEyZmY0M2V2Y2xnd2Q3N3MycXZ3bDYiCiAgfQp9');
    const ampRoarAllianceStaked = await axios.get('https://phoenix-lcd.terra.dev/terra/alliances/delegations/terra1hg55djaycrwgm0vqydul3ad3k64jn0jatnuh9wjxcxwtxrs6mxzshxqjf3');
    const ampRoarAllianceRewards = await axios.get('https://phoenix-lcd.erisprotocol.com/terra/alliances/rewards/terra1hg55djaycrwgm0vqydul3ad3k64jn0jatnuh9wjxcxwtxrs6mxzshxqjf3/terravaloper120ppepaj2lh5vreadx42wnjjznh55vvktp78wk/factory%252Fterra1vklefn7n6cchn0u962w3gaszr4vf52wjvd4y95t2sydwpmpdtszsqvk9wy%252FampROAR');
    const osmosisAlliancewBTCRewards = await axios.get('https://celatone-api-prod.alleslabs.dev/rest/osmosis/osmosis-1/cosmwasm/wasm/v1/contract/osmo1ec7fqky6cq9xds6hq0e46f25ldnkkvjjkml7644y8la59ucqmtfsyyhh75/smart/ew0KICAiY2xhaW1hYmxlIjogew0KICAgICJhZGRyZXNzIjogIm9zbW8xdHpsMDM2MmxkdHNyYWRzZ240Z211OHBkODc5NHFqeTY2Y2w4cTJmZjQzZXZjbGd3ZDc3czJxdndsNiINCiAgfQ0KfQ==');

    parseOphirDaoTreasury(ophirTreasuryMigalooAssets.data, ophirVaultMigalooAssets.data, migalooHotWallet.data, allianceStakingAssets.data.data, allianceStakingRewards.data.data, allianceMigalooStakingAssets.data.data, allianceMigalooStakingRewards.data.data, stakedSailAmount.data, osmosisWWBondedAssets.data, ampRoarAllianceStaked.data, ampRoarAllianceRewards.data);
    let treasuryValues = await caclulateAndAddTotalTreasuryValue(adjustDecimals(totalTreasuryAssets))
    // console.log(adjustDecimals(totalTreasuryAssets))
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

    return treasuryCache.data
}

async function getPrices(){
    let statData;
    const now = Date.now();
    const cacheTimeLimit = 250000; // 60000 milliseconds in a minute
    // Check if cache is valid
    if (now - cache.lastFetch > cacheTimeLimit || !cache.coinPrices) {
        statData = await fetchStatData(); // Fetch new data if cache is older than cacheTimeLimit or coinPrices is not cached
    }
    const whalePrice = statData?.coinPrices['whale'] || cache?.coinPrices['whale'];
    const whiteWhalePoolFilteredData = filterPoolsWithPrice(statData?.whiteWhalePoolRawData.data || cache.whiteWhalePoolRawData.data) || 0;
    const ophirWhaleLpPrice = getLPPrice(cache?.ophirWhalePoolData.data, whiteWhalePoolFilteredData["OPHIR-WHALE"], whalePrice);
    const whalewBtcLpPrice = getWhalewBtcLPPrice(cache?.whalewBtcPoolData.data, whiteWhalePoolFilteredData["WHALE-wBTC"], whalePrice, statData?.coinPrices['wBTC']?.usd || cache?.coinPrices['wBTC']);
    const sailWhaleLpData = await axios.get('https://lcd.osmosis.zone/cosmwasm/wasm/v1/contract/osmo1w8e2wyzhrg3y5ghe9yg0xn0u7548e627zs7xahfvn5l63ry2x8zstaraxs/smart/ewogICJwb29sIjoge30KfQo=');
    const ampKujiPrice = await axios.get('https://lcd-kujira.whispernode.com/oracle/denoms/AMPKUJI/exchange_rate');
    const kujiPrice = await axios.get('https://lcd-kujira.whispernode.com/oracle/denoms/KUJI/exchange_rate');
    
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
        kuji: Number(kujiPrice.data.exchange_rate),
        ampKuji: Number(ampKujiPrice.data.exchange_rate),
        whalewBtcLp: whalewBtcLpPrice,
        shd: statData?.coinPrices["shd"] || cache?.coinPrices['shd'],
        lvn: statData?.coinPrices["lvn"] || cache?.coinPrices['lvn'],
        juno: statData?.coinPrices["juno"] || cache?.coinPrices['juno'],
        inj: statData?.coinPrices["inj"] || cache?.coinPrices['inj'],
        osmo: statData?.coinPrices["osmo"] || cache?.coinPrices['osmo'],
        usdt: statData?.coinPrices["usdt"] || cache?.coinPrices['usdt'],
        sei: statData?.coinPrices["sei"] || cache?.coinPrices['sei'],
        atom: statData?.coinPrices["atom"] || cache?.coinPrices['atom'],
        cmdx: statData?.coinPrices["cmdx"] || cache?.coinPrices['cmdx'],
        huahua: statData?.coinPrices["huahua"] || cache?.coinPrices['huahua'],
        lunc: statData?.coinPrices["lunc"] || cache?.coinPrices['lunc'],
        sail: getSailPriceFromLp(sailWhaleLpData.data, whalePrice),
        roar: statData?.coinPrices["roar"] || cache?.coinPrices['roar'],
        ampRoar: statData?.coinPrices["ampRoar"] || cache?.coinPrices['ampRoar'],
        ampUSDC: statData?.coinPrices['usdc']*MUSDC_ERIS_CONSTANT || cache?.coinPrices['usdc']*MUSDC_ERIS_CONSTANT,
        axlUSDC: statData?.coinPrices['usdc'] || cache?.coinPrices['usdc']
    }
    return prices;
}

async function getTreasuryValues(priceData, treasuryAssets) {
    const result = Object.keys(treasuryAssets).reduce((acc, assetKey) => {
      // Skip non-asset properties
      if (["totalTreasuryValue", "treasuryValueWithoutOphir", "ophirRedemptionPrice"].includes(assetKey)) return acc;
  
      const asset = treasuryAssets[assetKey];
      const assetPrice = priceData[assetKey];
      if (!assetPrice || isNaN(assetPrice)) return acc; // Skip if price is 0 or NaN
  
      let assetValue = assetPrice * parseFloat(asset.balance);
      if (!assetValue || isNaN(assetValue)) return acc; // Skip if calculated value is 0 or NaN
  
      acc.push({
        [assetKey]: {
          price: assetPrice,
          value: assetValue,
          asset: asset.balance,
          timestamp: new Date().toISOString()
        }
      });
  
      return acc;
    }, []);
  
    return result;
  }
  
  async function pushTreasuryValuesToFirebase(treasuryValues, priceData) {
    const previouslyRecordedDenoms = await fetchPreviouslyRecordedDenoms();
    const currentDenoms = treasuryValues.map(item => Object.keys(item)[0]);

    const missingDenoms = previouslyRecordedDenoms.filter(denom => 
        !currentDenoms.includes(denom));

    for (const item of treasuryValues) {
        const assetName = Object.keys(item)[0];
        const assetDataRef = firebaseOphirTreasury.child(assetName);
        await assetDataRef.transaction(currentData => {
            // Ensure currentData is an array before attempting to push
            if (currentData === null) {
                return [item[assetName]];
            } else if (Array.isArray(currentData)) {
                currentData.push(item[assetName]);
                return currentData;
            } else {
                // Handle the case where currentData is not an array
                return [currentData].concat(item[assetName]);
            }
        }).catch((error) => {
            console.error('Error updating data in Firebase:', error);
        });
    }

    for (const denom of missingDenoms) {
        const price = priceData[denom] || 0;
        const finalRecord = {
            asset: 0,
            price: price,
            timestamp: new Date().toISOString(),
            value: 0
        };

        const assetDataRef = firebaseOphirTreasury.child(denom);
        await assetDataRef.transaction(currentData => {
            // Check if the last record indicates the asset has already been finalized
            if (Array.isArray(currentData) && currentData.length > 0) {
                const lastRecord = currentData[currentData.length - 1];
                if (lastRecord.asset === 0 && lastRecord.value === 0) {
                    // Skip updating since the last record indicates finalization
                    return currentData;
                }
            }

            // Ensure currentData is an array before attempting to push
            if (currentData === null) {
                return [finalRecord];
            } else if (Array.isArray(currentData)) {
                currentData.push(finalRecord);
                return currentData;
            } else {
                // Handle the case where currentData is not an array
                return [currentData].concat(finalRecord);
            }
        }).catch((error) => {
            console.error('Error updating data in Firebase for missing denom:', error);
        });
    }

    console.log("Treasury Data Saved");
}

async function fetchPreviouslyRecordedDenoms() {
    const snapshot = await firebaseOphirTreasury.once('value');
    const data = snapshot.val();
    const denoms = [];

    // Assuming each child key is a denom name
    for (const denomName in data) {
        denoms.push(denomName);
    }

    return denoms;
}

const fetchDataAndStore = async () => {
    try {
      // Fetching price data
      const priceData = await getPrices(); 
      // Fetching treasury assets
      const treasuryAssets = await getTreasuryAssets(); 
  
      const combinedData = await getTreasuryValues(priceData, treasuryAssets);
      // Storing data in Firebase
      pushTreasuryValuesToFirebase(combinedData, priceData);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  let assetDataCache = {};

// Endpoint to get historical treasury data for a specific asset
router.get('/treasury/chartData/:assetName', async (req, res) => {
    const { assetName } = req.params;
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000; // 15 minutes in milliseconds
  
    // Check if the asset data is cached and still valid
    if (assetDataCache[assetName] && (now - assetDataCache[assetName].timestamp < fifteenMinutes)) {
      return res.json(assetDataCache[assetName].data);
    }
  
    const assetDataRef = firebaseOphirTreasury.child(assetName);
  
    try {
      const snapshot = await assetDataRef.once('value');
      let data = snapshot.val();
  
      if (data && data.length > 0) { // Check if data exists and is not empty
        // Cache the data with a timestamp
        assetDataCache[assetName] = {
          timestamp: now,
          data: data
        };
        res.json(data);
      } else {
        res.status(404).send('Asset data not found or no data in the specified date range');
      }
    } catch (error) {
      console.error('Error fetching treasury data:', error);
      res.status(500).send('Internal server error');
    }
  });

let treasuryChartDataCache = {
    lastFetch: 0,
    data: null
};

// Endpoint to get all treasury data
router.get('/treasury/chartData', async (req, res) => {
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000; // 15 minutes in milliseconds

    // Check if cache is valid
    if (now - treasuryChartDataCache.lastFetch < fifteenMinutes && treasuryChartDataCache.data) {
        return res.json(treasuryChartDataCache.data);
    }

    try {
        const snapshot = await firebaseOphirTreasury.once('value');
        const data = snapshot.val();
        if (data) {
            // Update cache with new data and timestamp
            treasuryChartDataCache = {
                data: data,
                lastFetch: now
            };
            res.json(data);
        } else {
            res.status(404).send('No treasury data found');
        }
    } catch (error) {
        console.error('Error fetching all treasury data:', error);
        res.status(500).send('Internal server error');
    }
});

let totalValueChartDataCache = {
    lastFetch: 0,
    data: null
};

router.get('/treasury/totalValueChartData', async (req, res) => {
    const now = Date.now();
    const twelveHoursInMilliseconds = 12 * 60 * 60 * 1000;

    // Check if the cache is valid
    if (now - totalValueChartDataCache.lastFetch < twelveHoursInMilliseconds && totalValueChartDataCache.data) {
        // Cache is valid, return the cached data
        return res.json(totalValueChartDataCache.data);
    }

    try {
        const snapshot = await firebaseOphirTreasury.once('value');
        const data = snapshot.val();
        if (!data) {
            return res.status(404).send('No treasury data found');
        }

        const dailySummaries = Object.keys(data).reduce((acc, assetName) => {
            const assetData = data[assetName];
            // Track assets added for each day to prevent duplicates
            const addedAssetsForDay = {};
            assetData.forEach(item => {
                const timestamp = new Date(item.timestamp);
                const date = timestamp.toISOString().split('T')[0]; // Get date in YYYY-MM-DD format
                const utcHour = timestamp.getUTCHours();
                const utcMinutes = timestamp.getUTCMinutes();

                // Check if timestamp is between 12:00 PM UTC and 12:05 PM UTC
                if (utcHour === 12 && utcMinutes >= 0 && utcMinutes <= 5) {
                    // Initialize the array for the date if it doesn't exist
                    if (!addedAssetsForDay[date]) {
                        addedAssetsForDay[date] = [];
                    }
                    // Check if the asset has already been added for the day
                    if (addedAssetsForDay[date].includes(assetName)) {
                        // Skip this asset since it's already been counted for the day
                        return;
                    }
                    if (!acc[date]) {
                        acc[date] = { totalValue: 0 };
                    }
                    acc[date].totalValue += item.value;
                    // Mark this asset as added for the day
                    addedAssetsForDay[date].push(assetName);
                }
            });
            return acc;
        }, {});

        // Convert the summaries into an array format
        const summariesArray = Object.keys(dailySummaries).map(date => ({
            date: date,
            totalValue: dailySummaries[date].totalValue
        }));

        // Update the cache
        totalValueChartDataCache = {
            lastFetch: now,
            data: summariesArray
        };

        res.json(summariesArray);
    } catch (error) {
        console.error('Error fetching daily treasury summary:', error);
        res.status(500).send('Internal server error');
    }
});

router.get('/seeker-vesting', async (req, res) => {
    const { contractAddress } = req.query;
    if (!contractAddress) {
        return res.status(400).send('Contract address is required');
    }

    try {
        const vestingQuery = {
            available_amount: {
                address: contractAddress
            }
        };
        let vestingStart;
        let vestingEnd;
        const formattedJsonString = JSON.stringify(vestingQuery, null, 1); // This adds spaces in the JSON string
        const encodedQuery = Buffer.from(formattedJsonString).toString('base64');
        const vestingDetailsUrl = `https://ww-migaloo-rest.polkachu.com/cosmwasm/wasm/v1/contract/migaloo10uky7dtyfagu4kuxvsm26cvpglq25qwlaap2nzxutma594h6rx9qxtk9eq/smart/${encodedQuery}`;
        let vestingDetails;
        try {
            const vestingAccountsUrl = 'https://ww-migaloo-rest.polkachu.com/cosmwasm/wasm/v1/contract/migaloo10uky7dtyfagu4kuxvsm26cvpglq25qwlaap2nzxutma594h6rx9qxtk9eq/smart/eyAidmVzdGluZ19hY2NvdW50cyI6IHt9fQ==';
            const vestingAccountsResponse = await axios.get(vestingAccountsUrl);
            
            if (vestingAccountsResponse.data && vestingAccountsResponse.data.data) {
                const vestingAccountsData = vestingAccountsResponse.data.data.vesting_accounts;
                const matchingAccount = vestingAccountsData.find(account => account.address === contractAddress);
                console.log(matchingAccount);
                if (matchingAccount) {
                    const { start_point, end_point } = matchingAccount.info.schedules[0];
                    vestingStart = start_point.time;
                    vestingEnd = end_point.time;
                }
            }

            const response = await axios.get(vestingDetailsUrl);
            if (response.data && response.data.data) {
                vestingDetails = {
                    amount: response.data.data / 1000000,
                    date: new Date().toISOString() // Assuming the current date as vesting date for simplicity
                };
            }

            // Fetch additional vesting accounts data
            
        } catch (error) {
            console.error('Error fetching vesting details:', error);
            vestingDetails = null;
        }

        if (!vestingDetails) {
            return res.status(404).send('Vesting details not found for the given contract address');
        }

        const response = {
            address: contractAddress,
            amountVesting: vestingDetails.amount,
            vestingStart: vestingStart, // Assuming the date is stored in a readable format
            vestingEnd: vestingEnd
        };

        res.json(response);
    } catch (error) {
        console.error('Error fetching vesting details:', error);
        res.status(500).send('Internal server error');
    }
});

router.get('/calculateRedemptionValue', async (req, res) => {
    const { amount } = req.query; // The amount to calculate the redemption value for

    try {
        // Assuming getStats, getTreasury, and getPrice are existing functions that fetch the required data
        // const stats = await fetchStatData();
        const treasury = await getTreasuryAssets();
        const price = await getPrices();

        // console.log(treasury)
        const redemptionPrice = Number(treasury.ophirRedemptionPrice); // Ensuring redemptionPrice is a number
        // console.log(redemptionPrice)
        const totalValue = Number(amount) * redemptionPrice; // Ensuring both amount and redemptionPrice are numbers
        const treasuryAssetCount = Object.keys(treasury).reduce((count, key) => {
            if (key !== 'ophir' && treasury[key] != null) {
                return count + 1;
            }
            return count;
        }, 0);
        const treasuryValueWithoutOphir = parseFloat(treasury['treasuryValueWithoutOphir'].replace(/,/g, ''));
        const assetPercentages = Object.keys(treasury).reduce((acc, key) => {
            if (key === 'ophir' || key === 'treasuryValueWithoutOphir' || !treasury[key].balance || !price[key]) return acc; // Skip if key is 'ophir', 'treasuryValueWithoutOphir', balance or price is null

            const assetValue = Number(treasury[key].balance) * price[key]; // Ensuring both balance and price are numbers
            const assetPercentage = assetValue / treasuryValueWithoutOphir;
            acc[key] = assetPercentage; // Storing the percentage

            return acc;
        }, {});
        // console.log(assetPercentages)
        const adjustedValues = Object.keys(assetPercentages).reduce((acc, key) => {
            acc[key] = totalValue * assetPercentages[key];
            return acc;
        }, {});
        // console.log(adjustedValues);
        const finalValues = Object.keys(adjustedValues).reduce((acc, key) => {
            acc[key] = adjustedValues[key] / price[key];
            return acc;
        }, {});
        console.log(finalValues);

        res.json({...finalValues, redemptionPricePerOPHIR: redemptionPrice, totalRedemptionValue: totalValue, calculatedAt: new Date().toISOString()});
    } catch (error) {
        console.error('Error calculating redemption value:', error);
        res.status(500).send('Internal server error');
    }
});

router.get('/totalTreasuryValue', async (req, res) => {
    try {
        let totalTreasuryValue;
        // Check if the value exists in the global treasuryCache
        if (treasuryCache && treasuryCache.totalTreasuryValue) {
            totalTreasuryValue = treasuryCache.totalTreasuryValue;
        } else {
            // If not, call getTreasuryAssets to fetch the data
            const treasury = await getTreasuryAssets();
            totalTreasuryValue = treasury.totalTreasuryValue;
        }

        // Send the totalTreasuryValue as a response
        res.json({ totalTreasuryValue });
    } catch (error) {
        console.error('Error fetching total treasury value:', error);
        res.status(500).send('Internal server error');
    }
});

router.get('/cleanChartData', async (req, res) => {
    try {
        const snapshot = await firebaseOphirTreasury.once('value');
        const data = snapshot.val();

        if (!data) {
            return res.status(404).send('No chart data found');
        }

        // Object to log assets with price: 0 and their indexes
        const zeroPriceLog = {};

        // Iterate through each asset in the treasury data
        for (const assetName in data) {
            const assetData = data[assetName];
            const originalLength = assetData.length;

            // Filter out data points with price: 0 and log them
            const cleanedData = assetData.filter((item, index) => {
                const hasZeroPrice = item.price === 0;
                if (hasZeroPrice) {
                    zeroPriceLog[assetName] = zeroPriceLog[assetName] || [];
                    zeroPriceLog[assetName].push(index);
                }
                return !hasZeroPrice;
            });

            // Update Firebase with the cleaned data only if any data points were removed
            if (cleanedData.length < originalLength) {
                firebaseOphirTreasury.child(assetName).set(cleanedData)
                .then(() => {
                    console.log(`${assetName} data saved successfully.`);
                })
                .catch((error) => {
                    console.error(`Error saving ${assetName} data:`, error);
                });
            }
        }

        // Log assets with price: 0 and their indexes
        console.log("Assets with price: 0 and their indexes:", zeroPriceLog);

        res.send('Chart data cleaned successfully');
    } catch (error) {
        console.error('Error cleaning chart data:', error);
        res.status(500).send('Internal server error');
    }
});

router.get('/denoms', async (req, res) => {
    try {
        const invertedMappings = Object.keys(tokenMappings).reduce((acc, key) => {
            const symbol = tokenMappings[key].symbol;
            acc[symbol] = key;
            return acc;
        }, {});
        res.status(200).json(invertedMappings);
    } catch (error) {
        console.error('Error fetching denoms with symbols:', error);
        res.status(500).send('Internal server error');
    }
});


router.get('/', (req, res) => {
    const routes = [];
    router.stack.forEach((middleware) => {
        if (middleware.route) { // if it's a real route
            routes.push(middleware.route.path);
        }
    });
    res.status(200).json({ availableEndpoints: routes });
});


// Run fetchDataAndStore every 15 minutes
setInterval(fetchDataAndStore, 15 * 60 * 1000);


module.exports = router;
