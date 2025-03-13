require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Check if API key is available
if (!process.env.ETHERSCAN_API_KEY) {
  console.error('Error: Etherscan API key is missing. Please add it to your .env file.');
  process.exit(1);
}

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ETHERSCAN_API_URL = 'https://api.etherscan.io/api';
const PORT = process.env.PORT || 3000;
const UPDATE_INTERVAL = 10000; // 10 seconds

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to get latest transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await fetchLatestTransactions();
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Fetch latest blocks from Etherscan
async function fetchLatestBlocks() {
  try {
    const response = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_blockNumber',
        apikey: ETHERSCAN_API_KEY
      }
    });
    
    if (response.data && response.data.result) {
      const latestBlockNumber = parseInt(response.data.result, 16);
      return latestBlockNumber;
    }
    
    throw new Error('Invalid response from Etherscan API');
  } catch (error) {
    console.error('Error fetching latest block:', error.message);
    throw error;
  }
}

// Fetch transactions from a specific block
async function fetchTransactionsFromBlock(blockNumber) {
  try {
    const response = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getBlockByNumber',
        tag: '0x' + blockNumber.toString(16),
        boolean: 'true',
        apikey: ETHERSCAN_API_KEY
      }
    });
    
    if (response.data && response.data.result && response.data.result.transactions) {
      return response.data.result.transactions.map(tx => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to || 'Contract Creation',
        value: parseInt(tx.value, 16) / 1e18, // Convert from wei to ETH
        blockNumber,
        timestamp: new Date().toISOString() // Etherscan doesn't provide timestamp in this endpoint
      }));
    }
    
    return [];
  } catch (error) {
    console.error(`Error fetching transactions from block ${blockNumber}:`, error.message);
    return [];
  }
}

// Fetch latest transactions
async function fetchLatestTransactions() {
  try {
    const latestBlock = await fetchLatestBlocks();
    // Fetch transactions from the latest block
    const transactions = await fetchTransactionsFromBlock(latestBlock);
    return transactions;
  } catch (error) {
    console.error('Error in fetchLatestTransactions:', error.message);
    throw error;
  }
}

// Socket.io logic
io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Set up interval to send transaction updates
  const intervalId = setInterval(async () => {
    try {
      const transactions = await fetchLatestTransactions();
      socket.emit('transactions', transactions);
    } catch (error) {
      console.error('Error sending transactions via socket:', error.message);
    }
  }, UPDATE_INTERVAL);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    clearInterval(intervalId);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 