const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const { getDatabase } = require('firebase-admin/database');
const { getFirestore } = require('firebase-admin/firestore');
const cron = require('node-cron');

const router = express.Router();

// Initialize Firebase if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(require('../../resources/firebase/firebase-admin.json')),
    databaseURL: "https://parallax-analytics-server-default-rtdb.firebaseio.com",
  });
}

const db = getDatabase();
const firestore = getFirestore();
const firebaseKosherRef = db.ref('crypto/kosher');

// Replace the cache object with Firebase references
const firebaseKosherTransactionsRef = firebaseKosherRef.child('transactions');
const firebaseKosherBalancesRef = firebaseKosherRef.child('balances');
const firebaseKosherFundsRef = db.ref('/');  // Start at root

function createRateLimiter(requestsPerSecond) {
  let lastRequest = 0;
  const minInterval = 1000 / requestsPerSecond;

  return async function rateLimitedRequest(config) {
    const now = Date.now();
    const timeToWait = Math.max(0, lastRequest + minInterval - now);
    
    if (timeToWait > 0) {
      await new Promise(resolve => setTimeout(resolve, timeToWait));
    }
    
    lastRequest = Date.now();
    return axios(config);
  };
}

// Create the rate-limited axios instance
const throttledAxios = createRateLimiter(0.5); // 1 request per 2 seconds

