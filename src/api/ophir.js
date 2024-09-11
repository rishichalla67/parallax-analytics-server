const express = require("express");
const axios = require("axios");
const { CosmWasmClient } = require("@cosmjs/cosmwasm-stargate");
const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing");
const { StargateClient, QueryClient } = require("@cosmjs/stargate");
const { setupWasmExtension } = require("@cosmjs/cosmwasm-stargate");
const { getDatabase } = require("firebase-admin/database");
const admin = require("firebase-admin");
const OPHIR_TOTAL_SUPPLY = 1000000000;
const OPHIR =
  "factory/migaloo1t862qdu9mj5hr3j727247acypym3ej47axu22rrapm4tqlcpuseqltxwq5/ophir";
const WBTC =
  "ibc/6E5BF71FE1BEBBD648C8A7CB7A790AEF0081120B2E5746E6563FC95764716D61";
const LUNA =
  "ibc/4627AD2524E3E0523047E35BB76CC90E37D9D57ACF14F0FCBCEB2480705F3CB8";
const AMPROAR_ERIS_CONSTANT = 1.04;
const MOAR_ERIS_CONSTANT = 1.3984;
const MUSDC_ERIS_CONSTANT = 1.2124;
const AMPBTC_ERIS_CONSTANT = 1.029;
const BLUNA_CONSTANT = 1 / 0.79007;
const BOSMO_CONSTANT = 1 / 0.956234;
const AMPOSMO_ERIS_CONSTANT = 1.1318;
const AMPLUNA_ERIS_CONSTANT = 1.3356;
const AMPWHALET_ERIS_CONSTANT = 1.6386;
const BWHALET_CONSTANT = 1.5317;
const UNSOLD_OPHIR_FUZION_BONDS = 47175732.096;
const LAB_DENOM = "factory/osmo17fel472lgzs87ekt9dvk0zqyh5gl80sqp4sk4n/LAB";
const RSTK_DENOM =
  "ibc/04FAC73DFF7F1DD59395948F2F043B0BBF978AD4533EE37E811340F501A08FFB";
const ROAR_DENOM =
  "ibc/98BCD43F190C6960D0005BC46BB765C827403A361C9C03C2FF694150A30284B0";
const SHARK_DENOM =
  "ibc/64D56DF9EC69BE554F49EBCE0199611062FF1137EF105E2F645C1997344F3834";
const USDC_DENOM =
  "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";
const AMP_WHALE =
  "factory/migaloo1436kxs0w2es6xlqpp9rd35e3d0cjnw4sv8j3a7483sgks29jqwgshqdky4/ampWHALE";
const B_WHALE =
  "factory/migaloo1mf6ptkssddfmxvhdx0ech0k03ktp6kf9yk59renau2gvht3nq2gqdhts4u/boneWhale";

const cache = {
  lastFetch: 0,
  whiteWhalePoolRawData: null,
  ophirCirculatingSupply: null,
  coinPrices: null,
  ophirStakedSupplyRaw: null,
};
var serviceAccount = require("../../resources/firebase/firebase-admin.json");
const symbolDenomMap = {
  "chihuahua-token": "huahua",
  comdex: "cmdx",
  cosmos: "atom",
  "injective-protocol": "inj",
  "juno-network": "juno",
  "levana-protocol": "lvn",
  "lion-dao": "roar",
  osmosis: "osmo",
  "sei-network": "sei",
  "shade-protocol": "shd",
  "terra-luna": "lunc",
  "terra-luna-2": "luna",
  tether: "usdt",
  "usd-coin": "usdc",
  "white-whale": "whale",
  "wrapped-bitcoin": "wBTC",
};
const priceAssetList = ["wBTC.axl"];
let treasuryCache = {
  lastFetch: 0, // Timestamp of the last fetch
  treasuryValues: null, // Cached data
};
let treasuryBalances,
  treasuryDelegations,
  treasuryUnbondings,
  treasuryRedelegations,
  totalTreasuryAssets,
  prices;
const CACHE_IN_MINUTES = 5 * 60 * 1000; // 5 minutes in milliseconds

const kujiraGhostContracts = {
  kujira143fwcudwy0exd6zd3xyvqt2kae68ud6n8jqchufu7wdg5sryd4lqtlvvep: {
    contract: "xkuji",
  },
  kujira1jelmu9tdmr6hqg0d6qw4g6c9mwrexrzuryh50fwcavcpthp5m0uq20853h: {
    contract: "xusdc",
  },
  kujira1w4yaama77v53fp0f9343t9w2f932z526vj970n2jv5055a7gt92sxgwypf: {
    contract: "xusk",
  },
  kujira1xhxefc8v3tt0n75wpzfqcrukzyfneyttdppqst84zzdxnf223m2qm4g5at: {
    contract: "xwbtc",
  },
  kujira1e224c8ry0nuun5expxm00hmssl8qnsjkd02ft94p3m2a33xked2qypgys3: {
    contract: "xaxlusdc",
  },
  kujira195zfkf8uzufmwhc4zzclythlh43m2rme2rd3rlstt6c7yzw386xqskc02y: {
    contract: "xlunc",
  },
  kujira1ya42knfcsvy6eztegsn3hz7zpjvhzn05ge85xa2dy2zrjeul9hnspp3c06: {
    contract: "xmnta",
  },
  kujira1e6kvcdpxtu30t8x9sx0k692tln9z636gyu8sqf6w5fm5z3jrvjjqc8qfkr: {
    contract: "xatom",
  },
};

const tokenMappings = {
  "ibc/517E13F14A1245D4DE8CF467ADD4DA0058974CDCC880FA6AE536DBCA1D16D84E": {
    symbol: "bWhale",
    decimals: 6,
  },
  "ibc/917C4B1E92EE2F959FC11ECFC435C4048F97E8B00F9444592706F4604F24BF25": {
    symbol: "bWhale",
    decimals: 6,
  },
  "ibc/B3F639855EE7478750CC8F82072307ED6E131A8EFF20345E1D136B50C4E5EC36": {
    symbol: "ampWhale",
    decimals: 6,
  },
  "ibc/834D0AEF380E2A490E4209DFF2785B8DBB7703118C144AC373699525C65B4223": {
    symbol: "ampWhale",
    decimals: 6,
  },
  "factory/migaloo1t862qdu9mj5hr3j727247acypym3ej47axu22rrapm4tqlcpuseqltxwq5/ophir":
    { symbol: "ophir", decimals: 6 },
  uwhale: { symbol: "whale", decimals: 6 },
  uluna: { symbol: "luna", decimals: 6 },
  "ibc/EDD6F0D66BCD49C1084FB2C35353B4ACD7B9191117CE63671B61320548F7C89D": {
    symbol: "whale",
    decimals: 6,
  },
  "ibc/EA459CE57199098BA5FFDBD3194F498AA78439328A92C7D136F06A5220903DA6": {
    symbol: "ampWHALEt",
    decimals: 6,
  },
  "ibc/6E5BF71FE1BEBBD648C8A7CB7A790AEF0081120B2E5746E6563FC95764716D61": {
    symbol: "wBTC",
    decimals: 8,
  },
  "ibc/EF4222BF77971A75F4E655E2AD2AFDDC520CE428EF938A1C91157E9DFBFF32A3": {
    symbol: "kuji",
    decimals: 6,
  },
  "ibc/50D7251763B4D5E9DD7A8A6C6B012353E998CDE95C546C1F96D68F7CCB060918": {
    symbol: "ampKuji",
    decimals: 6,
  },
  "ibc/B65E189D3168DB40C88C6A6C92CA3D3BB0A8B6310325D4C43AB5702F06ECD60B": {
    symbol: "wBTCaxl",
    decimals: 8,
  },
  "ibc/4627AD2524E3E0523047E35BB76CC90E37D9D57ACF14F0FCBCEB2480705F3CB8": {
    symbol: "luna",
    decimals: 6,
  },
  "factory/migaloo1erul6xyq0gk6ws98ncj7lnq9l4jn4gnnu9we73gdz78yyl2lr7qqrvcgup/ash":
    { symbol: "ash", decimals: 6 },
  "factory/migaloo1p5adwk3nl9pfmjjx6fu9mzn4xfjry4l2x086yq8u8sahfv6cmuyspryvyu/uLP":
    { symbol: "ophirWhaleLp", decimals: 6 },
  "factory/migaloo1axtz4y7jyvdkkrflknv9dcut94xr5k8m6wete4rdrw4fuptk896su44x2z/uLP":
    { symbol: "whalewBtcLp", decimals: 6 },
  "factory/migaloo1xv4ql6t6r8zawlqn2tyxqsrvjpmjfm6kvdfvytaueqe3qvcwyr7shtx0hj/uLP":
    { symbol: "usdcWhaleLp", decimals: 6 },
  "factory/osmo1rckme96ptawr4zwexxj5g5gej9s2dmud8r2t9j0k0prn5mch5g4snzzwjv/sail":
    { symbol: "sail", decimals: 6 },
  "factory/terra1vklefn7n6cchn0u962w3gaszr4vf52wjvd4y95t2sydwpmpdtszsqvk9wy/ampROAR":
    { symbol: "ampRoar", decimals: 6 },
  "factory/migaloo1cwk3hg5g0rz32u6us8my045ge7es0jnmtfpwt50rv6nagk5aalasa733pt/ampUSDC":
    { symbol: "ampUSDC", decimals: 6 },
  "ibc/BC5C0BAFD19A5E4133FDA0F3E04AE1FBEE75A4A226554B2CBB021089FF2E1F8A": {
    symbol: "usdc",
    decimals: 6,
  },
  "ibc/40C29143BF4153B365089E40E437B7AA819672646C45BB0A5F1E10915A0B6708": {
    symbol: "bluna",
    decimals: 6,
  },
  "ibc/05238E98A143496C8AF2B6067BABC84503909ECE9E45FBCBAC2CBA5C889FD82A": {
    symbol: "ampLuna",
    decimals: 6,
  },
  "factory/kujira16rujrka8vk3c7l7raa37km8eqcxv9z583p3c6e288q879rwp23ksy6efce/bOPHIR01":
    { symbol: "bOPHIR01", decimals: 6 },
  "ibc/2C962DAB9F57FE0921435426AE75196009FAA1981BF86991203C8411F8980FDB": {
    symbol: "usdc",
    decimals: 6,
  }, //axlusdc transfer/channel-253
  "ibc/B3504E092456BA618CC28AC671A71FB08C6CA0FD0BE7C8A5B5A3E2DD933CC9E4": {
    symbol: "usdc",
    decimals: 6,
  }, //axlUsdc transfer/channel-6 crypto-org-chain-mainnet-1 channel-56
  "ibc/36A02FFC4E74DF4F64305130C3DFA1B06BEAC775648927AA44467C76A77AB8DB": {
    symbol: "whale",
    decimals: 6,
  },
  "factory/osmo17fel472lgzs87ekt9dvk0zqyh5gl80sqp4sk4n/LAB": {
    symbol: "lab",
    decimals: 6,
  },
  "ibc/64D56DF9EC69BE554F49EBCE0199611062FF1137EF105E2F645C1997344F3834": {
    symbol: "shark",
    decimals: 6,
  },
  "ibc/E54A0C1E4A2A79FD4F92765F68E38939867C3DA36E2EA6BBB2CE81C43F4C8ADC": {
    symbol: "bWHALEt",
    decimals: 6,
  },
  "ibc/1480B8FD20AD5FCAE81EA87584D269547DD4D436843C1D20F15E00EB64743EF4": {
    symbol: "akt",
    decimals: 6,
  },
  "factory/migaloo1pll95yfcnxd5pkkrcsad63l929m4ehk4c46fpqqp3c2d488ca0csc220d0/ampBTC":
    { symbol: "ampBTC", decimals: 8 },
  "ibc/DAB7EEB14B61CA588F013729604B01017A5FE0E860E1CCBAA5A1A5D9763737D6": {
    symbol: "moar",
    decimals: 6,
  },
};

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL:
      "https://parallax-analytics-server-default-rtdb.firebaseio.com",
  });
}

