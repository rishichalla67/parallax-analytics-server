const express = require('express');
const axios = require('axios');
const router = express.Router();

// Rate limiter helper with retry logic
function createRateLimiter(requestsPerSecond, maxRetries = 3) {
  let lastRequest = 0;
  const minInterval = 1000 / requestsPerSecond;

  return async function rateLimitedRequest(config) {
    const now = Date.now();
    const timeToWait = Math.max(0, lastRequest + minInterval - now);
    
    if (timeToWait > 0) {
      await new Promise(resolve => setTimeout(resolve, timeToWait));
    }
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        lastRequest = Date.now();
        const response = await axios(config);
        return response;
      } catch (error) {
        if (error.response?.status === 429) {
          const backoffTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Rate limited, waiting ${backoffTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  };
}

// Increase rate limit to match QuickNode's limit, but stay conservative
const throttledAxios = createRateLimiter(10); // 10 requests per second (below QuickNode's 15/s limit)

async function fetchImagePrompts(address) {
  try {
    console.log('Fetching signatures for address:', address);
    
    const response = await throttledAxios({
      method: 'post',
      url: 'https://cold-black-ensemble.solana-mainnet.quiknode.pro/b0951b93f19937b54d611188abdf253e661902f3/',
      headers: { 'Content-Type': 'application/json' },
      data: {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSignaturesForAddress",
        "params": [
          address,
          { "limit": 1000 }
        ]
      }
    });

    console.log('Found signatures:', response.data?.result?.length);

    // Filter signatures that have memos
    const signatureDetails = response.data?.result || [];
    const memoSignatures = signatureDetails.filter(sig => 
      sig.memo && sig.memo.includes('Image Gen Prompt')
    );

    // Fetch full transaction details to get sender addresses
    const promptsWithMemos = await Promise.all(
      memoSignatures.map(async (sig) => {
        const txnResponse = await throttledAxios({
          method: 'post',
          url: 'https://cold-black-ensemble.solana-mainnet.quiknode.pro/b0951b93f19937b54d611188abdf253e661902f3/',
          headers: { 'Content-Type': 'application/json' },
          data: {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTransaction",
            "params": [
              sig.signature,
              { "encoding": "jsonParsed", "maxSupportedTransactionVersion": 0 }
            ]
          }
        });

        const txn = txnResponse.data?.result;
        return {
          txHash: sig.signature,
          sender: txn.transaction.message.accountKeys[0].pubkey, // First account is the fee payer/sender
          memo: sig.memo,
          timestamp: new Date(sig.blockTime * 1000).toISOString()
        };
      })
    );

    console.log('Found prompts with memos:', promptsWithMemos.length);
    return promptsWithMemos;

  } catch (error) {
    console.error('Error fetching image prompts:', error);
    throw error;
  }
}

router.get('/aiora/image-prompts', async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address parameter is required'
      });
    }

    const prompts = await fetchImagePrompts(address);

    res.json({
      success: true,
      data: prompts,
      count: prompts.length
    });

  } catch (error) {
    console.error('Error serving image prompts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch image prompts'
    });
  }
});

module.exports = router; 