async function getAllTransactions(address) {
  const baseUrl = `https://public-api.solanabeach.io/v1/account/${address}/transactions`;
  let allTransactions = [];
  let hasMore = true;
  
  try {
    // 1. First request to get initial transactions
    const initialResponse = await axios.get(baseUrl, {
      headers: {
        'accept': '*/*',
        'content-type': 'application/json',
        'origin': 'https://solanabeach.io',
        'referer': 'https://solanabeach.io/',
        'sec-fetch-site': 'same-site',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
      }
    });

    if (initialResponse.data && initialResponse.data.length > 0) {
      allTransactions = [...initialResponse.data];
      
      // Find the transaction with the smallest block height
      const lastTx = initialResponse.data[initialResponse.data.length - 1];
      let cursor = `${lastTx.blockNumber}%2C0`;
      let before = lastTx.signature;

      // 2. Continue fetching with cursor and before parameters
      while (hasMore) {
        const url = `${baseUrl}?cursor=${cursor}&before=${before}`;
        const response = await axios.get(url, {
          headers: {
            'accept': '*/*',
            'content-type': 'application/json',
            'origin': 'https://solanabeach.io',
            'referer': 'https://solanabeach.io/',
            'sec-fetch-site': 'same-site',
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
          }
        });

        if (response.data && response.data.length > 0) {
          allTransactions = [...allTransactions, ...response.data];
          
          // Update cursor and before with values from the last transaction
          const lastTx = response.data[response.data.length - 1];
          cursor = `${lastTx.blockNumber}%2C0`;
          before = lastTx.signature;
        } else {
          hasMore = false;
        }

        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return allTransactions;

  } catch (error) {
    console.error('Error fetching transactions:', error.response?.data || error.message);
    throw error;
  }
}

// Add near the top with other cache-related variables
let balancesCache = {
  data: null,
  lastFetch: null
};
const BALANCES_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Add near the top with other constants
const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so';

// Replace the /rabbi/balances endpoint
router.get('/rabbi/balances', async (req, res) => {
  try {
    // Add debugging
    console.log('BIRDEYE_API_KEY:', process.env.BIRDEYE_API_KEY);
    console.log('All env variables:', process.env);

    const now = Date.now();
    
    // Verify API key exists
    if (!process.env.BIRDEYE_API_KEY) {
      throw new Error('Birdeye API key is not configured in environment variables');
    }

    // Check if cache is valid
    if (balancesCache.data && balancesCache.lastFetch && 
        (now - balancesCache.lastFetch) < BALANCES_CACHE_DURATION) {
      return res.json({
        success: true,
        data: balancesCache.data
      });
    }

    // Fetch fresh data if cache is invalid
    const address = '5Rn9eECNAF8YHgyri7BUe5pbvP7KwZqNF25cDc3rExwt';
    
    // Fetch portfolio data from Birdeye
    const birdeyeResponse = await axios.get(`${BIRDEYE_BASE_URL}/v1/wallet/token_list`, {
      params: {
        wallet: address,
        chain: 'solana'
      },
      headers: {
        'X-API-KEY': process.env.BIRDEYE_API_KEY
      }
    });

    const responseData = birdeyeResponse.data?.data;
    
    // Format the response
    const balanceData = {
      wallet: responseData.wallet,
      tokens: responseData.items.map(token => ({
        mint: token.address,
        amount: token.uiAmount,
        decimals: token.decimals,
        symbol: token.symbol,
        name: token.name,
        icon: token.icon,
        price: token.priceUsd,
        value: token.valueUsd,
        rawAmount: token.balance
      })),
      totalValue: responseData.totalUsd,
      lastUpdated: new Date().toISOString(),
      solBalance: responseData.items.find(token => 
        token.address === "So11111111111111111111111111111111111111111"
      )?.uiAmount || 0
    };

    // Update cache
    balancesCache = {
      data: balanceData,
      lastFetch: now
    };

    res.json({
      success: true,
      data: balanceData
    });

  } catch (error) {
    console.error('Error serving balances:', error);
    
    // If we have cached data, return it
    if (balancesCache.data) {
      return res.json({
        success: true,
        data: balancesCache.data,
        fromCache: true
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch token balances'
    });
  }
});

// Near the top with other global variables
let transactionsCache = {
  data: new Map(), // Using Map to store transactions by signature
  lastFetch: null
};
const FETCH_INTERVAL = 10 * 60 * 1000; // 10 minutes
const INITIAL_FETCH_COUNT = 200;
const UPDATE_FETCH_COUNT = 10; // Fetch fewer transactions during updates
const MAX_CACHE_SIZE = 1000; // Maximum number of transactions to keep in cache
const CLEANUP_THRESHOLD = 900; // When to trigger cleanup (90% of max)
const CRON_SCHEDULE = '*/10 * * * *'; // Runs every 10 minutes

// Function to clean up old transactions when cache gets too large
function cleanupCache() {
  if (transactionsCache.data.size > CLEANUP_THRESHOLD) {
    console.log(`Cleaning up cache. Current size: ${transactionsCache.data.size}`);
    
    // Convert to array, sort by timestamp, and get newest MAX_CACHE_SIZE/2 transactions
    const sortedTxs = Array.from(transactionsCache.data.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_CACHE_SIZE/2);
    
    // Reset cache with cleaned up data
    transactionsCache.data = new Map(
      sortedTxs.map(tx => [tx.signature, tx])
    );
    
    console.log(`Cleanup complete. New size: ${transactionsCache.data.size}`);
  }
}

// Modify the warmupCache function
async function warmupCache() {
  console.log('🚀 Starting cache warmup...');
  try {
    // First check Firebase for existing data
    const snapshot = await firebaseKosherTransactionsRef.once('value');
    const existingData = snapshot.val();
    
    if (existingData?.data && existingData.data.length > 0) {
      console.log(`📦 Found ${existingData.data.length} existing transactions in Firebase`);
      
      // Fetch just the latest transaction to check for updates
      const latestSignatures = await quickNodeRateLimiter({
        method: 'post',
        url: 'https://cold-black-ensemble.solana-mainnet.quiknode.pro/b0951b93f19937b54d611188abdf253e661902f3/',
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          "jsonrpc": "2.0",
          "id": 1,
          "method": "getSignaturesForAddress",
          "params": [
            "5Rn9eECNAF8YHgyri7BUe5pbvP7KwZqNF25cDc3rExwt",
            { "limit": UPDATE_FETCH_COUNT }
          ]
        }
      });

      if (latestSignatures.data?.result) {
        const mostRecentStoredTx = existingData.data[0]; // Since we keep them sorted
        const newSignatures = latestSignatures.data.result.filter(
          sig => !existingData.data.some(tx => tx.trans_id === sig.signature)
        );

        if (newSignatures.length > 0) {
          console.log(`🔄 Found ${newSignatures.length} new transactions to fetch`);
          const newTransactions = await fetchTransactionsFromQuickNode(UPDATE_FETCH_COUNT);
          
          // Merge new transactions with existing ones
          const allTransactions = [...newTransactions, ...existingData.data]
            .sort((a, b) => b.block_time - a.block_time)
            .slice(0, MAX_STORED_TRANSACTIONS);

          // Update Firebase with merged data
          await firebaseKosherTransactionsRef.set({
            data: allTransactions,
            lastFetch: Date.now()
          });
          
          console.log(`✅ Cache updated with ${allTransactions.length} total transactions`);
        } else {
          console.log('✨ Cache is already up to date');
        }
      }
    } else {
      console.log('🆕 No existing data found, performing initial fetch');
      // Only perform full fetch if no data exists
      const transactions = await fetchTransactionsFromQuickNode(INITIAL_FETCH_COUNT);
      
      await firebaseKosherTransactionsRef.set({
        data: transactions,
        lastFetch: Date.now()
      });

      console.log(`✅ Initial cache populated with ${transactions.length} transactions`);
    }
  } catch (error) {
    console.error('❌ Error during cache warmup:', error);
  }
}

// Modify the cron job
cron.schedule(CRON_SCHEDULE, async () => {
  console.log('Running scheduled cache update...');
  try {
    const newTransactions = await fetchTransactionsFromQuickNode(UPDATE_FETCH_COUNT);
    console.log(`Fetched ${newTransactions.length} new transactions`);

    // Get existing transactions from Firebase
    const snapshot = await firebaseKosherTransactionsRef.once('value');
    const existingData = snapshot.val() || { data: [] };
    
    // Merge new transactions with existing ones
    const mergedTransactions = [...newTransactions, ...existingData.data]
      .filter((tx, index, self) => 
        index === self.findIndex(t => t.trans_id === tx.trans_id)
      )
      .slice(0, MAX_CACHE_SIZE); // Keep only the most recent transactions

    // Update Firebase
    await firebaseKosherTransactionsRef.set({
      data: mergedTransactions,
      lastFetch: Date.now()
    });

    console.log(`Cache updated. New size: ${mergedTransactions.length}`);
  } catch (error) {
    console.error('Error in scheduled cache update:', error);
  }
});

// Modify the transactions endpoint
router.get('/rabbi/transactions', async (req, res) => {
  try {
    const snapshot = await firebaseKosherTransactionsRef.once('value');
    const data = snapshot.val();

    if (!data || !data.data || data.data.length === 0) {
      await warmupCache();
      const newSnapshot = await firebaseKosherTransactionsRef.once('value');
      const newData = newSnapshot.val();
      
      if (!newData || !newData.data) {
        throw new Error('Failed to initialize transaction data');
      }
      
      return res.json({
        success: true,
        data: newData.data,
        count: newData.data.length
      });
    }

    // Return transactions sorted by block time
    const transactions = data.data.sort((a, b) => b.block_time - a.block_time);

    res.json({
      success: true,
      data: transactions,
      count: transactions.length
    });

  } catch (error) {
    console.error('Error serving transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve transactions'
    });
  }
});

// Helper function for SolanaBeach
async function fetchTransactionsFromSolanaBeach(limit) {
  const response = await throttledAxios({
    method: 'get',
    url: `https://public-api.solanabeach.io/v1/account/5Rn9eECNAF8YHgyri7BUe5pbvP7KwZqNF25cDc3rExwt/transactions`,
    headers: {
      'accept': '*/*',
      'content-type': 'application/json',
      'origin': 'https://solanabeach.io',
      'referer': 'https://solanabeach.io/',
      'sec-fetch-site': 'same-site',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }
  });
  
  return {
    transactions: (response.data || []).slice(0, limit)
  };
}

// Add these near the top with other constants
const QUICKNODE_RATE_LIMIT = 10; // requests per second
const BATCH_SIZE = 1; // Process one at a time
const RATE_LIMIT_DELAY = 1000; // 1 second between requests
const MAX_RETRIES = 5;
const RETRY_DELAY = 3000; // 3 seconds

// Add a rate limiter for QuickNode
const quickNodeRateLimiter = createRateLimiter(QUICKNODE_RATE_LIMIT);

// Modified QuickNode helper function
async function fetchTransactionsFromQuickNode(limit) {
  console.log(`🔍 Fetching up to ${limit} transactions...`);
  
  const response = await quickNodeRateLimiter({
    method: 'post',
    url: 'https://cold-black-ensemble.solana-mainnet.quiknode.pro/b0951b93f19937b54d611188abdf253e661902f3/',
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      "jsonrpc": "2.0",
      "id": 1,
      "method": "getSignaturesForAddress",
      "params": [
        "5Rn9eECNAF8YHgyri7BUe5pbvP7KwZqNF25cDc3rExwt",
        { "limit": limit }
      ]
    }
  });

  if (!response.data?.result) {
    console.log('❌ No signatures found');
    return [];
  }

  const transactions = [];
  const signatures = response.data.result;
  console.log(`📝 Found ${signatures.length} signatures to process`);
  
  // Get existing transactions from Firebase
  const snapshot = await firebaseKosherTransactionsRef.once('value');
  const existingData = snapshot.val()?.data || [];
  
  // Create a Map of existing transactions for quick lookup
  const existingTxMap = new Map(
    existingData.map(tx => [tx.trans_id, tx])
  );
  
  console.log(`📦 Loaded ${existingTxMap.size} existing transactions from Firebase`);
  
  for (let i = 0; i < signatures.length; i++) {
    const tx = signatures[i];
    
    // Check if we already have this transaction in Firebase
    if (existingTxMap.has(tx.signature)) {
      console.log(`✅ Using cached data for transaction ${tx.signature}`);
      transactions.push(existingTxMap.get(tx.signature));
      continue;
    }
    
    console.log(`🔄 Fetching new transaction data for ${tx.signature}`);
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        
        const txResponse = await quickNodeRateLimiter({
          method: 'post',
          url: 'https://cold-black-ensemble.solana-mainnet.quiknode.pro/b0951b93f19937b54d611188abdf253e661902f3/',
          headers: {
            'Content-Type': 'application/json',
          },
          data: {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTransaction",
            "params": [
              tx.signature,
              {
                "maxSupportedTransactionVersion": 0,
                "encoding": "jsonParsed"
              }
            ]
          }
        });

        const txData = txResponse.data?.result;
        if (!txData) {
          console.log(`⚠️ No transaction data found for ${tx.signature}`);
          break;
        }

        const tokenTransfers = [];
        if (txData?.meta?.preTokenBalances && txData?.meta?.postTokenBalances) {
          const preBalances = new Map(txData.meta.preTokenBalances.map(b => [`${b.accountIndex}-${b.mint}`, b]));
          const postBalances = new Map(txData.meta.postTokenBalances.map(b => [`${b.accountIndex}-${b.mint}`, b]));
          
          // Track all token changes for this wallet
          const walletChanges = new Map();
          
          // Process all account changes
          const walletAddress = "5Rn9eECNAF8YHgyri7BUe5pbvP7KwZqNF25cDc3rExwt";
          
          // First, check for SOL balance changes
          if (txData.meta?.preBalances && txData.meta?.postBalances) {
            // Find our wallet's index in the accounts array
            const walletIndex = txData.transaction.message.accountKeys.findIndex(
              key => key.pubkey === walletAddress
            );
            
            if (walletIndex !== -1) {
              const preSolBalance = txData.meta.preBalances[walletIndex];
              const postSolBalance = txData.meta.postBalances[walletIndex];
              const solChange = (postSolBalance - preSolBalance) / 1e9; // Convert from lamports to SOL
              
              // Only track if there's a meaningful change (excluding fees)
              if (Math.abs(solChange) > 0.000001 && Math.abs(solChange) !== txData.meta.fee / 1e9) {
                walletChanges.set("So11111111111111111111111111111111111111112", {
                  token_address: "So11111111111111111111111111111111111111112",
                  token_decimals: 9,
                  net_amount: solChange
                });
              }
            }
          }

          // Then process token accounts (existing code)
          txData.meta.postTokenBalances.forEach(postBalance => {
            const preBalance = txData.meta.preTokenBalances.find(
              pre => pre.accountIndex === postBalance.accountIndex && pre.mint === postBalance.mint
            );
            
            if (preBalance && postBalance.owner === walletAddress) {
              const change = postBalance.uiTokenAmount.uiAmount - preBalance.uiTokenAmount.uiAmount;
              
              if (!walletChanges.has(postBalance.mint)) {
                walletChanges.set(postBalance.mint, {
                  token_address: postBalance.mint,
                  token_decimals: postBalance.uiTokenAmount.decimals,
                  net_amount: 0
                });
              }
              
              walletChanges.get(postBalance.mint).net_amount += change;
            }
          });
          
          // Convert to swap format if we have exactly one decrease and one increase
          const decreases = [];
          const increases = [];
          walletChanges.forEach((change, mint) => {
            if (Math.abs(change.net_amount) >= 0.000001) {
              if (change.net_amount < 0) {
                decreases.push({
                  token_address: change.token_address,
                  token_decimals: change.token_decimals,
                  amount: Math.abs(change.net_amount)
                });
              } else {
                increases.push({
                  token_address: change.token_address,
                  token_decimals: change.token_decimals,
                  amount: change.net_amount
                });
              }
            }
          });

          if (decreases.length === 1 && increases.length === 1) {
            tokenTransfers.push({
              block_id: tx.slot,
              block_time: tx.blockTime,
              time: new Date(tx.blockTime * 1000).toISOString(),
              trans_id: tx.signature,
              type: 'swap',
              from_token: {
                token_address: decreases[0].token_address,
                token_decimals: decreases[0].token_decimals,
                amount: Math.round(decreases[0].amount * Math.pow(10, decreases[0].token_decimals))
              },
              to_token: {
                token_address: increases[0].token_address,
                token_decimals: increases[0].token_decimals,
                amount: Math.round(increases[0].amount * Math.pow(10, increases[0].token_decimals))
              },
              fee: txData?.meta?.fee || 0
            });
          } else if (decreases.length > 0 || increases.length > 0) {
            // Handle non-swap transfers
            walletChanges.forEach((change, mint) => {
              if (Math.abs(change.net_amount) >= 0.000001) {
                tokenTransfers.push({
                  block_id: tx.slot,
                  block_time: tx.blockTime,
                  time: new Date(tx.blockTime * 1000).toISOString(),
                  trans_id: tx.signature,
                  type: 'transfer',
                  token_address: change.token_address,
                  token_decimals: change.token_decimals,
                  amount: Math.round(Math.abs(change.net_amount) * Math.pow(10, change.token_decimals)),
                  change_type: change.net_amount > 0 ? 'inc' : 'dec',
                  fee: txData?.meta?.fee || 0
                });
              }
            });
          }
        }

        if (tokenTransfers.length > 0) {
          console.log(`✨ Processed ${tokenTransfers.length} token transfers for ${tx.signature}`);
          // Store each transfer individually
          tokenTransfers.forEach(transfer => {
            transactions.push(transfer);
          });
        } else {
          console.log(`ℹ️ No token transfers found for ${tx.signature}`);
        }
        
        break;
        
      } catch (error) {
        retries++;
        if (error.response?.status === 429) {
          console.log(`⏳ Rate limited, retry ${retries}/${MAX_RETRIES} for ${tx.signature}`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries));
        } else if (retries === MAX_RETRIES) {
          console.log(`❌ Max retries reached for ${tx.signature}`);
          break;
        } else {
          console.error(`❌ Error processing ${tx.signature}:`, error);
          throw error;
        }
      }
    }
  }

  console.log(`📊 Total transactions processed: ${transactions.length}`);
  return transactions;
}

