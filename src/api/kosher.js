const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const { getDatabase } = require('firebase-admin/database');
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
const firebaseKosherRef = db.ref('crypto/kosher');

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

// Get token balances
router.get('/rabbi/balances', async (req, res) => {
  const address = '5Rn9eECNAF8YHgyri7BUe5pbvP7KwZqNF25cDc3rExwt';
  
  try {
    // Fetch token balances using QuickNode
    const tokensResponse = await quickNodeRateLimiter({
      method: 'post',
      url: 'https://cold-black-ensemble.solana-mainnet.quiknode.pro/b0951b93f19937b54d611188abdf253e661902f3/',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTokenAccountsByOwner",
        "params": [
          address,
          {
            "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
          },
          {
            "encoding": "jsonParsed"
          }
        ]
      }
    });

    // Fetch SOL balance using QuickNode
    const solResponse = await quickNodeRateLimiter({
      method: 'post',
      url: 'https://cold-black-ensemble.solana-mainnet.quiknode.pro/b0951b93f19937b54d611188abdf253e661902f3/',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getBalance",
        "params": [address]
      }
    });

    const solBalance = solResponse.data?.result?.value / 1e9; // Convert lamports to SOL
    const tokens = tokensResponse.data?.result?.value || [];

    // Format token data
    const formattedTokens = tokens.map(item => ({
      mint: item.account.data.parsed.info.mint,
      amount: item.account.data.parsed.info.tokenAmount.uiAmount,
      decimals: item.account.data.parsed.info.tokenAmount.decimals
    }));

    res.json({
      success: true,
      data: {
        tokens: formattedTokens,
        solBalance,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching balances:', error);
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
const INITIAL_FETCH_COUNT = 25;
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

// Add near other cache-related code
async function warmupCache() {
  console.log('Starting cache warmup...');
  try {
    const transactions = await fetchTransactionsFromQuickNode(INITIAL_FETCH_COUNT);

    if (transactions.length > 0) {
      transactions.forEach(tx => {
        transactionsCache.data.set(tx.signature, tx);
      });
      transactionsCache.lastFetch = Date.now();
      console.log(`Cache warmup complete. Source: quicknode, Initial cache size: ${transactionsCache.data.size}`);
    } else {
      console.log('Cache warmup completed but no transactions were fetched');
    }
  } catch (error) {
    console.error('Error during cache warmup:', error);
  }
}

// Modify the cron job to only use QuickNode
cron.schedule(CRON_SCHEDULE, async () => {
  console.log('Running scheduled cache update...');
  try {
    const newTransactions = await fetchTransactionsFromQuickNode(UPDATE_FETCH_COUNT);

    // Log the number of new transactions before processing
    console.log(`Fetched ${newTransactions.length} new transactions from quicknode`);

    if (newTransactions.length > 0) {
      // Keep existing transactions
      const existingTransactions = Array.from(transactionsCache.data.values());
      
      // Add new transactions
      newTransactions.forEach(tx => {
        if (!transactionsCache.data.has(tx.signature)) {
          transactionsCache.data.set(tx.signature, tx);
        }
      });

      transactionsCache.lastFetch = Date.now();
      cleanupCache();
      
      // Log the before and after cache sizes
      console.log(`Cache updated. Previous size: ${existingTransactions.length}, New size: ${transactionsCache.data.size}`);
    }
  } catch (error) {
    console.error('Error in scheduled cache update:', error);
  }
});

// Modify the endpoint to handle cold starts better
router.get('/rabbi/transactions', async (req, res) => {
  try {
    // If cache is empty, wait for warmup
    if (!transactionsCache.data.size) {
      await warmupCache();
    }

    const allTransactions = Array.from(transactionsCache.data.values())
      .sort((a, b) => b.timestamp - a.timestamp);

    const formattedResponse = {
      success: true,
      data: {
        transactions: allTransactions,
        lastUpdated: new Date(transactionsCache.lastFetch).toISOString(),
        totalCached: transactionsCache.data.size,
        cacheStatus: transactionsCache.data.size ? 'warm' : 'cold'
      }
    };

    res.json(formattedResponse);

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
const BATCH_SIZE = 5; // number of transactions to process in parallel

// Add a rate limiter for QuickNode
const quickNodeRateLimiter = createRateLimiter(QUICKNODE_RATE_LIMIT);

// Modified QuickNode helper function
async function fetchTransactionsFromQuickNode(limit) {
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

  if (!response.data?.result) return [];

  // Process transactions in batches
  const transactions = [];
  const signatures = response.data.result;
  
  for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
    const batch = signatures.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (tx) => {
      try {
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
                "encoding": "json"
              }
            ]
          }
        });

        const txData = txResponse.data?.result;
        return {
          signature: tx.signature,
          blockNumber: tx.slot,
          timestamp: tx.blockTime * 1000,
          status: tx.err ? 'failed' : 'success',
          fee: txData?.meta?.fee,
          accountKeys: txData?.transaction?.message?.accountKeys,
          instructions: txData?.transaction?.message?.instructions,
          logs: txData?.meta?.logMessages,
          postBalances: txData?.meta?.postBalances,
          preBalances: txData?.meta?.preBalances
        };
      } catch (error) {
        console.error(`Error fetching transaction ${tx.signature}:`, error.message);
        // Return basic transaction info if detailed fetch fails
        return {
          signature: tx.signature,
          blockNumber: tx.slot,
          timestamp: tx.blockTime * 1000,
          status: tx.err ? 'failed' : 'success'
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    transactions.push(...batchResults);
    
    // Add a small delay between batches
    if (i + BATCH_SIZE < signatures.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

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

// Add this after the cache-related constants and before the routes
// Warm up the cache when the server starts
warmupCache().then(() => {
  console.log('Initial cache warmup completed on server start');
}).catch(error => {
  console.error('Error during initial cache warmup:', error);
});

module.exports = router;
