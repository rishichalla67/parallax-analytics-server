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

// Replace the cache object with Firebase references
const firebaseKosherTransactionsRef = firebaseKosherRef.child('transactions');
const firebaseKosherBalancesRef = firebaseKosherRef.child('balances');

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

// Replace the /rabbi/balances endpoint
router.get('/rabbi/balances', async (req, res) => {
  try {
    const now = Date.now();
    
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

    const solBalance = solResponse.data?.result?.value / 1e9;
    const tokens = tokensResponse.data?.result?.value || [];

    const balanceData = {
      tokens: tokens.map(item => ({
        mint: item.account.data.parsed.info.mint,
        amount: item.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: item.account.data.parsed.info.tokenAmount.decimals
      })),
      solBalance,
      lastUpdated: new Date().toISOString()
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

// Add this after the cache-related constants and before the routes
// Warm up the cache when the server starts
warmupCache().then(() => {
  console.log('Initial cache warmup completed on server start');
}).catch(error => {
  console.error('Error during initial cache warmup:', error);
});

module.exports = router;