const db = getDatabase();
const firebaseOphirTreasury = db.ref("crypto/ophir/treasury");
const router = express.Router();
// const redisClient = redis.createClient({
//   // url: `${process.env.REDIS_URL}`
//   url: "redis://:8R3rayhaJe66wIYQRKaY7UnsnlWBDvi4@redis-15972.c274.us-east-1-3.ec2.cloud.redislabs.com:15972"
// });
// redisClient.connect();

function filterPoolsWithPrice(data) {
  // Check if data is an array, return an empty object if not
  if (!Array.isArray(data)) {
    console.error("Expected an array but received:", data);
    return {};
  }

  const filteredData = data
    .filter((item) => parseFloat(item.ratio) > 0)
    .reduce((acc, item) => {
      acc[item.pool_id] = parseFloat(item.ratio);
      return acc;
    }, {});

  return filteredData;
}

function getOphirContractBalance(data) {
  const ophirTokenInfo = tokenMappings[OPHIR];
  console.log("BALANCES DATA: ", data);
  ubalance = data.balances[OPHIR];
  balance = ubalance / Math.pow(10, ophirTokenInfo.decimals);
  return balance;
}

function getMigalooContractBalance(data, tokenId = OPHIR) {
  const tokenInfo = tokenMappings[tokenId];
  if (!tokenInfo) {
    console.error(`Token info not found for tokenId: ${tokenId}`);
    return 0; // or handle this case as needed
  }

  try {
    const ubalance = Number(data[0].amount); // Using BigInt for large numbers
    const balance = ubalance / Math.pow(10, tokenInfo.decimals);
    return Number(balance); // Convert back to Number if necessary, or keep as BigInt depending on use case
  } catch (error) {
    console.error("Error calculating balance:", error);
    return 0; // or handle this case as needed
  }
}

const formatNumber = (number, decimal) => {
  return number.toLocaleString("en-US", {
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

    axios
      .get(url)
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        console.error(`Failed to fetch from ${url}:`, error.message);
        resolve(fallback); // Resolve with fallback on error
      });
  });
}
const migalooRPC = "https://migaloo-rpc.polkachu.com/";
const osmosisRPC = "https://osmosis-rpc.polkachu.com/";
const terraRPC = "https://terra-rpc.polkachu.com/";

async function queryContract(contractAddress, queryMsg, chain) {
  let rpc;
  if (chain === "migaloo") {
    rpc = migalooRPC;
  } else if (chain === "osmosis") {
    rpc = osmosisRPC;
  } else if (chain === "terra") {
    rpc = terraRPC;
  }
  const client = await CosmWasmClient.connect(rpc);
  const response = await client.queryContractSmart(contractAddress, queryMsg);
  return response;
}

async function queryAccountBalances(accountAddress, chain) {
  let rpc;
  if (chain === "migaloo") {
    rpc = migalooRPC;
  } else if (chain === "osmosis") {
    rpc = osmosisRPC;
  }
  const client = await StargateClient.connect(rpc);
  const balances = await client.getAllBalances(accountAddress);
  return balances;
}

async function getOphirCirculatingSupply() {
  cache.ophirStakedSupplyRaw = await queryAccountBalances(
    "migaloo1kv72vwfhq523yvh0gwyxd4nc7cl5pq32v9jt5w2tn57qtn57g53sghgkuh",
    "migaloo"
  );
  console.log(
    OPHIR_TOTAL_SUPPLY - cache.ophirStakedSupplyRaw[0].amount / 1000000
  );
}

async function fetchStatData() {
  getOphirCirculatingSupply();
  const ophirCirculatingSupplyResponse = await fetchWithTimeout(
    "https://therealsnack.com/ophircirculatingsupply",
    5000,
    { data: OPHIR_TOTAL_SUPPLY } // Assuming OPHIR_TOTAL_SUPPLY is the desired fallback structure
  );

  const poolDataQueryMsg = {
    pool: {},
  };

  // cache.whiteWhalePoolRawData = await axios.get('https://fd60qhijvtes7do71ou6moc14s.ingress.pcgameservers.com/api/pools/migaloo');
  cache.ophirCirculatingSupply = ophirCirculatingSupplyResponse;

  cache.ophirInMine = await queryAccountBalances(
    "migaloo1dpchsx70fe6gu9ljtnknsvd2dx9u7ztrxz9dr6ypfkj4fvv0re6qkdrwkh",
    "migaloo"
  );
  cache.ophirWhalePoolData = await queryContract(
    "migaloo1p5adwk3nl9pfmjjx6fu9mzn4xfjry4l2x086yq8u8sahfv6cmuyspryvyu",
    poolDataQueryMsg,
    "migaloo"
  );
  cache.ophirWbtcPoolData = await queryContract(
    "migaloo154k8ta3n0eduqrkr657f0kaj8yc89rczjpznxwnrnfvdlnjkxkjq0mv55f",
    poolDataQueryMsg,
    "migaloo"
  );
  cache.bWhaleWhalePoolData = await queryContract(
    "migaloo1dg5jrt89nddtymjx5pzrvdvdt0m4zl3l2l3ytunl6a0kqd7k8hss594wy6",
    poolDataQueryMsg,
    "migaloo"
  );
  cache.ampWhaleWhalePoolData = await queryContract(
    "migaloo1ull9s4el2pmkdevdgrjt6pwa4e5xhkda40w84kghftnlxg4h3knqpm5u3n",
    poolDataQueryMsg,
    "migaloo"
  );
  cache.whalewBtcPoolData = await queryContract(
    "migaloo1axtz4y7jyvdkkrflknv9dcut94xr5k8m6wete4rdrw4fuptk896su44x2z",
    poolDataQueryMsg,
    "migaloo"
  );
  cache.osmosisMainDaoData = await queryAccountBalances(
    "osmo1esa9vpyfnmew4pg4zayyj0nlhgychuv5xegraqwfyyfw4ral80rqn7sdxf",
    "osmosis"
  );
  cache.coinPrices = await fetchCoinPrices();
  cache.lastFetch = Date.now();

  return cache;
}

async function fetchCoinPrices() {
  const prices = {};

  for (const asset of priceAssetList) {
    try {
      const response = await axios.get(
        `https://api-osmosis.imperator.co/tokens/v2/price/${asset.toLowerCase()}`
      );
      prices[asset] = response.data.price;
    } catch (error) {
      console.error(`Error fetching price for ${asset}:`, error);
      prices[asset] = "Error fetching data";
    }
  }

  try {
    const labPriceResponse = await axios.get(
      "https://sqsprod.osmosis.zone/tokens/prices?base=factory%2Fosmo17fel472lgzs87ekt9dvk0zqyh5gl80sqp4sk4n%2FLAB"
    );
    const labPriceData = labPriceResponse.data[LAB_DENOM][USDC_DENOM];
    prices["lab"] = parseFloat(labPriceData);
  } catch (error) {
    console.error("Error fetching LAB price:", error);
    // prices['lab'] = 'Error fetching data';
  }

  try {
    const sharkPriceResponse = await axios.get(
      "https://sqsprod.osmosis.zone/tokens/prices?base=ibc%2F64D56DF9EC69BE554F49EBCE0199611062FF1137EF105E2F645C1997344F3834"
    );
    const sharkPriceData = sharkPriceResponse.data[SHARK_DENOM][USDC_DENOM];
    prices["shark"] = parseFloat(sharkPriceData);
  } catch (error) {
    console.error("Error fetching shark price:", error);
    // prices['shark'] = 'Error fetching data';
  }

  try {
    const runePriceResponse = await axios.get(
      "https://postgrest-internal-fgpupeioaa-uc.a.run.app/assets?select=volume%2Cprice&id=eq.100011746"
    );
    const runePriceData = runePriceResponse.data[0]; // Assuming the response is an array and we need the first item
    prices["rune"] = parseFloat(runePriceData.price);
  } catch (error) {
    console.error("Error fetching Rune price:", error);
    prices["rune"] = "Error fetching data";
  }

  try {
    const dogPriceResponse = await axios.get(
      "https://www.fxempire.com/api/v1/en/crypto-coin/markets?slug=bridged-dog-go-to-the-moon&page=1&size=6"
    );
    const dogPriceData = dogPriceResponse.data[0].converted_last.usd;
    prices["dog"] = parseFloat(dogPriceData);
  } catch (error) {
    console.error("Error fetching DOG price:", error);
    prices["dog"] = "Error fetching data";
  }

  try {
    const rstkPriceResponse = await axios.get(
      "https://sqsprod.osmosis.zone/tokens/prices?base=ibc/04FAC73DFF7F1DD59395948F2F043B0BBF978AD4533EE37E811340F501A08FFB"
    );
    const rstkPriceData = rstkPriceResponse.data[RSTK_DENOM][USDC_DENOM];
    prices["rstk"] = parseFloat(rstkPriceData);
  } catch (error) {
    console.error("Error fetching RSTK price:", error);
    // prices['rstk'] = 'Error fetching data';
  }

  try {
    const roarPriceResponse = await axios.get(
      "https://sqsprod.osmosis.zone/tokens/prices?base=ibc/98BCD43F190C6960D0005BC46BB765C827403A361C9C03C2FF694150A30284B0"
    );
    const roarPriceData = roarPriceResponse.data[ROAR_DENOM][USDC_DENOM];
    prices["roar"] = parseFloat(roarPriceData);
  } catch (error) {
    console.error("Error fetching ROAR price:", error);
  }

  // Fetch additional price data
  //   const priceDataResponse = await axios.get(
  //     "https://fd60qhijvtes7do71ou6moc14s.ingress.pcgameservers.com/api/prices"
  //   );
  //   const priceData = Object.keys(priceDataResponse.data.data).reduce(
  //     (acc, key) => {
  //       // Check if the key starts with "backbone-labs-staked-"
  //       if (key.startsWith("backbone-labs-staked-")) {
  //         // Replace "backbone-labs-staked-" with "b" and assign the value
  //         const newKey = key.replace("backbone-labs-staked-", "b");
  //         acc[newKey] = priceDataResponse.data.data[key];
  //       } else {
  //         // If it doesn't start with the prefix, keep the original key
  //         acc[key] = priceDataResponse.data.data[key];
  //       }
  //       return acc;
  //     },
  //     {}
  //   );

  // Map the fetched price data to the prices object
  //   for (const [key, value] of Object.entries(priceData)) {
  //     // Use the value from symbolDenomMap if it exists, otherwise use the original key
  //     let formattedKey = symbolDenomMap[key] || key;
  //     prices[formattedKey] = value.usd;
  //   }

  try {
    const kujiraRatesResponse = await axios.get(
      "https://lcd.kaiyo.kujira.setten.io/oracle/denoms/exchange_rates"
    );
    const kujiraRates = kujiraRatesResponse.data.exchange_rates;

    for (const rate of kujiraRates) {
      // Use the value from symbolDenomMap if it exists, otherwise use the original key
      let formattedKey = rate.denom.toLowerCase();

      // Change key to 'ampKuji' if formattedKey is 'ampkuji'
      if (formattedKey === "ampkuji") {
        formattedKey = "ampKuji";
      }
      // Only add if the key does not already exist in prices
      if (!prices.hasOwnProperty(formattedKey)) {
        prices[formattedKey] = parseFloat(rate.amount);
      }
    }
  } catch (error) {
    console.error("Error fetching Kujira exchange rates:", error);
  }

  prices["ampRoar"] = prices["roar"] * AMPROAR_ERIS_CONSTANT;

  // Custom logic for '.' in asset name
  prices.wBTCaxl = prices["wBTC.axl"];
  delete prices["wBTC.axl"];

  prices["ampBTC"] = prices["wbtc"] * AMPBTC_ERIS_CONSTANT;

  prices["moar"] = prices["ampRoar"] * MOAR_ERIS_CONSTANT;

  prices["ampOsmo"] = prices["osmo"] * AMPOSMO_ERIS_CONSTANT;

  prices["bOsmo"] = prices["osmo"] * BOSMO_CONSTANT;

  prices["ampWhaleT"] = prices["whale"] * AMPWHALET_ERIS_CONSTANT;

  prices["bWhaleT"] = prices["whale"] * BWHALET_CONSTANT;

  // console.log(prices)
  return prices;
}

