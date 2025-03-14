document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const connectionStatus = document.getElementById('connection-status');
    const latestBlockElement = document.getElementById('latest-block');
    const canvas = document.getElementById('matrix-canvas');
    const ctx = canvas.getContext('2d');
    const tooltip = document.getElementById('tx-tooltip');
    const tooltipHash = document.getElementById('tooltip-hash');
    const tooltipFrom = document.getElementById('tooltip-from');
    const tooltipTo = document.getElementById('tooltip-to');
    const tooltipValue = document.getElementById('tooltip-value');
    const tooltipBlock = document.getElementById('tooltip-block');
    
    // Chart setup
    const chartCanvas = document.getElementById('value-chart');
    const chartCtx = chartCanvas.getContext('2d');
    
    // Matrix settings
    let matrixChars = [];
    const possibleChars = '0123456789ABCDEFabcdef'; // Hex characters for Ethereum addresses
    let columns = 0;
    let fontSize = 14;
    let activeTransaction = null;
    
    // Transaction data
    let allTransactions = [];
    let transactionsByColumn = {};
    
    // Transaction value color thresholds
    const VALUE_COLORS = {
        default: { r: 0, g: 255, b: 65 },     // Green (0-1 ETH)
        medium: { r: 255, g: 255, b: 0 },     // Yellow (1-10 ETH)
        high: { r: 255, g: 165, b: 0 },       // Orange (10-100 ETH)
        veryHigh: { r: 255, g: 0, b: 0 }      // Red (>100 ETH)
    };
    
    // Chart data
    const chartData = {
        labels: [],
        datasets: [{
            label: 'Transaction Value (ETH)',
            data: [],
            borderColor: 'rgba(0, 255, 65, 1)',
            backgroundColor: 'rgba(0, 255, 65, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            segment: {
                borderColor: function(context) {
                    const value = context.p1.parsed.y;
                    if (value >= 100) return 'rgba(255, 0, 0, 1)';       // Red
                    if (value >= 10) return 'rgba(255, 165, 0, 1)';      // Orange
                    if (value >= 1) return 'rgba(255, 255, 0, 1)';       // Yellow
                    return 'rgba(0, 255, 65, 1)';                        // Green
                },
                backgroundColor: function(context) {
                    const value = context.p1.parsed.y;
                    if (value >= 100) return 'rgba(255, 0, 0, 0.1)';     // Red
                    if (value >= 10) return 'rgba(255, 165, 0, 0.1)';    // Orange
                    if (value >= 1) return 'rgba(255, 255, 0, 0.1)';     // Yellow
                    return 'rgba(0, 255, 65, 0.1)';                      // Green
                }
            }
        }]
    };
    
    // Chart instance
    let valueChart = null;
    
    // Initialize the Matrix canvas
    function initCanvas() {
        // Set canvas dimensions
        canvas.width = window.innerWidth;
        canvas.height = canvas.parentElement.clientHeight;
        
        // Calculate columns (one falling stream every 20px)
        columns = Math.floor(canvas.width / 20);
        
        // Initialize empty matrix characters
        matrixChars = [];
        transactionsByColumn = {};
        
        for (let i = 0; i < columns; i++) {
            // Each column starts empty
            matrixChars[i] = {
                chars: [],
                y: 0,
                speed: 0,
                tx: null,
                color: VALUE_COLORS.default
            };
        }
    }
    
    // Initialize the value chart
    function initChart() {
        // Set chart dimensions
        chartCanvas.width = chartCanvas.parentElement.clientWidth;
        chartCanvas.height = chartCanvas.parentElement.clientHeight;
        
        // Create the chart
        valueChart = new Chart(chartCtx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        ticks: { color: '#00ff41' },
                        grid: { color: 'rgba(0, 255, 65, 0.1)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#00ff41' },
                        grid: { color: 'rgba(0, 255, 65, 0.1)' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#00ff41' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 20, 0, 0.9)',
                        borderColor: '#00ff41',
                        borderWidth: 1,
                        titleColor: '#00ff41',
                        bodyColor: '#00ff41',
                    }
                },
                animation: {
                    duration: 1000
                }
            }
        });
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        initCanvas();
        
        // Reinitialize chart
        if (valueChart) {
            valueChart.destroy();
            initChart();
        }
    });
    
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
    
    // Handle new transaction data
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
        
        // Limit the total number of transactions to prevent memory issues
        if (allTransactions.length > 1000) {
            allTransactions = allTransactions.slice(0, 1000);
        }
        
        // Add new transactions to matrix
        addTransactionsToMatrix(newTransactions);
        
        // Update the value chart with new data point (average value of new batch)
        updateValueChart(newTransactions);
    }
    
    // Update connection status UI
    function updateConnectionStatus(status, text) {
        connectionStatus.className = status;
        connectionStatus.innerHTML = `<i class="fas fa-circle"></i> ${text}`;
    }
    
    // Update latest block number UI
    function updateLatestBlock(blockNumber) {
        latestBlockElement.textContent = `Latest Block: ${blockNumber.toLocaleString()}`;
    }
    
    // Get color based on transaction value
    function getTransactionColor(value) {
        if (!value || value === 0) return VALUE_COLORS.default;
        
        if (value >= 100) return VALUE_COLORS.veryHigh;      // Red for >100 ETH
        if (value >= 10) return VALUE_COLORS.high;           // Orange for >10 ETH
        if (value >= 1) return VALUE_COLORS.medium;          // Yellow for >1 ETH
        return VALUE_COLORS.default;                         // Green for <1 ETH
    }
    
    // Calculate brightness based on transaction value
    // Higher value = higher brightness
    function calculateBrightness(value) {
        if (!value || value === 0) return 0.5;
        
        // Use logarithmic scale for brightness to handle wide range of values
        // Range from 0.5 to 1.0
        return Math.min(1, 0.5 + Math.log10(value + 1) / 4);
    }
    
    // Add transactions to the matrix visualization
    function addTransactionsToMatrix(transactions) {
        transactions.forEach(tx => {
            // Find an available column
            let columnIndex = Math.floor(Math.random() * columns);
            let attempts = 0;
            const maxAttempts = columns / 2;
            
            // Try to find a column without an active transaction
            while (matrixChars[columnIndex].tx !== null && attempts < maxAttempts) {
                columnIndex = Math.floor(Math.random() * columns);
                attempts++;
            }
            
            // If all columns are occupied, overwrite one randomly
            if (matrixChars[columnIndex].tx !== null) {
                columnIndex = Math.floor(Math.random() * columns);
            }
            
            // Calculate speed based on value (higher value = slower fall to make it easier to hover)
            // Use logarithmic scale to handle wide range of values
            const baseSpeed = 1;
            const value = tx.value || 0;
            const speed = value > 0 ? 
                baseSpeed * (1 - Math.min(0.8, Math.log10(value + 1) / 5)) : 
                baseSpeed;
            
            // Create a matrix stream with characters from the transaction hash
            const hashChars = tx.hash.slice(2).split(''); // Remove '0x' prefix
            
            // Reset this column
            matrixChars[columnIndex] = {
                chars: hashChars,
                y: 0,
                speed: speed,
                tx: tx,
                brightness: calculateBrightness(tx.value),
                color: getTransactionColor(tx.value)
            };
            
            // Store transaction by column for tooltip lookup
            transactionsByColumn[columnIndex] = tx;
        });
    }
    
    // Update the value chart with new transaction data
    function updateValueChart(transactions) {
        if (!valueChart) return;
        
        // Calculate average value of this batch
        const totalValue = transactions.reduce((sum, tx) => sum + (tx.value || 0), 0);
        const avgValue = transactions.length > 0 ? totalValue / transactions.length : 0;
        
        // Add new data point
        const timestamp = new Date().toLocaleTimeString();
        
        // Add latest data point
        chartData.labels.push(timestamp);
        chartData.datasets[0].data.push(avgValue);
        
        // Keep only last 20 data points
        if (chartData.labels.length > 20) {
            chartData.labels.shift();
            chartData.datasets[0].data.shift();
        }
        
        // Update chart
        valueChart.update();
    }
    
    // Draw the matrix animation
    function drawMatrix() {
        // Clear canvas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw each column
        for (let i = 0; i < columns; i++) {
            const column = matrixChars[i];
            const tx = column.tx;
            
            // Skip columns without transactions
            if (!tx) continue;
            
            // Calculate x position for this column
            const x = i * 20 + 10;
            
            // Calculate brightness based on transaction value
            const brightness = column.brightness;
            const color = column.color;
            
            // Draw each character in the column
            for (let j = 0; j < column.chars.length; j++) {
                const y = (column.y - j * fontSize) % canvas.height;
                
                // Only draw if character is on screen
                if (y > 0 && y < canvas.height) {
                    // Head character is brighter
                    const isHead = j === 0;
                    
                    // Determine color based on value and position
                    if (isHead) {
                        // Head is brighter version of the color
                        ctx.fillStyle = `rgba(${color.r + 50}, ${color.g + 50}, ${color.b + 50}, ${brightness})`;
                    } else {
                        // Trailing characters are base color with decreasing opacity
                        const opacity = brightness * Math.max(0.1, 1 - j * 0.1);
                        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
                    }
                    
                    ctx.font = `${fontSize}px "Courier New", monospace`;
                    ctx.fillText(column.chars[j], x, y);
                }
            }
            
            // Move column down
            column.y += column.speed;
            
            // If column has moved off screen, reset it
            if (column.y > canvas.height + column.chars.length * fontSize) {
                column.y = 0;
                column.tx = null;
                transactionsByColumn[i] = null;
            }
        }
        
        // Request next frame
        requestAnimationFrame(drawMatrix);
    }
    
    // Handle mouse movement for hovering over transactions
    canvas.addEventListener('mousemove', (e) => {
        // Calculate which column the mouse is over
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const columnIndex = Math.floor(mouseX / 20);
        
        // Check if there's a transaction in this column
        const transaction = transactionsByColumn[columnIndex];
        
        if (transaction) {
            // Show tooltip with transaction details
            showTooltip(transaction, e.clientX, e.clientY);
            
            // Make the current active transaction
            activeTransaction = transaction;
            
            // Create a blinking effect for the active column
            if (matrixChars[columnIndex]) {
                // Temporarily increase brightness
                matrixChars[columnIndex].brightness = 1;
            }
        } else {
            // Hide tooltip
            hideTooltip();
            activeTransaction = null;
        }
    });
    
    // Handle mouse leaving the canvas
    canvas.addEventListener('mouseleave', () => {
        hideTooltip();
        activeTransaction = null;
    });
    
    // Show tooltip with transaction details
    function showTooltip(tx, x, y) {
        // Format the value with 6 decimal places max
        const formattedValue = (tx.value || 0).toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 6
        });
        
        // Determine value category text and color
        let valueCategory = '';
        let categoryColor = '';
        
        const value = tx.value || 0;
        if (value >= 100) {
            valueCategory = 'Very High';
            categoryColor = 'rgba(255, 0, 0, 1)'; // Red
        } else if (value >= 10) {
            valueCategory = 'High';
            categoryColor = 'rgba(255, 165, 0, 1)'; // Orange
        } else if (value >= 1) {
            valueCategory = 'Medium';
            categoryColor = 'rgba(255, 255, 0, 1)'; // Yellow
        } else {
            valueCategory = 'Low';
            categoryColor = 'rgba(0, 255, 65, 1)'; // Green
        }
        
        // Update tooltip content
        tooltipHash.textContent = tx.hash;
        tooltipFrom.textContent = tx.from;
        tooltipTo.textContent = tx.to || 'Contract Creation';
        tooltipValue.innerHTML = `${formattedValue} ETH <span style="color:${categoryColor};font-weight:bold;margin-left:5px;">(${valueCategory})</span>`;
        tooltipBlock.textContent = tx.blockNumber;
        
        // Position tooltip near cursor but not under it
        const tooltipWidth = 400; // Approximate width
        const tooltipHeight = 150; // Approximate height
        
        // Calculate position to avoid going off-screen
        let posX = x + 15;
        let posY = y + 15;
        
        // Adjust if too close to right edge
        if (posX + tooltipWidth > window.innerWidth) {
            posX = x - tooltipWidth - 15;
        }
        
        // Adjust if too close to bottom edge
        if (posY + tooltipHeight > window.innerHeight) {
            posY = y - tooltipHeight - 15;
        }
        
        // Set position
        tooltip.style.left = `${posX}px`;
        tooltip.style.top = `${posY}px`;
        
        // Show tooltip
        tooltip.classList.remove('hidden');
    }
    
    // Hide tooltip
    function hideTooltip() {
        tooltip.classList.add('hidden');
    }
    
    // Initialize everything
    function init() {
        initCanvas();
        initChart();
        drawMatrix();
    }
    
    // Start the magic!
    init();
}); 