// Get SHEKEL price data
router.get('/rabbi/price', async (req, res) => {
  try {
    const response = await axios.get(
      'https://app.geckoterminal.com/api/p1/base/pools/0xdEd72b40970af70720aDBc5127092f3152392273',
      {
        params: {
          include: 'dex,tokens'
        },
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          'Accept-Encoding': 'gzip, deflate, br',
          'Origin': 'https://www.geckoterminal.com',
          'Referer': 'https://www.geckoterminal.com/'
        }
      }
    );

    const priceData = response.data.data.attributes;
    const historicalData = priceData.historical_data;

    // Format the response
    const formattedData = {
      success: true,
      data: {
        current_price: {
          usd: parseFloat(priceData.price_in_usd),
          eth: parseFloat(priceData.price_in_target_token)
        },
        market_data: {
          fdv_usd: parseFloat(priceData.fully_diluted_valuation),
          volume_24h: parseFloat(priceData.from_volume_in_usd),
          liquidity_usd: parseFloat(priceData.reserve_in_usd)
        },
        price_change: {
          '5m': priceData.price_percent_changes.last_5m,
          '15m': priceData.price_percent_changes.last_15m,
          '30m': priceData.price_percent_changes.last_30m,
          '1h': priceData.price_percent_changes.last_1h,
          '6h': priceData.price_percent_changes.last_6h,
          '24h': priceData.price_percent_changes.last_24h
        },
        trading_activity: {
          swaps_24h: priceData.swap_count_24h,
          buys_24h: historicalData.last_24h.buyers_count,
          sells_24h: historicalData.last_24h.sellers_count
        },
        lastUpdated: new Date().toISOString()
      }
    };

    res.json(formattedData);

  } catch (error) {
    console.error('Error fetching SHEKEL price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SHEKEL price data'
    });
  }
});