function getLPPrice(data, ophirPrice, whalePrice) {
  // Extract total share
  // console.log("getLPPrice data: ", data)
  const totalShare = data?.total_share / Math.pow(10, 6); // Assuming LP shares are also in 6 decimals

  // Process each asset
  const assets = data?.assets.reduce((acc, asset) => {
    // Assuming the structure of `info` object to extract the denom
    const denom =
      asset.info?.native_token?.denom || asset.info?.token?.contract_addr;
    if (denom) {
      const symbol = tokenMappings[denom]?.symbol;
      const decimals = tokenMappings[denom]?.decimals;
      if (symbol && decimals !== undefined) {
        acc[symbol] = Number(asset.amount) / Math.pow(10, decimals);
      }
    }
    return acc;
  }, {});
  // console.log(assets)
  let whaleValue = assets["whale"] * whalePrice;
  let ophirValue = assets["ophir"] * ophirPrice;
  return (whaleValue + ophirValue) / totalShare;
}

function getWhalewBtcLPPrice(data, whalePrice, wBTCPrice) {
  // Extract total share
  const totalShare = data?.total_share / Math.pow(10, 6);
  // console.log(totalShare)
  // Process each asset
  const assets = data.assets.reduce((acc, asset) => {
    // console.log(tokenMappings[asset.info.native_token.denom].symbol)
    acc[tokenMappings[asset.info.native_token.denom].symbol] =
      Number(asset.amount) /
      Math.pow(
        10,
        getDecimalForSymbol(tokenMappings[asset.info.native_token.denom].symbol)
      );
    return acc;
  }, {});

  let whaleValue = assets["whale"] * whalePrice;
  let wbtcValue = assets["wBTC"] * wBTCPrice;
  console.log("Whale Value: ", whaleValue);
  console.log("wBTC Value: ", wbtcValue);
  console.log("Total Share: ", totalShare);
  return (whaleValue + wbtcValue) / totalShare;
}

function getOphirwBtcLPPrice(data, ophirPrice, wBTCPrice) {
  // Extract total share
  const totalShare = data?.total_share / Math.pow(10, 6);
  // console.log(totalShare)
  // Process each asset
  const assets = data.assets.reduce((acc, asset) => {
    // console.log(tokenMappings[asset.info.native_token.denom].symbol)
    acc[tokenMappings[asset.info.native_token.denom].symbol] =
      Number(asset.amount) /
      Math.pow(
        10,
        getDecimalForSymbol(tokenMappings[asset.info.native_token.denom].symbol)
      );
    return acc;
  }, {});

  let ophirValue = assets["ophir"] * ophirPrice;
  let wbtcValue = assets["wBTC"] * wBTCPrice;
  return (ophirValue + wbtcValue) / totalShare;
}

