const express = require('express');
const axios = require('axios');
const router = express.Router();

// Rate limiter helper
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

const throttledAxios = createRateLimiter(0.5); // 1 request per 2 seconds

async function fetchImagePrompts(address) {
  try {
    console.log('Fetching signatures for address:', address);
    
    // Get all signatures for the address directly
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
    const promptsWithMemos = signatureDetails
      .filter(sig => sig.memo && sig.memo.includes('Image Gen Prompt'))
      .map(sig => ({
        txHash: sig.signature,
        memo: sig.memo,
        timestamp: new Date(sig.blockTime * 1000).toISOString()
      }));

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