// Add price cache
let tokenPriceCache = new Map();
let ethPriceCache = {
  price: 0,
  timestamp: 0
};
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getEthPrice() {
  const now = Date.now();
  
  if (ethPriceCache.timestamp && (now - ethPriceCache.timestamp) < PRICE_CACHE_DURATION) {
    return ethPriceCache.price;
  }

  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'ethereum',
        vs_currencies: 'usd'
      }
    });

    if (response.data?.ethereum?.usd) {
      ethPriceCache = {
        price: response.data.ethereum.usd,
        timestamp: now
      };
      return ethPriceCache.price;
    }
    return 0;
  } catch (error) {
    console.error('Error fetching ETH price from CoinGecko:', error);
    return ethPriceCache.price || 0; // Return cached price if available, otherwise 0
  }
}

async function getTokenPrice(tokenAddress) {
  // Special case for ETH
  if (tokenAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
    return {
      price: await getEthPrice(),
      logoURI: "https://assets.coingecko.com/coins/images/279/large/ethereum.png"
    };
  }

  const now = Date.now();
  const cachedData = tokenPriceCache.get(tokenAddress);
  
  if (cachedData && (now - cachedData.timestamp) < PRICE_CACHE_DURATION) {
    return cachedData;
  }

  try {
    const response = await axios.get(`https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`, {
      headers: {
        'accept': 'application/json',
        'x-chain': 'base',
        'X-API-KEY': '1c6ae418826b4328ab69a4debae6470e'
      }
    });

    if (response.data?.data) {
      const data = {
        price: response.data.data.price || 0,
        logoURI: response.data.data.logoURI || '',
        timestamp: now
      };
      tokenPriceCache.set(tokenAddress, data);
      return data;
    }
    return { price: 0, logoURI: '' };
  } catch (error) {
    console.error(`Error fetching price for token ${tokenAddress}:`, error);
    return { price: 0, logoURI: '' };
  }
}