function getSailPriceFromLp(data, whalePrice) {
  // Check if data or data is undefined or null, or if whalePrice is 0
  if (!data || whalePrice === 0) return 0;

  // Check if data.assets is present and is an array
  if (!Array.isArray(data.assets)) {
    console.error(
      "Expected data.data.assets to be an array, received:",
      data.assets
    );
    return 0;
  }

  const assets = data.assets.reduce((acc, asset) => {
    const symbol = tokenMappings[asset.info.native_token.denom].symbol;
    const amount = Number(asset.amount);
    const decimals = getDecimalForSymbol(symbol);
    acc[symbol] = amount / Math.pow(10, decimals);
    return acc;
  }, {});

  if (!assets["whale"] || !assets["sail"]) return 0;

  let whaleValue = assets["whale"] * whalePrice;
  let sailPrice = whaleValue / assets["sail"];
  return sailPrice || 0;
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
  // console.log(arrayData)
  arrayData.forEach((item) => {
    if (item.balance > 0) {
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

  dataArray.forEach((item) => {
    let assetKey = item.staked_asset.native;
    let reward = item.rewards;
    rewards[assetKey] = reward;
  });
  // console.log(swapKeysWithSymbols(rewards))
  return swapKeysWithSymbols(rewards);
}

function combineAllianceAssetsWithRewards(assets, rewards) {
  let combined = {};

  for (let key in assets) {
    combined[key] = {
      balance: assets[key],
      rewards: rewards[key] || "0", // Fallback to "0" if no reward is found for the key
    };
  }
  return combined;
}

function addAllianceAssetsAndRewardsToTreasury(
  runeWallet,
  lunaAlliance,
  migalooAlliance,
  terraMSOpsWallet,
  terraMSOpsWalletampluna,
  terraMSOpsWalletbluna,
  migalooTreasury,
  migalooVault,
  migalooHotWallet,
  ophirTreasuryOsmosisAssets,
  osmosisWWAssets,
  ampRoarAllianceStaked
) {
  let combined = {};

  let ampRoarBalance = 0;
  let ampRoarRewards = 0;

  ampRoarAllianceStaked.delegations.forEach((delegation) => {
    ampRoarBalance += Number(delegation.balance.amount);
  });

  // ampRoarRewards = ampRoarAllianceRewards.rewards.find(reward => reward.denom === 'uluna').amount;
  // console.log(migalooHotWallet);

  combined["ampRoar"] = {
    balance: ampRoarBalance,
    rewards: ampRoarRewards,
    location: "ampRoar Alliance Staked",
  };

  // Process alliance data
  for (let key in lunaAlliance) {
    combined[key] = {
      ...lunaAlliance[key],
      location: "Luna Alliance",
    };
  }

  for (let key in migalooAlliance) {
    combined[key] = {
      ...migalooAlliance[key],
      location: "Migaloo Alliance",
    };
  }

  // Process treasury data
  for (let key in migalooTreasury) {
    if (combined[key]) {
      combined[key].balance = migalooTreasury[key];
    } else {
      combined[key] = {
        balance: migalooTreasury[key],
        rewards: "0",
        location: "Migaloo Treasury",
      };
    }
  }

  for (let key in osmosisWWAssets) {
    if (combined[key]) {
      // console.log(key)
      let oldBalance = combined[key].balance;
      let oldRewards = combined[key].rewards;
      combined[key].balance =
        Number(combined[key].balance) + Number(osmosisWWAssets[key].balance);
      combined[key].location = "WW Osmosis + Luna Alliance";
      combined[key].rewards = oldRewards;
      combined[key].composition = {
        "Luna Alliance": adjustSingleDecimal(key, oldBalance),
        "WW Osmosis": adjustSingleDecimal(key, osmosisWWAssets[key].balance),
      };
    } else {
      combined[key] = {
        ...osmosisWWAssets[key],
        rewards: "0",
        location: "WW Osmosis",
      };
    }
  }

  // add staked sail
  // combined['sail'] = {
  //     balance: stakedSail,
  //     rewards: '0',
  //     location: "Staked in Sail DAO"
  // }

  for (let key in migalooHotWallet) {
    if (combined[key]) {
      let oldBalance = combined[key].balance;
      combined[key].balance =
        Number(combined[key].balance) + Number(migalooHotWallet[key]);
      combined[key].location = "Migaloo Hot Wallet + Treasury";
      combined[key].composition = {
        "Migaloo Treasury": adjustSingleDecimal(key, oldBalance),
        "Migaloo Hot Wallet": adjustSingleDecimal(key, migalooHotWallet[key]),
      };
    } else {
      combined[key] = {
        balance: migalooHotWallet[key],
        rewards: "0",
        location: "Migaloo Hot Wallet",
      };
    }
  }

  for (let key in ophirTreasuryOsmosisAssets) {
    let combinedCopy = { ...combined[key] };
    if (combined[key]) {
      combined[key].balance =
        Number(combinedCopy.balance) + Number(ophirTreasuryOsmosisAssets[key]);
      combined[key].location = combinedCopy.location + " + Osmosis Hot Wallet";
      combined[key].composition = {
        [combinedCopy.location]: adjustSingleDecimal(key, combinedCopy.balance),
        "Osmosis Treasury": adjustSingleDecimal(
          key,
          ophirTreasuryOsmosisAssets[key]
        ),
      };
    } else {
      combined[key] = {
        balance: ophirTreasuryOsmosisAssets[key],
        rewards: "0",
        location: "Osmosis Treasury",
      };
    }
  }

  for (let key in migalooVault) {
    let combinedCopy = { ...combined[key] };
    if (combined[key]) {
      combined[key].balance =
        Number(combinedCopy.balance) + Number(migalooVault[key]);
      combined[key].location = combinedCopy.location + " + Migaloo Vault";
      combined[key].composition = {
        [combinedCopy.location]: adjustSingleDecimal(key, combinedCopy.balance),
        "Migaloo Vault": adjustSingleDecimal(key, migalooVault[key]),
      };
    } else {
      combined[key] = {
        balance: migalooVault[key],
        rewards: "0",
        location: "Migaloo Vault",
      };
    }
  }

  // Special handling for wBTC
  if (combined["wBTC"]) {
    let originalAmount = combined["wBTC"].balance;
    combined["wBTC"].balance = Number(combined["wBTC"].balance);
    combined["wBTC"].location = "Migaloo Treasury";
  }

  Object.keys(terraMSOpsWallet).forEach((key) => {
    if (combined[key]) {
      combined[key].balance =
        Number(combined[key].balance) + Number(terraMSOpsWallet[key]);
      combined[key].location =
        "Terra MS Ops Wallet + " + combined[key].location;
      combined[key].composition = {
        ...combined[key].composition,
        "Terra MS Ops Wallet": adjustSingleDecimal(key, terraMSOpsWallet[key]),
      };
    } else {
      combined[key] = {
        balance: terraMSOpsWallet[key],
        rewards: "0", // Assuming no rewards for these entries
        location: "Terra MS Ops Wallet",
      };
    }
  });

  if (terraMSOpsWalletampluna) {
    if (combined["ampLuna"]) {
      combined["ampLuna"].balance =
        Number(combined["ampLuna"].balance) + Number(terraMSOpsWalletampluna); // Fixed incorrect property access for ampLuna balance
      combined["ampLuna"].location =
        "Terra Polytone Wallet + " + combined["ampLuna"].location;
    } else {
      combined["ampLuna"] = {
        balance: Number(terraMSOpsWalletampluna),
        rewards: "0",
        location: "Terra Polytone Wallet",
      };
    }
  }
  if (terraMSOpsWalletbluna) {
    if (combined["bluna"]) {
      combined["bluna"].balance =
        Number(combined["bluna"].balance) + Number(terraMSOpsWalletbluna); // Fixed incorrect property access for bLuna balance
      combined["bluna"].location =
        "Terra Polytone Wallet + " + combined["bluna"].location;
    } else {
      combined["bluna"] = {
        balance: Number(terraMSOpsWalletbluna),
        rewards: "0",
        location: "Terra Polytone Wallet",
      };
    }
  }
  // console.log("terraMSOpsWalletbluna: ", terraMSOpsWalletbluna)

  if (runeWallet && runeWallet.coins) {
    runeWallet.coins.forEach((coin) => {
      if (coin.asset === "THOR.RUNE") {
        const runeAmount = Number(coin.amount) / 100000000; // Convert amount by dividing by 100,000,000
        combined["rune"] = {
          balance: runeAmount,
          rewards: "0",
          location: "Rune Treasury",
        };
      }
    });
  }

  // Add 'dog' to combined with the location being "Bitcoin Treasury"
  combined["dog"] = {
    balance: 889806,
    rewards: "0",
    location: "Bitcoin Treasury",
  };

  // if (combined['bWhale']) {
  //     combined['bwhale'] = combined['bWhale'];
  //     delete combined['bWhale'];
  // }
  return combined;
}

function getOsmosisBondedAssets(osmosisWWBondedAssets) {
  const bondedAssets = osmosisWWBondedAssets.data.bonded_assets;
  const totalBonded = osmosisWWBondedAssets.data.total_bonded;
  const output = {};

  bondedAssets.forEach((asset) => {
    const denom = asset.info.native_token.denom;
    const amount = asset.amount;
    const tokenInfo = tokenMappings[denom];
    if (tokenInfo) {
      const balance = Number(amount) / Math.pow(10, getDecimalForSymbol(denom));
      output[tokenInfo.symbol] = {
        balance: balance,
        location: "WW Osmosis",
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
  return valueToAdjust / Math.pow(10, getDecimalForSymbol(symbol));
}

function adjustDecimals(data) {
  let adjustedData = {};

  for (let key in data) {
    let balance =
      Number(data[key].balance) / Math.pow(10, getDecimalForSymbol(key) || 0);
    let rewards = Number(data[key].rewards);
    if (rewards !== 0) {
      let decimal =
        data[key].location === "Alliance"
          ? tokenMappings[LUNA].decimals
          : getDecimalForSymbol(key) || 0;
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

  let sailWhaleLpData = 0;
  let ampKujiPrice = 0;
  let kujiPrice = 0;
  const ophirlpAmount = parseFloat(
    cache?.ophirWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === OPHIR
    ).amount
  );

  const ophirlpAmountForWBTC = parseFloat(
    cache?.ophirWbtcPoolData.assets.find(
      (asset) => asset.info.native_token.denom === OPHIR
    ).amount
  );
  const whalelpAmount = parseFloat(
    cache?.ophirWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === "uwhale"
    ).amount
  );

  const wBTClpAmount = parseFloat(
    cache?.ophirWbtcPoolData.assets.find(
      (asset) => asset.info.native_token.denom === WBTC
    ).amount
  );

  const bWhalelpAmount = parseFloat(
    cache?.bWhaleWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === B_WHALE
    ).amount
  );
  const whalelpAmount_b = parseFloat(
    cache?.bWhaleWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === "uwhale"
    ).amount
  );

  const ampWhalelpAmount = parseFloat(
    cache?.ampWhaleWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === AMP_WHALE
    ).amount
  );
  const whalelpAmount_amp = parseFloat(
    cache?.ampWhaleWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === "uwhale"
    ).amount
  );

  const whalePrice =
    statData?.coinPrices["whale"] || cache?.coinPrices["whale"];
  // console.log(statData?.whiteWhalePoolRawData.data.data);
  // console.log(statData?.ophirWhalePoolData.data)
  // const whiteWhalePoolFilteredData = filterPoolsWithPrice(statData?.whiteWhalePoolRawData.data.data || cache.whiteWhalePoolRawData.data.data) || 0;
  const ophirWhaleLpPrice =
    getLPPrice(
      statData?.ophirWhalePoolData || cache?.ophirWhalePoolData,
      ((whalelpAmount / 1000000) * cache.coinPrices["whale"]) /
        (ophirlpAmount / 1000000),
      whalePrice
    ) || 0;

  const ophirWbtcLpPrice =
    getOphirwBtcLPPrice(
      statData?.ophirWbtcPoolData || cache?.ophirWbtcPoolData,
      ((wBTClpAmount / 100000000) * cache.coinPrices["wbtc"]) /
        (ophirlpAmountForWBTC / 1000000),
      statData?.coinPrices["wbtc"]?.usd || cache?.coinPrices["wbtc"]
    ) || 0;
  const whalewBtcLpPrice =
    getWhalewBtcLPPrice(
      statData?.whalewBtcPoolData || cache?.whalewBtcPoolData,
      whalePrice,
      statData?.coinPrices["wbtc"]?.usd || cache?.coinPrices["wbtc"]
    ) || 0;
  try {
    const response = await axios.get(
      "https://lcd.osmosis.zone/cosmwasm/wasm/v1/contract/osmo1w8e2wyzhrg3y5ghe9yg0xn0u7548e627zs7xahfvn5l63ry2x8zstaraxs/smart/ewogICJwb29sIjoge30KfQo="
    );
    sailWhaleLpData = response.data || 0;
  } catch (error) {
    console.error("Error fetching Sail Whale LP Data:", error);
  }

  try {
    const response = await axios.get(
      "https://lcd-kujira.whispernode.com/oracle/denoms/AMPKUJI/exchange_rate"
    );
    ampKujiPrice = response.data || 0;
  } catch (error) {
    console.error("Error fetching AMP Kuji Price:", error);
  }

  try {
    const response = await axios.get(
      "https://lcd-kujira.whispernode.com/oracle/denoms/KUJI/exchange_rate"
    );
    kujiPrice = response.data || 0;
  } catch (error) {
    console.error("Error fetching Kuji Price:", error);
  }

  let prices = {
    ...cache.coinPrices,
    whale: whalePrice,
    ophir:
      ((whalelpAmount / 1000000) * cache.coinPrices["whale"]) /
      (ophirlpAmount / 1000000),
    bWhale:
      ((whalelpAmount_b / 1000000) * cache.coinPrices["whale"]) /
      (bWhalelpAmount / 1000000),
    ampWhale:
      ((whalelpAmount_amp / 1000000) * cache.coinPrices["whale"]) /
      (ampWhalelpAmount / 1000000),
    wBTC: statData?.coinPrices["wBTC"]?.usd || cache?.coinPrices["wBTC"],
    wBTCaxl:
      statData?.coinPrices["wBTCaxl"]?.usd || cache?.coinPrices["wBTCaxl"],
    // ampWHALEt:
    //   whiteWhalePoolFilteredData["ampWHALEt-ampWHALE"] *
    //   (whiteWhalePoolFilteredData["ampWHALE-WHALE"] * whalePrice),
    // bWHALEt:
    //   whiteWhalePoolFilteredData["bWHALEt-bWHALE"] *
    //   (whiteWhalePoolFilteredData["bWHALE-WHALE"] * whalePrice),
    luna: statData?.coinPrices["luna"] || cache?.coinPrices["luna"],
    // ash: whiteWhalePoolFilteredData["ASH-WHALE"] * whalePrice,
    ophirWhaleLp: ophirWhaleLpPrice,
    whalewBtcLp: whalewBtcLpPrice,
    ophirWbtcLp: ophirWbtcLpPrice,
    sail: getSailPriceFromLp(sailWhaleLpData.data, whalePrice),
    ampUSDC:
      statData?.coinPrices["usdc"] * MUSDC_ERIS_CONSTANT ||
      cache?.coinPrices["usdc"] * MUSDC_ERIS_CONSTANT,
    // bluna: statData?.coinPrices['luna']*BLUNA_CONSTANT || cache?.coinPrices['luna']*BLUNA_CONSTANT,
    ampLuna:
      statData?.coinPrices["luna"] * AMPLUNA_ERIS_CONSTANT ||
      cache?.coinPrices["luna"] * AMPLUNA_ERIS_CONSTANT,
  };

  for (let key in balances) {
    let balance = balances[key].balance;
    let price = prices[key] || 0; // Assuming 0 if price is not available
    totalValue += balance * price;

    // Exclude Ophir asset for the second total
    if (key !== "ophir") {
      totalValueWithoutOphir += balance * price;
    }
  }
  ophirStakedSupply = getMigalooContractBalance(cache.ophirStakedSupplyRaw);

  // const ophirMigalooVaultAmount = (balances['ophir'] && (balances['ophir']?.location === "Migaloo Vault")) ? balances['ophir'].balance : "Migaloo Vault" in balances['ophir']?.composition ? balances['ophir']?.composition['Migaloo Vault'] : 0;

  return {
    totalTreasuryValue: formatNumber(totalValue, 2),
    treasuryValueWithoutOphir: formatNumber(totalValueWithoutOphir, 2),
    ophirRedemptionPrice: calculateOphirRedeptionPrice(
      totalValueWithoutOphir,
      ophirStakedSupply
    ),
  };
}

function calculateOphirRedeptionPrice(
  totalValueWithoutOphir,
  ophirStakedSupply
) {
  const adjTrueCirculatingSupply =
    cache.ophirCirculatingSupply.data + ophirStakedSupply;
  // console.log(cache.ophirCirculatingSupply.data, ophirStakedSupply, adjTrueCirculatingSupply)
  const adjTreasuryValue =
    totalValueWithoutOphir + (1000000000 - adjTrueCirculatingSupply) * 0.0025; // (1,000,000,000 - (circ supply + staked ophir)) * 0.0025  done for calculating value added to treasury of all ophir sold at 0.0025 price
  return adjTreasuryValue / adjTrueCirculatingSupply;
}

function compactAlliance(assetData, rewardsData) {
  let stakingAssets = extractAllianceAssetBalances(assetData);
  let stakingRewards = extractAllianceRewardsPerAsset(rewardsData);
  return combineAllianceAssetsWithRewards(stakingAssets, stakingRewards);
}

function parseOphirDaoTreasury(
  runeWallet,
  migalooTreasuryData,
  ophirVaultMigalooAssets,
  migalooHotWallet,
  terraMSOpsWallet,
  terraMSOpsWalletampluna,
  terraMSOpsWalletbluna,
  ophirTreasuryOsmosisAssets,
  allianceStakingAssetsData,
  allianceStakingRewardsData,
  allianceMigalooStakingAssetsData,
  allianceMigalooStakingRewardsData,
  osmosisWWBondedAssets,
  ampRoarAllianceStaked
) {
  // Parse the JSON data
  // const data = JSON.parse(jsonData);

  let lunaAlliance = compactAlliance(
    allianceStakingAssetsData,
    allianceStakingRewardsData
  );
  let migalooAlliance = compactAlliance(
    allianceMigalooStakingAssetsData,
    allianceMigalooStakingRewardsData
  );
  let osmosisWWAssets = getOsmosisBondedAssets(osmosisWWBondedAssets);
  // console.log(osmosisWWAssets)
  totalTreasuryAssets = addAllianceAssetsAndRewardsToTreasury(
    runeWallet,
    lunaAlliance,
    migalooAlliance,
    swapKeysWithSymbols(terraMSOpsWallet.balances),
    terraMSOpsWalletampluna.balance,
    terraMSOpsWalletbluna.balance,
    swapKeysWithSymbols(migalooTreasuryData.balances),
    swapKeysWithSymbols(ophirVaultMigalooAssets.balances),
    swapKeysWithSymbols(migalooHotWallet.balances),
    swapKeysWithSymbols(ophirTreasuryOsmosisAssets.balances),
    osmosisWWAssets,
    ampRoarAllianceStaked
  );
  treasuryBalances = swapKeysWithSymbols(migalooTreasuryData.balances);
}

router.get("/stats", async (req, res) => {
  try {
    let statData;
    if (Date.now() - cache.lastFetch > CACHE_IN_MINUTES * 250 * 1000) {
      // Ensure CACHE_IN_MINUTES is converted to milliseconds
      await fetchStatData();
    }
    let whiteWhalePoolFilteredData, ophirStakedSupply, ophirInMine, ophirPrice;
    // console.log(statData.ophirWhalePoolData)

    const ophirAmount = parseFloat(
      cache?.ophirWhalePoolData.assets.find(
        (asset) => asset.info.native_token.denom === OPHIR
      ).amount
    );
    const whaleAmount = parseFloat(
      cache?.ophirWhalePoolData.assets.find(
        (asset) => asset.info.native_token.denom === "uwhale"
      ).amount
    );

    // try {
    //     whiteWhalePoolFilteredData = filterPoolsWithPrice(cache.whiteWhalePoolRawData.data.data);
    // } catch (error) {
    //     console.error('Error filtering White Whale Pool data:', error);
    //     whiteWhalePoolFilteredData = {}; // Default to empty object to prevent further errors
    // }
    try {
      ophirStakedSupply = getMigalooContractBalance(
        cache?.ophirStakedSupplyRaw
      );
    } catch (error) {
      console.error("Error getting Ophir Staked Supply:", error);
      ophirStakedSupply = 0; // Default to 0 to prevent further errors
    }
    try {
      ophirInMine = getMigalooContractBalance(cache.ophirInMine);
    } catch (error) {
      console.error("Error getting Ophir in Mine:", error);
      ophirInMine = 0; // Default to 0 to prevent further errors
    }
    try {
      ophirPrice =
        ((whaleAmount / 1000000) * cache.coinPrices["whale"]) /
        (ophirAmount / 1000000);
    } catch (error) {
      console.error("Error calculating Ophir Price:", error);
      ophirPrice = 0; // Default to 0 to prevent further errors
    }
    res.json({
      price: ophirPrice,
      marketCap: cache.ophirCirculatingSupply.data * ophirPrice,
      fdv: ophirPrice * OPHIR_TOTAL_SUPPLY,
      circulatingSupply: cache.ophirCirculatingSupply.data,
      stakedSupply: ophirStakedSupply,
      totalSupply: OPHIR_TOTAL_SUPPLY,
      ophirInMine: ophirInMine,
    });
  } catch (error) {
    console.error("An unexpected error occurred:", error);
    res.status(500).json({ error: "An unexpected error occurred" });
  }
});

router.get("/treasury", async (req, res) => {
  res.json(await getTreasuryAssets());
});

router.get("/prices", async (req, res) => {
  const prices = await getPrices();
  const sortedPrices = Object.fromEntries(
    Object.entries(prices).sort(([a], [b]) => a.localeCompare(b))
  );
  res.json(sortedPrices);
});

// async function querySmartContractStakedBalance(rpcEndpoint, contractAddress, query) {
//     const client = await StargateClient.connect(rpcEndpoint);
//     const queryClient = QueryClient.withExtensions(client, setupWasmExtension);

//     try {
//         const result = await queryClient.wasm.queryContractSmart(contractAddress, query);
//         return result;
//     } catch (error) {
//         console.error('Error querying smart contract staked balance:', error);
//         throw new Error('Failed to query smart contract staked balance');
//     }
// }
// const contractAddress = "migaloo190qz7q5fu4079svf890h4h3f8u46ty6cxnlt78eh486k9qm995hquuv9kd";
// const query = {
//     "staked_balance": {
//         "address": "migaloo1x6n9zg63auhtuvgucvnez0whnaaemqpgnrl0sl8vfg9hjved76pqngtmgk",
//         "asset": {
//             "native": "factory/migaloo1axtz4y7jyvdkkrflknv9dcut94xr5k8m6wete4rdrw4fuptk896su44x2z/uLP"
//         }
//     }
// };
// const stakedBalance = await querySmartContractStakedBalance(migalooRPC, contractAddress, query);
// console.log("STAKED BALANCE RESPONSE: ", stakedBalance)

async function queryChainBalances(rpcEndpoint, address) {
  const client = await StargateClient.connect(rpcEndpoint);
  const balances = await client.getAllBalances(address);
  // console.log(balances)
  return transformChainBalances(balances);
}

function transformChainBalances(balancesArray) {
  const transformedBalances = { balances: {} };
  balancesArray.forEach((balance) => {
    transformedBalances.balances[balance.denom] = balance.amount;
  });
  return transformedBalances;
}

async function getTreasuryAssets() {
  const now = Date.now();
  const oneMinute = 250000; // 60000 milliseconds in a minute

  // Check if cache is valid
  if (treasuryCache.lastFetch > now - oneMinute && treasuryCache.data) {
    return treasuryCache.data; // Return cached data if it's less than 1 minute old
  }

  const stakingBalanceQueryMsg = {
    staked_balance: {
      address:
        "migaloo1x6n9zg63auhtuvgucvnez0whnaaemqpgrnl0sl8vfg9hjved76pqngtmgk",
      asset: {
        native:
          "factory/migaloo1axtz4y7jyvdkkrflknv9dcut94xr5k8m6wete4rdrw4fuptk896su44x2z/uLP",
      },
    },
  };

  const stakingRewardsQueryMsg = {
    all_pending_rewards: {
      address:
        "migaloo1x6n9zg63auhtuvgucvnez0whnaaemqpgrnl0sl8vfg9hjved76pqngtmgk",
    },
  };

  const stakeQueryMsg = {
    balance: {
      address:
        "terra1wzuhdyvltwuksd2xn0zxuvlurw5hullmhxynml8vkgy39k30ndgqhegewj",
    },
  };

  const migalooRPC = "https://migaloo-rpc.polkachu.com/";
  const terraRPC = "https://terra-rpc.polkachu.com/";
  const osmosisRPC = "https://osmosis-rpc.polkachu.com/";

  // Fetch new data
  const ophirTreasuryMigalooAssets = await queryChainBalances(
    migalooRPC,
    "migaloo10gj7p9tz9ncjk7fm7tmlax7q6pyljfrawjxjfs09a7e7g933sj0q7yeadc"
  );
  const ophirVaultMigalooAssets = await queryChainBalances(
    migalooRPC,
    "migaloo14gu2xfk4m3x64nfkv9cvvjgmv2ymwhps7fwemk29x32k2qhdrmdsp9y2wu"
  );
  const migalooHotWallet = await queryChainBalances(
    migalooRPC,
    "migaloo19gc2kclw3ynjxl7wsddm5p08r5hu8a0gvzc4t3"
  );
  const runeWallet = await axios.get(
    "https://midgard.ninerealms.com/v2/balance/thor17fm523ke5x32wk0w7ytmf50lc0052vaf2rj4uf"
  );
  const terraMSOpsWallet = await queryChainBalances(
    terraRPC,
    "terra1hg55djaycrwgm0vqydul3ad3k64jn0jatnuh9wjxcxwtxrs6mxzshxqjf3"
  );
  const terraCrossChainWallet = await queryChainBalances(
    terraRPC,
    "terra1tjf95qej7fmckc927s7wckmxggfth23unp4dnl49xaxec5wea9nq9ys30r"
  );
  const terraMSOpsWalletampluna = await queryContract(
    "terra1ecgazyd0waaj3g7l9cmy5gulhxkps2gmxu9ghducvuypjq68mq2s5lvsct",
    stakeQueryMsg,
    "terra"
  ); // ampluna
  const terraMSOpsWalletbluna = await queryContract(
    "terra17aj4ty4sz4yhgm08na8drc0v03v2jwr3waxcqrwhajj729zhl7zqnpc0ml",
    stakeQueryMsg,
    "terra"
  ); // bluna
  const ophirTreasuryOsmosisAssets = await queryChainBalances(
    osmosisRPC,
    "osmo1esa9vpyfnmew4pg4zayyj0nlhgychuv5xegraqwfyyfw4ral80rqn7sdxf"
  );
  const allianceStakingAssets = await axios.get(
    "https://phoenix-lcd.terra.dev/cosmwasm/wasm/v1/contract/terra1jwyzzsaag4t0evnuukc35ysyrx9arzdde2kg9cld28alhjurtthq0prs2s/smart/ewogICJhbGxfc3Rha2VkX2JhbGFuY2VzIjogewogICAgImFkZHJlc3MiOiAidGVycmExdGpmOTVxZWo3Zm1ja2M5MjdzN3dja214Z2dmdGgyM3VucDRkbmw0OXhheGVjNXdlYTlucTl5czMwciIKICB9Cn0="
  );
  const allianceStakingRewards = await axios.get(
    "https://phoenix-lcd.terra.dev/cosmwasm/wasm/v1/contract/terra1jwyzzsaag4t0evnuukc35ysyrx9arzdde2kg9cld28alhjurtthq0prs2s/smart/ewogICJhbGxfcGVuZGluZ19yZXdhcmRzIjogeyJhZGRyZXNzIjoidGVycmExdGpmOTVxZWo3Zm1ja2M5MjdzN3dja214Z2dmdGgyM3VucDRkbmw0OXhheGVjNXdlYTlucTl5czMwciJ9Cn0="
  );
  const allianceMigalooStakingAssets = await axios.get(
    "https://ww-migaloo-rest.polkachu.com/cosmwasm/wasm/v1/contract/migaloo190qz7q5fu4079svf890h4h3f8u46ty6cxnlt78eh486k9qm995hquuv9kd/smart/ewogICJzdGFrZWRfYmFsYW5jZSI6IHsiYWRkcmVzcyI6Im1pZ2Fsb28xeDZuOXpnNjNhdWh0dXZndWN2bmV6MHdobmFhZW1xcGdybmwwc2w4dmZnOWhqdmVkNzZwcW5ndG1nayIsCiAgICJhc3NldCI6ewogICAgICAgIm5hdGl2ZSI6ImZhY3RvcnkvbWlnYWxvbzFheHR6NHk3anl2ZGtrcmZsa252OWRjdXQ5NHhyNWs4bTZ3ZXRlNHJkcnc0ZnVwdGs4OTZzdTQ0eDJ6L3VMUCIKICAgfSAgIAogICAgICAKICB9CiAgCn0="
  );
  // const allianceMigalooStakingAssets = await queryContract("migaloo190qz7q5fu4079svf890h4h3f8u46ty6cxnlt78eh486k9qm995hquuv9kd", stakingBalanceQueryMsg);
  const allianceMigalooStakingRewards = await axios.get(
    "https://ww-migaloo-rest.polkachu.com/cosmwasm/wasm/v1/contract/migaloo190qz7q5fu4079svf890h4h3f8u46ty6cxnlt78eh486k9qm995hquuv9kd/smart/eyJhbGxfcGVuZGluZ19yZXdhcmRzIjp7ImFkZHJlc3MiOiJtaWdhbG9vMXg2bjl6ZzYzYXVodHV2Z3Vjdm5lejB3aG5hYWVtcXBncm5sMHNsOHZmZzloanZlZDc2cHFuZ3RtZ2sifX0="
  );
  // const allianceMigalooStakingRewards = await queryContract('migaloo190qz7q5fu4079svf890h4h3f8u46ty6cxnlt78eh486k9qm995hquuv9kd', stakingRewardsQueryMsg);

  // const stakedSailAmount = await axios.get('https://indexer.daodao.zone/osmosis-1/contract/osmo14gz8xpzm5sj9acxfmgzzqh0strtuyhce08zm7pmqlkq6n4g5g6wq0924n8/daoVotingTokenStaked/votingPower?address=osmo1esa9vpyfnmew4pg4zayyj0nlhgychuv5xegraqwfyyfw4ral80rqn7sdxf');
  const osmosisWWBondedAssets = await axios.get(
    "https://lcd.osmosis.zone/cosmwasm/wasm/v1/contract/osmo1mfqvxmv2gx62hglaegdv3useqjj44kxrl69nlt4tkysy9dx8g25sq40kez/smart/ewogICJib25kZWQiOiB7CiAgICAiYWRkcmVzcyI6ICJvc21vMXR6bDAzNjJsZHRzcmFkc2duNGdtdThwZDg3OTRxank2NmNsOHEyZmY0M2V2Y2xnd2Q3N3MycXZ3bDYiCiAgfQp9"
  );
  const ampRoarAllianceStaked = await axios.get(
    "https://phoenix-lcd.terra.dev/terra/alliances/delegations/terra1hg55djaycrwgm0vqydul3ad3k64jn0jatnuh9wjxcxwtxrs6mxzshxqjf3"
  );
  // const ampRoarAllianceRewards = await axios.get('https://phoenix-lcd.erisprotocol.com/terra/alliances/rewards/terra1hg55djaycrwgm0vqydul3ad3k64jn0jatnuh9wjxcxwtxrs6mxzshxqjf3/terravaloper120ppepaj2lh5vreadx42wnjjznh55vvktp78wk/factory%252Fterra1vklefn7n6cchn0u962w3gaszr4vf52wjvd4y95t2sydwpmpdtszsqvk9wy%252FampROAR');
  // const osmosisAlliancewBTCRewards = await axios.get('https://celatone-api-prod.alleslabs.dev/rest/osmosis/osmosis-1/cosmwasm/wasm/v1/contract/osmo1ec7fqky6cq9xds6hq0e46f25ldnkkvjjkml7644y8la59ucqmtfsyyhh75/smart/ew0KICAiY2xhaW1hYmxlIjogew0KICAgICJhZGRyZXNzIjogIm9zbW8xdHpsMDM2MmxkdHNyYWRzZ240Z211OHBkODc5NHFqeTY2Y2w4cTJmZjQzZXZjbGd3ZDc3czJxdndsNiINCiAgfQ0KfQ==');
  parseOphirDaoTreasury(
    runeWallet.data,
    ophirTreasuryMigalooAssets,
    ophirVaultMigalooAssets,
    migalooHotWallet,
    terraMSOpsWallet,
    terraMSOpsWalletampluna,
    terraMSOpsWalletbluna,
    ophirTreasuryOsmosisAssets,
    allianceStakingAssets.data.data,
    allianceStakingRewards.data.data,
    allianceMigalooStakingAssets.data.data,
    allianceMigalooStakingRewards.data.data,
    osmosisWWBondedAssets.data,
    ampRoarAllianceStaked.data
  );
  let treasuryValues = await caclulateAndAddTotalTreasuryValue(
    adjustDecimals(totalTreasuryAssets)
  );
  // console.log(adjustDecimals(totalTreasuryAssets))
  // Cache the new data with the current timestamp
  treasuryCache = {
    lastFetch: now,
    data: {
      ...adjustDecimals(totalTreasuryAssets),
      totalTreasuryValue: treasuryValues.totalTreasuryValue,
      treasuryValueWithoutOphir: treasuryValues.treasuryValueWithoutOphir,
      ophirRedemptionPrice: treasuryValues.ophirRedemptionPrice,
    },
  };

  return treasuryCache.data;
}

async function getPrices() {
  let sailWhaleLpData = 0;
  let ampKujiPrice = 0;
  let kujiPrice = 0;
  let statData;
  const now = Date.now();
  const cacheTimeLimit = 300000; // 60000 milliseconds in a minute
  // Check if cache is valid
  if (now - cache.lastFetch > cacheTimeLimit || !cache.coinPrices) {
    statData = await fetchStatData(); // Fetch new data if cache is older than cacheTimeLimit or coinPrices is not cached
  }
  const ophirlpAmount = parseFloat(
    cache?.ophirWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === OPHIR
    ).amount
  );
  const ophirlpAmountForWBTC = parseFloat(
    cache?.ophirWbtcPoolData.assets.find(
      (asset) => asset.info.native_token.denom === OPHIR
    ).amount
  );
  const whalelpAmount = parseFloat(
    cache?.ophirWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === "uwhale"
    ).amount
  );

  const wBTClpAmount = parseFloat(
    cache?.ophirWbtcPoolData.assets.find(
      (asset) => asset.info.native_token.denom === WBTC
    ).amount
  );
  const bWhalelpAmount = parseFloat(
    cache?.bWhaleWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === B_WHALE
    ).amount
  );
  const whalelpAmount_b = parseFloat(
    cache?.bWhaleWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === "uwhale"
    ).amount
  );

  const ampWhalelpAmount = parseFloat(
    cache?.ampWhaleWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === AMP_WHALE
    ).amount
  );
  const whalelpAmount_amp = parseFloat(
    cache?.ampWhaleWhalePoolData.assets.find(
      (asset) => asset.info.native_token.denom === "uwhale"
    ).amount
  );

  const whalePrice =
    statData?.coinPrices["whale"] || cache?.coinPrices["whale"] || 0;
  // const whiteWhalePoolFilteredData = filterPoolsWithPrice(statData?.whiteWhalePoolRawData.data.data || cache.whiteWhalePoolRawData.data.data) || 0;
  const ophirWhaleLpPrice =
    getLPPrice(
      statData?.ophirWhalePoolData || cache?.ophirWhalePoolData,
      ((whalelpAmount / 1000000) * cache.coinPrices["whale"]) /
        (ophirlpAmount / 1000000),
      whalePrice
    ) || 0;
  const ophirWbtcLpPrice =
    getOphirwBtcLPPrice(
      statData?.ophirWbtcPoolData || cache?.ophirWbtcPoolData,
      ((wBTClpAmount / 100000000) * cache.coinPrices["wbtc"]) /
        (ophirlpAmountForWBTC / 1000000),
      statData?.coinPrices["wbtc"]?.usd || cache?.coinPrices["wbtc"]
    ) || 0;
  const whalewBtcLpPrice =
    getWhalewBtcLPPrice(
      statData?.whalewBtcPoolData || cache?.whalewBtcPoolData,
      whalePrice,
      statData?.coinPrices["wbtc"]?.usd || cache?.coinPrices["wbtc"]
    ) || 0;
  try {
    const response = await axios.get(
      "https://lcd.osmosis.zone/cosmwasm/wasm/v1/contract/osmo1w8e2wyzhrg3y5ghe9yg0xn0u7548e627zs7xahfvn5l63ry2x8zstaraxs/smart/ewogICJwb29sIjoge30KfQo="
    );
    sailWhaleLpData = response.data || 0;
  } catch (error) {
    console.error("Error fetching Sail Whale LP Data:", error);
  }

  try {
    const response = await axios.get(
      "https://lcd-kujira.whispernode.com/oracle/denoms/AMPKUJI/exchange_rate"
    );
    ampKujiPrice = response.data || 0;
  } catch (error) {
    console.error("Error fetching AMP Kuji Price:", error);
  }

  try {
    const response = await axios.get(
      "https://lcd-kujira.whispernode.com/oracle/denoms/KUJI/exchange_rate"
    );
    kujiPrice = response.data || 0;
  } catch (error) {
    console.error("Error fetching Kuji Price:", error);
  }

  let prices = {
    ...cache.coinPrices,
    whale: whalePrice,
    ophir:
      ((whalelpAmount / 1000000) * cache.coinPrices["whale"]) /
      (ophirlpAmount / 1000000),
    bWhale:
      ((whalelpAmount_b / 1000000) * cache.coinPrices["whale"]) /
      (bWhalelpAmount / 1000000),
    ampWhale:
      ((whalelpAmount_amp / 1000000) * cache.coinPrices["whale"]) /
      (ampWhalelpAmount / 1000000),
    wBTC: statData?.coinPrices["wBTC"]?.usd || cache?.coinPrices["wBTC"],
    wBTCaxl:
      statData?.coinPrices["wBTCaxl"]?.usd || cache?.coinPrices["wBTCaxl"],
    // ampWHALEt:
    //   whiteWhalePoolFilteredData["ampWHALEt-ampWHALE"] *
    //   (whiteWhalePoolFilteredData["ampWHALE-WHALE"] * whalePrice),
    // bWHALEt:
    //   whiteWhalePoolFilteredData["bWHALEt-bWHALE"] *
    //   (whiteWhalePoolFilteredData["bWHALE-WHALE"] * whalePrice),
    luna: statData?.coinPrices["luna"] || cache?.coinPrices["luna"],
    // ash: whiteWhalePoolFilteredData["ASH-WHALE"] * whalePrice,
    ophirWhaleLp: ophirWhaleLpPrice,
    whalewBtcLp: whalewBtcLpPrice,
    ophirWbtcLp: ophirWbtcLpPrice,
    sail: getSailPriceFromLp(sailWhaleLpData.data, whalePrice),
    ampUSDC:
      statData?.coinPrices["usdc"] * MUSDC_ERIS_CONSTANT ||
      cache?.coinPrices["usdc"] * MUSDC_ERIS_CONSTANT,
    // bluna: statData?.coinPrices['luna']*BLUNA_CONSTANT || cache?.coinPrices['luna']*BLUNA_CONSTANT,
    ampLuna:
      statData?.coinPrices["luna"] * AMPLUNA_ERIS_CONSTANT ||
      cache?.coinPrices["luna"] * AMPLUNA_ERIS_CONSTANT,
    bLuna:
      statData?.coinPrices["luna"] * BLUNA_CONSTANT ||
      cache?.coinPrices["luna"] * BLUNA_CONSTANT,
  };

  return prices;
}

