document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const transactionsContainer = document.getElementById('transactions');
    const connectionStatus = document.getElementById('connection-status');
    const latestBlockElement = document.getElementById('latest-block');
    const minValueInput = document.getElementById('min-value');
    const maxTxsInput = document.getElementById('max-txs');
    const applyFiltersBtn = document.getElementById('apply-filters');

    // Settings
    let settings = {
        minValue: 0,
        maxTransactions: 50
    };

    // Transaction storage
    let allTransactions = [];
    let displayedTransactions = [];
    let latestBlockNumber = null;

    // Connect to Socket.io server
    const socket = io();

    // Socket connection events
    socket.on('connect', () => {
        updateConnectionStatus('connected', 'Connected');
        
        // Initial load of transactions
        fetch('/api/transactions')
            .then(response => response.json())
            .then(data => {
                handleNewTransactions(data);
            })
            .catch(error => {
                console.error('Error fetching initial transactions:', error);
            });
    });

    socket.on('disconnect', () => {
        updateConnectionStatus('disconnected', 'Disconnected');
    });

    socket.on('connect_error', () => {
        updateConnectionStatus('disconnected', 'Connection Error');
    });

    // Listen for new transactions
    socket.on('transactions', (transactions) => {
        handleNewTransactions(transactions);
    });

    // Handle transaction data
    function handleNewTransactions(transactions) {
        if (!transactions || transactions.length === 0) return;
        
        // Update latest block number
        if (transactions.length > 0 && transactions[0].blockNumber) {
            updateLatestBlock(transactions[0].blockNumber);
        }

        // Add new transactions to our collection
        const newTransactions = transactions.filter(tx => {
            // Check if transaction already exists in our collection
            return !allTransactions.some(existingTx => existingTx.hash === tx.hash);
        });

        if (newTransactions.length === 0) return;
        
        // Add to beginning of array (newest first)
        allTransactions = [...newTransactions, ...allTransactions];
        
        // Apply filters
        filterAndDisplayTransactions();
    }

    // Update connection status UI
    function updateConnectionStatus(status, text) {
        connectionStatus.className = status;
        connectionStatus.innerHTML = `<i class="fas fa-circle"></i> ${text}`;
    }

    // Update latest block number UI
    function updateLatestBlock(blockNumber) {
        if (blockNumber !== latestBlockNumber) {
            latestBlockNumber = blockNumber;
            latestBlockElement.textContent = `Latest Block: ${blockNumber.toLocaleString()}`;
        }
    }

    // Apply filters and update displayed transactions
    function filterAndDisplayTransactions() {
        // Clear loading message if present
        if (transactionsContainer.querySelector('.loading')) {
            transactionsContainer.innerHTML = '';
        }

        // Filter transactions based on current settings
        displayedTransactions = allTransactions
            .filter(tx => tx.value >= settings.minValue)
            .slice(0, settings.maxTransactions);
        
        // Update the UI with filtered transactions
        updateTransactionsUI();
    }

    // Update the transactions display
    function updateTransactionsUI() {
        // Always show new transactions by clearing and re-rendering
        transactionsContainer.innerHTML = '';
        
        if (displayedTransactions.length === 0) {
            transactionsContainer.innerHTML = `
                <div class="loading">
                    <p>No transactions found matching your filters.</p>
                </div>
            `;
            return;
        }

        // Add each transaction to the list
        displayedTransactions.forEach(tx => {
            const txElement = document.createElement('div');
            txElement.className = 'transaction-item';
            
            // Format the value with 6 decimal places max
            const formattedValue = tx.value.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 6
            });

            // Truncate addresses for display
            const truncateAddress = (address) => {
                if (!address) return '';
                return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`;
            };

            txElement.innerHTML = `
                <div class="tx-hash">
                    <a href="https://etherscan.io/tx/${tx.hash}" target="_blank" title="${tx.hash}">
                        ${truncateAddress(tx.hash)}
                    </a>
                </div>
                <div class="tx-from" title="${tx.from}">
                    ${truncateAddress(tx.from)}
                </div>
                <div class="tx-to" title="${tx.to}">
                    ${truncateAddress(tx.to)}
                </div>
                <div class="tx-value">
                    ${formattedValue}
                </div>
            `;
            
            transactionsContainer.appendChild(txElement);
        });
    }

    // Apply filters button event
    applyFiltersBtn.addEventListener('click', () => {
        const minVal = parseFloat(minValueInput.value) || 0;
        const maxTxs = parseInt(maxTxsInput.value) || 50;
        
        settings.minValue = minVal;
        settings.maxTransactions = maxTxs;
        
        filterAndDisplayTransactions();
    });
}); 