async function getWalletBalances(walletAddress) {
  try {
    const response = await axios.get(`https://public-api.birdeye.so/v1/wallet/token_list?wallet=${walletAddress}`, {
      headers: {
        'accept': 'application/json',
        'x-chain': 'base',
        'X-API-KEY': '1c6ae418826b4328ab69a4debae6470e'
      }
    });

    if (response.data?.success) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching balances for wallet ${walletAddress}:`, error);
    return null;
  }
}

const FIRESTORE_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

async function shouldUpdateFirestore(fundId) {
  try {
    const fundDoc = await firestore.collection('funds').doc(fundId).get();
    if (!fundDoc.exists) return true;
    
    const data = fundDoc.data();
    const lastUpdate = data.lastBalanceUpdate?.toMillis() || 0;
    return (Date.now() - lastUpdate) > FIRESTORE_CACHE_DURATION;
  } catch (error) {
    console.error('Error checking Firestore update time:', error);
    return true;
  }
}

async function updateFirestoreBalances(fundId, balanceData) {
  try {
    const fundRef = firestore.collection('funds').doc(fundId);
    const fundDoc = await fundRef.get();
    
    if (!fundDoc.exists) {
      console.log(`Fund document ${fundId} doesn't exist, cannot update balances`);
      return;
    }

    // Merge the new balance data with existing fund data
    const updateData = {
      ...fundDoc.data(),  // Keep existing fund data
      balances: balanceData,
      lastBalanceUpdate: admin.firestore.Timestamp.now()
    };

    // Use set with merge to ensure we don't lose any existing data
    await fundRef.set(updateData, { merge: true });
    console.log(`Updated Firestore balances for fund ${fundId}:`, balanceData);
  } catch (error) {
    console.error(`Error updating Firestore balances for fund ${fundId}:`, error);
  }
}