async function getTreasuryValues(priceData, treasuryAssets) {
  const result = Object.keys(treasuryAssets).reduce((acc, assetKey) => {
    // Skip non-asset properties
    if (
      [
        "totalTreasuryValue",
        "treasuryValueWithoutOphir",
        "ophirRedemptionPrice",
      ].includes(assetKey)
    )
      return acc;

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
        timestamp: new Date().toISOString(),
      },
    });

    return acc;
  }, []);

  return result;
}

async function pushTreasuryValuesToFirebase(treasuryValues, priceData) {
  const previouslyRecordedDenoms = await fetchPreviouslyRecordedDenoms();
  const currentDenoms = treasuryValues.map((item) => Object.keys(item)[0]);

  const missingDenoms = previouslyRecordedDenoms.filter(
    (denom) => !currentDenoms.includes(denom)
  );

  for (const item of treasuryValues) {
    const assetName = Object.keys(item)[0];
    const assetDataRef = firebaseOphirTreasury.child(assetName);
    await assetDataRef
      .transaction((currentData) => {
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
      })
      .catch((error) => {
        console.error("Error updating data in Firebase:", error);
      });
  }

  for (const denom of missingDenoms) {
    const price = priceData[denom] || 0;
    const finalRecord = {
      asset: 0,
      price: price,
      timestamp: new Date().toISOString(),
      value: 0,
    };

    const assetDataRef = firebaseOphirTreasury.child(denom);
    await assetDataRef
      .transaction((currentData) => {
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
      })
      .catch((error) => {
        console.error(
          "Error updating data in Firebase for missing denom:",
          error
        );
      });
  }

  console.log("Treasury Data Saved");
}

