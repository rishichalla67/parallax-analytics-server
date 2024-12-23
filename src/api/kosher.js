const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const { getDatabase } = require('firebase-admin/database');

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
    const tokensResponse = await axios.get(
      `https://public-api.solanabeach.io/v1/account/${address}/tokens`,
      {
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
      }
    );

    res.json({
      success: true,
      data: {
        tokens: tokensResponse.data,
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

// Get transactions with pagination
router.get('/rabbi/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const db = getDatabase();
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    // First check Firebase for cached transactions
    const txRef = db.ref('transactions');
    const lastBlockRef = db.ref('lastProcessedBlock');
    
    const [cachedTxsSnapshot, lastBlockSnapshot] = await Promise.all([
      txRef.orderByChild('blocktime/absolute').startAfter(oneWeekAgo/1000).get(),
      lastBlockRef.get()
    ]);

    let allTransactions = [];
    const cachedTxs = cachedTxsSnapshot.val() || {};
    const lastProcessedBlock = lastBlockSnapshot.val()?.blockHeight;
    
    if (Object.keys(cachedTxs).length > 0) {
      allTransactions = Object.values(cachedTxs);
    }

    let currentCursor = null;
    if (lastProcessedBlock) {
      const lastTx = allTransactions.find(tx => tx.blockNumber === lastProcessedBlock);
      if (lastTx) {
        currentCursor = `${lastProcessedBlock}%2C0`;
      }
    }

    let hasMore = true;
    while (hasMore) {
      try {
        let url = 'https://public-api.solanabeach.io/v1/account/5Rn9eECNAF8YHgyri7BUe5pbvP7KwZqNF25cDc3rExwt/transactions';
        if (currentCursor) {
          url += `?cursor=${currentCursor}`;
        }

        const response = await throttledAxios({
          method: 'get',
          url,
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

        if (!response.data || response.data.length === 0) {
          hasMore = false;
          continue;
        }

        // Process new transactions
        for (const tx of response.data) {
          const txTimestamp = tx.blocktime.absolute * 1000;
          
          if (txTimestamp < oneWeekAgo) {
            await txRef.child(tx.transactionHash).set({
              ...tx,
              storedAt: Date.now()
            });
          } else {
            allTransactions.push(tx);
          }
        }

        // Update cursor for next batch
        const smallestBlock = Math.min(...response.data.map(tx => tx.blockNumber));
        currentCursor = `${smallestBlock}%2C0`;

        await lastBlockRef.set({
          blockHeight: smallestBlock,
          updatedAt: Date.now()
        });

      } catch (error) {
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '5000');
          console.log(`Rate limited. Waiting ${retryAfter}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter));
          continue;
        }
        throw error;
      }
    }

    // Sort and paginate results
    allTransactions.sort((a, b) => b.blocktime.absolute - a.blocktime.absolute);
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedTransactions = allTransactions.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        transactions: paginatedTransactions,
        pagination: {
          total: allTransactions.length,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(allTransactions.length / limit)
        },
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transactions'
    });
  }
});

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

module.exports = router;