// Helper function to calculate token weights
async function processTokenBalances(balances) {
  let totalValue = 0;
  let tokens = [];
  
  if (balances?.items) {
    // First pass: calculate total value
    for (const token of balances.items) {
      let tokenData = { price: 0, logoURI: '' };
      if (token.address !== "0x4A67aFD36c48774EA645991720821279378C281a") { // Skip null address
        tokenData = await getTokenPrice(token.address);
      }
      const value = token.uiAmount * tokenData.price;
      if (value > 0) {  // Only count non-zero values in total
        totalValue += value;
      }
    }

    // Second pass: create token objects with weights
    tokens = await Promise.all(balances.items.map(async token => {
      let tokenData = { price: 0, logoURI: '' };
      if (token.address !== "0x4A67aFD36c48774EA645991720821279378C281a") { // Skip null address
        tokenData = await getTokenPrice(token.address);
      }
      
      const value = token.uiAmount * tokenData.price;
      const weight = totalValue > 0 ? (value / totalValue * 100) : 0;
      
      return {
        address: token.address,
        name: token.name || 'Unknown',
        symbol: token.symbol || 'Unknown',
        decimals: token.decimals,
        balance: token.balance,
        uiAmount: token.uiAmount,
        price: tokenData.price,
        value,
        weight: Number(weight.toFixed(2)), // Round to 2 decimal places
        logoURI: tokenData.logoURI
      };
    }));

    // Filter out zero balances
    tokens = tokens.filter(t => t.uiAmount > 0);
    
    // Sort by weight descending
    tokens.sort((a, b) => b.weight - a.weight);
  }

  return {
    totalValue: Number(totalValue.toFixed(2)),
    tokens
  };
}