async function fetchPreviouslyRecordedDenoms() {
  const snapshot = await firebaseOphirTreasury.once("value");
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
    console.error("Error fetching data:", error);
  }
};

let assetDataCache = {};

// Endpoint to get historical treasury data for a specific asset
router.get("/treasury/chartData/:assetName", async (req, res) => {
  const { assetName } = req.params;
  const now = Date.now();
  const fifteenMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds

  // Check if the asset data is cached and still valid
  if (
    assetDataCache[assetName] &&
    now - assetDataCache[assetName].timestamp < fifteenMinutes
  ) {
    return res.json(assetDataCache[assetName].data);
  }

  const assetDataRef = firebaseOphirTreasury.child(assetName);

  try {
    const snapshot = await assetDataRef.once("value");
    let data = snapshot.val();

    if (data && data.length > 0) {
      // Check if data exists and is not empty
      // Cache the data with a timestamp
      assetDataCache[assetName] = {
        timestamp: now,
        data: data,
      };
      res.json(data);
    } else {
      res
        .status(404)
        .send("Asset data not found or no data in the specified date range");
    }
  } catch (error) {
    console.error("Error fetching treasury data:", error);
    res.status(500).send("Internal server error");
  }
});

let treasuryChartDataCache = {
  lastFetch: 0,
  data: null,
};