// Update the funds endpoint
router.get('/funds', async (req, res) => {
  try {
    console.log('Fetching funds data from Firestore...');
    
    const fundsSnapshot = await firestore.collection('funds').get();
    
    if (fundsSnapshot.empty) {
      console.log('No funds found in Firestore');
      return res.json({
        success: true,
        data: []
      });
    }

    // Process each fund and get its balances
    const fundsPromises = fundsSnapshot.docs.map(async doc => {
      const fund = doc.data();
      const fundId = doc.id;
      let balanceData = null;

      // Check if we need to update Firestore
      const needsUpdate = await shouldUpdateFirestore(fundId);
      
      if (needsUpdate) {
        console.log(`Fetching fresh balances for fund ${fundId}`);
        const balances = await getWalletBalances(fund.fundContractAddress || fundId);
        balanceData = await processTokenBalances(balances);

        // Update Firestore with new balance data
        await updateFirestoreBalances(fundId, balanceData);
      } else {
        // Use cached data from Firestore
        console.log(`Using cached balances for fund ${fundId}`);
        balanceData = fund.balances;
      }

      return {
        id: fundId,
        contractAddress: fund.fundContractAddress || fundId,
        createdAt: fund.createdAt || '',
        description: fund.description || '',
        fundManagers: Array.isArray(fund.fundManagers) ? fund.fundManagers : 
          (fund.fundManagers ? [fund.fundManagers] : []),
        name: fund.name || '',
        balances: balanceData
      };
    });

    const funds = await Promise.all(fundsPromises);
    console.log('Processed funds with balances:', funds);

    res.json({
      success: true,
      data: funds
    });

  } catch (error) {
    console.error('Error fetching funds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch funds data'
    });
  }
});

// Update the single fund endpoint
router.get('/funds/:fundId', async (req, res) => {
  try {
    const { fundId } = req.params;
    console.log(`Fetching data for fund ${fundId}...`);
    
    const fundDoc = await firestore.collection('funds').doc(fundId).get();
    
    if (!fundDoc.exists) {
      console.log(`Fund ${fundId} not found`);
      return res.status(404).json({
        success: false,
        error: 'Fund not found'
      });
    }

    const fund = fundDoc.data();
    let balanceData = null;

    // Check if we need to update Firestore
    const needsUpdate = await shouldUpdateFirestore(fundId);
    
    if (needsUpdate) {
      console.log(`Fetching fresh balances for fund ${fundId}`);
      const balances = await getWalletBalances(fund.fundContractAddress || fundId);
      balanceData = await processTokenBalances(balances);

      // Update Firestore with new balance data
      await updateFirestoreBalances(fundId, balanceData);
    } else {
      // Use cached data from Firestore
      console.log(`Using cached balances for fund ${fundId}`);
      balanceData = fund.balances;
    }

    const response = {
      id: fundId,
      contractAddress: fund.fundContractAddress || fundId,
      baseToken: fund.baseToken || '',
      chain: fund.chain || '',
      createdAt: fund.createdAt || '',
      description: fund.description || '',
      fundManagers: Array.isArray(fund.fundManagers) ? fund.fundManagers : 
        (fund.fundManagers ? [fund.fundManagers] : []),
      fundToken: fund.fundToken || '',
      name: fund.name || '',
      balances: balanceData
    };

    console.log('Processed fund data:', response);

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error(`Error fetching fund ${req.params.fundId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fund data'
    });
  }
});

// Optional: Add an endpoint to create/update funds (admin only)
router.post('/funds', async (req, res) => {
  try {
    const { name, description, contractAddress, managers } = req.body;

    if (!name || !description || !contractAddress || !managers) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const newFund = {
      name,
      description,
      contractAddress,
      managers,
      createdAt: new Date().toISOString()
    };

    // Get existing funds
    const snapshot = await firebaseKosherFundsRef.once('value');
    const existingFunds = snapshot.val() || [];

    // Add new fund
    await firebaseKosherFundsRef.set([...existingFunds, newFund]);

    res.json({
      success: true,
      data: newFund
    });

  } catch (error) {
    console.error('Error creating fund:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create fund'
    });
  }
});

// Change cache clear endpoint from POST to GET
router.get('/clear-cache', async (req, res) => {
  try {
    // Clear all caches
    tokenPriceCache.clear();
    ethPriceCache = {
      price: 0,
      timestamp: 0
    };

    // Force update all funds in Firestore by setting lastBalanceUpdate to 0
    const fundsSnapshot = await firestore.collection('funds').get();
    const updatePromises = fundsSnapshot.docs.map(doc => 
      doc.ref.update({
        lastBalanceUpdate: admin.firestore.Timestamp.fromMillis(0)
      })
    );
    
    await Promise.all(updatePromises);

    console.log('Successfully cleared all caches');
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

module.exports = router;