// Endpoint to get all treasury data
router.get("/treasury/chartData", async (req, res) => {
  const now = Date.now();
  const cacheTimeLimit = 45 * 60 * 1000; // 45 minutes in milliseconds

  // Check if cache is valid
  if (
    now - treasuryChartDataCache.lastFetch < cacheTimeLimit &&
    treasuryChartDataCache.data
  ) {
    return res.json(treasuryChartDataCache.data);
  }

  try {
    const snapshot = await firebaseOphirTreasury.once("value");
    const data = snapshot.val();
    if (data) {
      // Update cache with new data and timestamp
      treasuryChartDataCache = {
        data: data,
        lastFetch: now,
      };
      res.json(data);
    } else {
      res.status(404).send("No treasury data found");
    }
  } catch (error) {
    console.error("Error fetching all treasury data:", error);
    res.status(500).send("Internal server error");
  }
});

let totalValueChartDataCache = {
  lastFetch: 0,
  data: null,
};

router.get("/treasury/totalValueChartData", async (req, res) => {
  const now = Date.now();
  const twelveHoursInMilliseconds = 24 * 60 * 60 * 1000; //24 hours

  // Check if the cache is valid
  if (
    now - totalValueChartDataCache.lastFetch < twelveHoursInMilliseconds &&
    totalValueChartDataCache.data
  ) {
    // Cache is valid, return the cached data
    return res.json(totalValueChartDataCache.data);
  }

  try {
    const snapshot = await firebaseOphirTreasury.once("value");
    const data = snapshot.val();
    if (!data) {
      return res.status(404).send("No treasury data found");
    }

    const dailySummaries = Object.keys(data).reduce((acc, assetName) => {
      const assetData = data[assetName];
      // Track assets added for each day to prevent duplicates
      const addedAssetsForDay = {};
      assetData.forEach((item) => {
        const timestamp = new Date(item.timestamp);
        const date = timestamp.toISOString().split("T")[0]; // Get date in YYYY-MM-DD format
        const utcHour = timestamp.getUTCHours();
        const utcMinutes = timestamp.getUTCMinutes();

        // Check if timestamp is between 12:00 PM UTC and 12:45 PM UTC
        if (utcHour === 12 && utcMinutes >= 0 && utcMinutes <= 45) {
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
    const summariesArray = Object.keys(dailySummaries).map((date) => ({
      date: date,
      totalValue: dailySummaries[date].totalValue,
    }));

    // Update the cache
    totalValueChartDataCache = {
      lastFetch: now,
      data: summariesArray,
    };

    res.json(summariesArray);
  } catch (error) {
    console.error("Error fetching daily treasury summary:", error);
    res.status(500).send("Internal server error");
  }
});

const VESTING_CACHE_DURATION = 15 * 60 * 1000;
let vestingAccountsCache = {
  lastFetch: 0,
  data: null,
  totalOphirVesting: null,
};

async function fetchAndProcessVestingAccounts() {
  const now = Date.now();
  // Check if the cache is still valid
  if (
    now - vestingAccountsCache.lastFetch < VESTING_CACHE_DURATION &&
    vestingAccountsCache.data
  ) {
    return vestingAccountsCache;
  }

  try {
    const vestingAccountsData = await fetchVestingAccounts();
    if (!vestingAccountsData) {
      throw new Error("Vesting accounts data not found");
    }

    let totalOphirVesting = 0;

    const seekers = vestingAccountsData
      .reduce((acc, account) => {
        const { address, info } = account;
        const { start_point, end_point } = info.schedules[0];
        const amountVesting = info.schedules[0].end_point.amount / 1000000;

        if (amountVesting < 400000) {
          return acc; // Skip adding this account to the response if amountVesting is < 400000
        }

        totalOphirVesting += amountVesting;
        if (address === "migaloo1jukdd76z4fzvf2vwpf4jfyeghdgnjmmsfveg4j") {
          // console.log(amountVesting);
        }
        acc.push({
          address,
          amount: amountVesting,
          vestingStart: new Date(start_point.time * 1000).toUTCString(),
          vestingEnd: new Date(end_point.time * 1000).toUTCString(),
          claimable: new Date(end_point.time * 1000) < new Date(),
          amountClaimed: info.released_amount / 1000000,
        });

        return acc;
      }, [])
      .sort((a, b) => new Date(a.vestingEnd) - new Date(b.vestingEnd));

    // Update the cache
    vestingAccountsCache = {
      lastFetch: now,
      data: seekers,
      totalOphirVesting: totalOphirVesting,
    };

    return vestingAccountsCache;
  } catch (error) {
    console.error("Error in fetchAndProcessVestingAccounts:", error);
    throw error; // Rethrow the error to handle it in the calling function
  }
}

const fetchVestingAccounts = async () => {
  const now = Date.now();

  // Use cached data if it's still valid
  if (
    now - vestingAccountsCache.lastFetch < VESTING_CACHE_DURATION &&
    vestingAccountsCache.data
  ) {
    return vestingAccountsCache.data;
  }

  try {
    const vestingAccountsUrl =
      "https://ww-migaloo-rest.polkachu.com/cosmwasm/wasm/v1/contract/migaloo10uky7dtyfagu4kuxvsm26cvpglq25qwlaap2nzxutma594h6rx9qxtk9eq/smart/eyAidmVzdGluZ19hY2NvdW50cyI6IHt9fQ==";
    const response = await axios.get(vestingAccountsUrl);
    console.log(response.data.data.vesting_accounts);
    if (response.data && response.data.data) {
      // Update cache
      vestingAccountsCache = {
        lastFetch: now,
        data: response.data.data.vesting_accounts,
      };
      return vestingAccountsCache.data;
    }
  } catch (error) {
    console.error("Error fetching vesting accounts:", error);
    throw new Error("Failed to fetch vesting accounts");
  }
};

router.get("/seeker-vesting", async (req, res) => {
  const { vestingAddress } = req.query;
  if (!vestingAddress) {
    return res.status(400).send("Vesting address is required");
  }

  const contractAddress =
    "migaloo10uky7dtyfagu4kuxvsm26cvpglq25qwlaap2nzxutma594h6rx9qxtk9eq";
  const limit = 30;

  try {
    let allVestingAccounts = [];
    let startAfter = null;
    let hasMore = true;

    while (hasMore) {
      const queryMsg = {
        vesting_accounts: {
          limit: limit,
          ...(startAfter && { start_after: startAfter }),
        },
      };

      const response = await queryContract(
        contractAddress,
        queryMsg,
        "migaloo"
      );
      console.log(response);

      allVestingAccounts = [
        ...allVestingAccounts,
        ...response.vesting_accounts,
      ];

      if (response.vesting_accounts.length < limit) {
        hasMore = false;
      } else {
        startAfter =
          response.vesting_accounts[response.vesting_accounts.length - 1]
            .address;
      }
    }

    // Find the matching account from all fetched accounts
    const matchingAccount = allVestingAccounts.find(
      (account) => account.address === vestingAddress
    );

    if (!matchingAccount) {
      return res.status(404).send("Account not found");
    }

    const { start_point, end_point } = matchingAccount.info.schedules[0];
    const vestingDetails = {
      address: vestingAddress,
      amountVesting: end_point.amount / 1000000,
      vestingStart: new Date(start_point.time * 1000).toISOString(),
      vestingEnd: new Date(end_point.time * 1000).toISOString(),
      amountClaimed: matchingAccount.info.released_amount / 1000000,
    };

    res.json(vestingDetails);
  } catch (error) {
    console.error("Error fetching vesting details:", error);
    res.status(500).send("Internal server error");
  }
});

router.get("/getAllSeekers", async (req, res) => {
  try {
    const { data: seekers, totalOphirVesting } =
      await fetchAndProcessVestingAccounts();
    console.log(seekers);
    res.json({
      seekers,
      totalOphirVesting,
    });
  } catch (error) {
    console.error("Error fetching all seekers:", error);
    res.status(500).send("Internal server error");
  }
});

async function fetchRedeemTransactions(accountId, page = 1, transactions = []) {
  const url = `https://migaloo.explorer.interbloc.org/transactions/account/${accountId}?per_page=15&page=${page}&order_by=height&order_direction=desc&exclude_failed=false`;
  try {
    const response = await axios.get(url);
    const fetchedTransactions = response.data.transactions;
    if (fetchedTransactions.length === 0) {
      // No more transactions to fetch
      return transactions;
    }
    // Filter transactions where the memo includes "Fee amount in OPHIR"
    const filteredAndMappedTransactions = fetchedTransactions
      .filter(
        (tx) =>
          tx.tx.body &&
          tx.tx.body.memo &&
          tx.tx.body.memo.includes("Fee amount in OPHIR")
      )
      .map((tx) => {
        // Extract coin_received event information
        let coinReceivedAmount = null;
        if (tx.logs && tx.logs.length > 0) {
          tx.logs[0].events.forEach((event) => {
            if (event.type === "coin_received") {
              event.attributes.forEach((attr) => {
                if (
                  attr.key === "amount" &&
                  attr.value.includes("factory/") &&
                  !attr.value.includes("ophir")
                ) {
                  coinReceivedAmount = attr.value;
                }
              });
            }
          });
        }

        return {
          tx: {
            ...tx.tx.body,
            txHash: tx.txhash,
          },
          memo: tx.tx.body.memo,
          timestamp: tx.timestamp,
          coinReceivedAmount: coinReceivedAmount,
        };
      });
    // Concatenate the filtered and mapped transactions with the existing ones
    const allTransactions = transactions.concat(filteredAndMappedTransactions);
    // Recursively fetch the next page
    return fetchRedeemTransactions(accountId, page + 1, allTransactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    throw error; // Rethrow the error to handle it in the calling function
  }
}

async function fetchTransactionsForAccount(
  accountId,
  page = 1,
  transactions = []
) {
  const url = `https://migaloo.explorer.interbloc.org/transactions/account/${accountId}?per_page=15&page=${page}&order_by=height&order_direction=desc&exclude_failed=false`;
  try {
    const response = await axios.get(url);
    const fetchedTransactions = response.data.transactions;
    if (fetchedTransactions.length === 0) {
      // No more transactions to fetch
      return transactions;
    }
    // Filter transactions where the "to" address matches the accountId and denom matches the specified value
    const filteredAndMappedTransactions = fetchedTransactions
      .filter((tx) =>
        tx.tx.body.messages.some(
          (message) =>
            message.toAddress === accountId &&
            message.amount.some(
              (amount) =>
                amount.denom ===
                "ibc/BC5C0BAFD19A5E4133FDA0F3E04AE1FBEE75A4A226554B2CBB021089FF2E1F8A"
            ) &&
            message.amount.some((amount) => amount.amount >= 1000000000)
        )
      )
      .map((tx) => ({
        tx: {
          ...tx.tx.body, // Spread the existing tx.tx.body object
          txHash: tx.txhash, // Assuming txHash is located at tx.txhash
        },
        timestamp: tx.timestamp, // Store the timestamp
      }));
    // Concatenate the filtered and mapped transactions with the existing ones
    const allTransactions = transactions.concat(filteredAndMappedTransactions);
    // Recursively fetch the next page
    return fetchTransactionsForAccount(accountId, page + 1, allTransactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    throw error; // Rethrow the error to handle it in the calling function
  }
}

function sumTransactionAmounts(transactions) {
  let totalAmount = 0;
  transactions.forEach((transaction) => {
    if (transaction.tx.messages && transaction.tx.messages.length > 0) {
      transaction.tx.messages.forEach((message) => {
        if (message.amount && message.amount.length > 0) {
          message.amount.forEach((amount) => {
            totalAmount += parseInt(amount.amount, 10);
          });
        }
      });
    }
  });
  // console.log(totalAmount)
  return 100000000 - totalAmount / 1000000 / 0.0025;
}

function processRedeemTransactions(transactions) {
  const redeemSummary = {};
  const uniqueRedeemers = new Set();

  function parseAssetAmount(assetString) {
    const match = assetString.match(/^(\d+)(.+)$/);
    if (match) {
      return {
        amount: parseInt(match[1]),
        denom: match[2],
      };
    }
    return null;
  }

  transactions.forEach((transaction) => {
    const { tx, memo, timestamp, coinReceivedAmount } = transaction;
    const sender = tx.messages[0].sender;
    const totalAmount = parseInt(tx.messages[0].funds[0].amount) / 1000000; // Divide by 1,000,000

    // Extract fee amount and percentage from memo
    const feeMatch = memo.match(
      /Fee amount in OPHIR: (\d+) \| Fee rate as percentage: ([\d.]+)%/
    );
    const feeAmount = feeMatch ? parseInt(feeMatch[1]) / 1000000 : 0; // Divide by 1,000,000
    const feePercentage = feeMatch ? parseFloat(feeMatch[2]) : 0;

    const redeemedAmount = totalAmount - feeAmount;

    uniqueRedeemers.add(sender);

    if (!redeemSummary[sender]) {
      redeemSummary[sender] = {
        totalRedeemed: 0,
        totalFees: 0,
        redemptions: [],
      };
    }

    redeemSummary[sender].totalRedeemed += redeemedAmount;
    redeemSummary[sender].totalFees += feeAmount;

    let parsedCoinReceived = null;
    if (coinReceivedAmount) {
      parsedCoinReceived = coinReceivedAmount
        .split(",")
        .map((asset) => {
          const parsed = parseAssetAmount(asset);
          if (parsed) {
            return {
              amount: parsed.amount,
              denom: parsed.denom,
            };
          }
          return null;
        })
        .filter((asset) => asset !== null);
    }

    redeemSummary[sender].redemptions.push({
      totalAmount,
      redeemedAmount,
      feeAmount,
      feePercentage,
      timestamp,
      receivedAssets: parsedCoinReceived,
    });
  });

  return {
    summary: redeemSummary,
    uniqueRedeemers: uniqueRedeemers.size,
  };
}

router.get("/redeemAnalytics", async (req, res) => {
  const redeemContractAddress =
    "migaloo10p9ttf976c4q7czknd3z7saejsmx0uwvy4lgzyg09jmtq6up9e3s3wga9m";
  try {
    const transactions = await fetchRedeemTransactions(redeemContractAddress);
    console.log(transactions);
    const { summary, uniqueRedeemers } =
      processRedeemTransactions(transactions);

    res.json({
      redeemSummary: summary,
      uniqueRedeemers,
      totalRedemptions: transactions.length,
    });
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).json({ error: "An unexpected error occurred" });
  }
});

router.get("/getSeekerRoundDetails", async (req, res) => {
  const accountId =
    "migaloo14gu2xfk4m3x64nfkv9cvvjgmv2ymwhps7fwemk29x32k2qhdrmdsp9y2wu";
  try {
    const transactions = await fetchTransactionsForAccount(accountId);
    const ophirLeftInSeekersRound = sumTransactionAmounts(transactions); //
    console.log(ophirLeftInSeekersRound);
    if (vestingAccountsCache.totalOphirVesting === null) {
      await fetchAndProcessVestingAccounts();
    }

    const dollarAmount = 1.63;
    const manualRefundsInOphir = dollarAmount / 0.0025;

    let rawOphirPendingVesting =
      100000000 -
      (ophirLeftInSeekersRound + vestingAccountsCache.totalOphirVesting) -
      manualRefundsInOphir;
    const ophirPendingVesting = Math.round(rawOphirPendingVesting / 10) * 10;
    // console.log(JSON.stringify(transactions, null, 2))
    res.json({
      transactions,
      transactionCount: transactions.length,
      ophirPendingVesting,
      ophirLeftInSeekersRound,
      totalOphirVesting: vestingAccountsCache.totalOphirVesting,
    });
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).json({ error: "An unexpected error occurred" });
  }
});

router.get("/calculateRedemptionValue", async (req, res) => {
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
      if (key !== "ophir" && treasury[key] != null) {
        return count + 1;
      }
      return count;
    }, 0);
    const treasuryValueWithoutOphir = parseFloat(
      treasury["treasuryValueWithoutOphir"].replace(/,/g, "")
    );
    const assetPercentages = Object.keys(treasury).reduce((acc, key) => {
      if (
        key === "ophir" ||
        key === "treasuryValueWithoutOphir" ||
        !treasury[key].balance ||
        !price[key]
      )
        return acc; // Skip if key is 'ophir', 'treasuryValueWithoutOphir', balance or price is null

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
    // console.log(finalValues);

    res.json({
      ...finalValues,
      redemptionPricePerOPHIR: redemptionPrice,
      totalRedemptionValue: totalValue,
      calculatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error calculating redemption value:", error);
    res.status(500).send("Internal server error");
  }
});

router.get("/totalTreasuryValue", async (req, res) => {
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
    console.error("Error fetching total treasury value:", error);
    res.status(500).send("Internal server error");
  }
});

router.get("/cleanChartData", async (req, res) => {
  try {
    const snapshot = await firebaseOphirTreasury.once("value");
    const data = snapshot.val();

    if (!data) {
      return res.status(404).send("No chart data found");
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
        firebaseOphirTreasury
          .child(assetName)
          .set(cleanedData)
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

    res.send("Chart data cleaned successfully");
  } catch (error) {
    console.error("Error cleaning chart data:", error);
    res.status(500).send("Internal server error");
  }
});

router.get("/denoms", async (req, res) => {
  try {
    const invertedMappings = Object.keys(tokenMappings).reduce((acc, key) => {
      const symbol = tokenMappings[key].symbol;
      acc[symbol] = key;
      return acc;
    }, {});
    res.status(200).json(invertedMappings);
  } catch (error) {
    console.error("Error fetching denoms with symbols:", error);
    res.status(500).send("Internal server error");
  }
});

async function queryTransaction(txHash) {
  const rpcEndpoint = "https://migaloo-testnet-rpc.polkachu.com";

  try {
    const client = await StargateClient.connect(rpcEndpoint);
    const tx = await client.getTx(txHash);
    if (tx) {
      return tx.rawLog;
    } else {
      console.log("Transaction not found");
      return null; // Return null if the transaction is not found
    }
  } catch (error) {
    console.error("Error querying transaction:", error);
    throw error; // Rethrow the error to handle it outside this function if necessary
  }
}

router.get("/migaloo-testnet/:txHash", async (req, res) => {
  const txHash = req.params.txHash;
  try {
    const queryResult = await queryTransaction(txHash);
    try {
      const parsedResult = JSON.parse(queryResult); // Attempt to parse the queryResult as JSON
      res.status(200).json(parsedResult);
    } catch (parseError) {
      // If parsing fails, return the queryResult as is, assuming it's a plain string message
      res.status(200).json({ message: queryResult });
    }
  } catch (error) {
    console.error("Error querying transaction:", error);
    res.status(500).send("Internal server error");
  }
});

router.get("/nft-stats/runestone", async (req, res) => {
  const apiUrl =
    "https://api-mainnet.magiceden.io/v2/ord/btc/stat?collectionSymbol=runestone";
  try {
    const response = await axios.get(apiUrl);
    res.status(200).json(response.data);
  } catch (error) {
    console.error("Error fetching Runestone stats:", error);
    res.status(500).send("Internal server error");
  }
});

router.get("/kujiraGhostPrices", async (req, res) => {
  const { assets } = req.query;
  if (!assets) {
    return res.status(400).send("Assets parameter is required");
  }

  try {
    let pricesObj = {};
    const assetsArray = assets.split(","); // Assuming assets are comma-separated
    for (const asset of assetsArray) {
      const assetKey = Object.keys(kujiraGhostContracts).find(
        (key) => kujiraGhostContracts[key].contract === `x${asset.trim()}`
      );
      if (assetKey) {
        const response = await axios.get(
          `https://api.kujira.app/api/trades?contract=${assetKey}`
        );
        const data = response.data;
        if (data.trades && data.trades.length > 0) {
          pricesObj[asset] = data.trades[0].trade_price;
        } else {
          pricesObj[asset] = "No trade data available";
        }
      } else {
        pricesObj[asset] = "Asset not found";
      }
    }
    return res.json(pricesObj);
  } catch (error) {
    console.error(`Error fetching ghost prices for assets - ${error}`);
    return res.status(500).send("Internal Server Error");
  }
});

router.get("/", (req, res) => {
  const routes = [];
  router.stack.forEach((middleware) => {
    if (middleware.route) {
      // if it's a real route
      routes.push(middleware.route.path);
    }
  });
  res.status(200).json({ availableEndpoints: routes });
});

const cron = require("node-cron");
let nextUpdateTime;
// Schedule the fetchDataAndStore function to run every 4 hours
cron.schedule("0 */4 * * *", () => {
  nextUpdateTime = getNextUpdateTime();
  console.log("Fetching data and storing...");
  fetchDataAndStore();
});

// Calculate the next update time based on the current time
function getNextUpdateTime() {
  const now = new Date();
  const nextUpdateTime = new Date(now);
  nextUpdateTime.setHours(now.getHours() + 4); // Set the update time to 4 hours later
  return nextUpdateTime;
}

router.get("/nextUpdateTime", (req, res) => {
  nextUpdateTime = getNextUpdateTime();
  res.status(200).json({ nextUpdateTime: nextUpdateTime });
});

module.exports = router;
