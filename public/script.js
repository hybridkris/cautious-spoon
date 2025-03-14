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
    const totalVolumeElement = document.getElementById('total-volume');
    
    // Chart setup
    const chartCanvas = document.getElementById('value-chart');
    const chartCtx = chartCanvas.getContext('2d');
    
    // Detect if mobile
    const isMobile = window.innerWidth <= 768;
    
    // Matrix settings
    let matrixChars = [];
    const possibleChars = '0123456789ABCDEFabcdef'; // Hex characters for Ethereum addresses
    let columns = 0;
    let fontSize = isMobile ? 12 : 14; // Smaller font on mobile
    let columnWidth = isMobile ? 15 : 20; // Smaller column width on mobile
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
            label: 'Total Block Value (ETH)',
            data: [],
            borderColor: 'rgba(0, 255, 65, 1)',
            backgroundColor: 'rgba(0, 255, 65, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            segment: {
                borderColor: function(context) {
                    const value = context.p1.parsed.y;
                    if (value >= 1000) return 'rgba(255, 0, 0, 1)';      // Red
                    if (value >= 100) return 'rgba(255, 165, 0, 1)';     // Orange
                    if (value >= 10) return 'rgba(255, 255, 0, 1)';      // Yellow
                    return 'rgba(0, 255, 65, 1)';                        // Green
                },
                backgroundColor: function(context) {
                    const value = context.p1.parsed.y;
                    if (value >= 1000) return 'rgba(255, 0, 0, 0.1)';    // Red
                    if (value >= 100) return 'rgba(255, 165, 0, 0.1)';   // Orange
                    if (value >= 10) return 'rgba(255, 255, 0, 0.1)';    // Yellow
                    return 'rgba(0, 255, 65, 0.1)';                      // Green
                }
            }
        }]
    };
    
    // Chart instance
    let valueChart = null;
    
    // Keep track of blocks we've already processed
    let processedBlocks = new Set();
    
    // Initialize the Matrix canvas
    function initCanvas() {
        // Set canvas dimensions
        canvas.width = window.innerWidth;
        canvas.height = canvas.parentElement.clientHeight;
        
        // Determine column width based on screen size
        columnWidth = window.innerWidth <= 768 ? 15 : 20;
        fontSize = window.innerWidth <= 768 ? 12 : 14;
        
        // For very small screens
        if (window.innerWidth <= 480) {
            columnWidth = 12;
            fontSize = 10;
        }
        
        // Calculate columns (one falling stream every columnWidth px)
        columns = Math.floor(canvas.width / columnWidth);
        
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
                        ticks: { 
                            color: '#00ff41',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: window.innerWidth <= 768 ? 5 : 10 // Fewer labels on mobile
                        },
                        grid: { color: 'rgba(0, 255, 65, 0.1)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: '#00ff41',
                            callback: function(value) {
                                // Format large numbers with K (thousands) or M (millions)
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
                                return value;
                            }
                        },
                        grid: { color: 'rgba(0, 255, 65, 0.1)' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { 
                            color: '#00ff41',
                            boxWidth: window.innerWidth <= 768 ? 10 : 40 // Smaller legend on mobile
                        },
                        display: window.innerWidth > 480 // Hide legend on very small screens
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 20, 0, 0.9)',
                        borderColor: '#00ff41',
                        borderWidth: 1,
                        titleColor: '#00ff41',
                        bodyColor: '#00ff41',
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                let value = context.parsed.y;
                                let valueCategory = '';
                                
                                if (value >= 1000) valueCategory = ' (Very High)';
                                else if (value >= 100) valueCategory = ' (High)';
                                else if (value >= 10) valueCategory = ' (Medium)';
                                else valueCategory = ' (Low)';
                                
                                // Format large numbers with commas
                                const formattedValue = value.toLocaleString(undefined, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2
                                });
                                
                                return `Block Total: ${formattedValue} ETH${valueCategory}`;
                            }
                        }
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
            const baseSpeed = window.innerWidth <= 768 ? 0.7 : 1; // Slower on mobile for easier interaction
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
        
        // Group transactions by block number and calculate total value per block
        const blockTotals = new Map(); // Maps blockNumber -> total ETH value
        
        transactions.forEach(tx => {
            const blockNumber = tx.blockNumber;
            
            // Skip blocks we already processed to avoid duplicates
            if (processedBlocks.has(blockNumber)) return;
            
            const value = tx.value || 0;
            if (blockTotals.has(blockNumber)) {
                blockTotals.set(blockNumber, blockTotals.get(blockNumber) + value);
            } else {
                blockTotals.set(blockNumber, value);
            }
        });
        
        // If no new blocks, return
        if (blockTotals.size === 0) return;
        
        // Mark these blocks as processed
        for (const blockNumber of blockTotals.keys()) {
            processedBlocks.add(blockNumber);
        }
        
        // Add new data points for each block
        for (const [blockNumber, totalValue] of blockTotals.entries()) {
            // Add latest data point
            chartData.labels.push(`Block ${blockNumber}`);
            chartData.datasets[0].data.push(totalValue);
            
            // Keep only last n data points (or fewer on mobile)
            const maxDataPoints = window.innerWidth <= 480 ? 10 : (window.innerWidth <= 768 ? 15 : 20);
            if (chartData.labels.length > maxDataPoints) {
                chartData.labels.shift();
                chartData.datasets[0].data.shift();
            }
        }
        
        // Update chart
        valueChart.update();
        
        // Update total volume display
        updateTotalVolume();
    }
    
    // Calculate and update the total volume display
    function updateTotalVolume() {
        const totalVolume = chartData.datasets[0].data.reduce((sum, value) => sum + value, 0);
        
        // Format the total volume
        let formattedVolume;
        if (totalVolume >= 1000000) {
            formattedVolume = (totalVolume / 1000000).toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            }) + 'M';
        } else if (totalVolume >= 1000) {
            formattedVolume = (totalVolume / 1000).toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            }) + 'K';
        } else {
            formattedVolume = totalVolume.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            });
        }
        
        // Update the display
        totalVolumeElement.textContent = formattedVolume;
        
        // Color the text based on the volume
        if (totalVolume >= 10000) {
            totalVolumeElement.style.color = 'rgba(255, 0, 0, 1)'; // Red
        } else if (totalVolume >= 1000) {
            totalVolumeElement.style.color = 'rgba(255, 165, 0, 1)'; // Orange
        } else if (totalVolume >= 100) {
            totalVolumeElement.style.color = 'rgba(255, 255, 0, 1)'; // Yellow
        } else {
            totalVolumeElement.style.color = 'rgba(0, 255, 65, 1)'; // Green
        }
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
            const x = i * columnWidth + columnWidth/2;
            
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
    
    // Get column index from cursor/touch position
    function getColumnIndexFromPosition(clientX) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        return Math.floor(canvasX / columnWidth);
    }
    
    // Handle interaction with transactions
    function handleInteraction(clientX, clientY) {
        // Calculate which column the cursor/touch is over
        const columnIndex = getColumnIndexFromPosition(clientX);
        
        // Check if there's a transaction in this column
        const transaction = transactionsByColumn[columnIndex];
        
        if (transaction) {
            // Show tooltip with transaction details
            showTooltip(transaction, clientX, clientY);
            
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
    }
    
    // Mouse event handlers
    canvas.addEventListener('mousemove', (e) => {
        handleInteraction(e.clientX, e.clientY);
    });
    
    canvas.addEventListener('mouseleave', () => {
        hideTooltip();
        activeTransaction = null;
    });
    
    // Touch event handlers for mobile
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent scrolling when touching the canvas
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            handleInteraction(touch.clientX, touch.clientY);
        }
    }, { passive: false });
    
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault(); // Prevent scrolling when touching the canvas
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            handleInteraction(touch.clientX, touch.clientY);
        }
    }, { passive: false });
    
    canvas.addEventListener('touchend', () => {
        // Don't hide tooltip immediately on mobile, so users can read it
        setTimeout(() => {
            hideTooltip();
            activeTransaction = null;
        }, 1500);
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
        
        // Truncate addresses for mobile
        const truncateAddress = (address, length = 12) => {
            if (!address) return '';
            if (window.innerWidth <= 480 && address.length > length * 2) {
                return `${address.substring(0, length)}...${address.substring(address.length - length)}`;
            }
            return address;
        };
        
        // Update tooltip content
        tooltipHash.textContent = truncateAddress(tx.hash);
        tooltipFrom.textContent = truncateAddress(tx.from);
        tooltipTo.textContent = truncateAddress(tx.to || 'Contract Creation');
        tooltipValue.innerHTML = `${formattedValue} ETH <span style="color:${categoryColor};font-weight:bold;margin-left:5px;">(${valueCategory})</span>`;
        tooltipBlock.textContent = tx.blockNumber;
        
        // Position tooltip logic

        // Tooltip sizing
        let tooltipWidth, tooltipHeight;
        if (window.innerWidth <= 480) {
            // Smaller tooltip on mobile (full-width with margin)
            tooltipWidth = window.innerWidth - 30;
            tooltipHeight = 180;
            
            // For smaller screens, position tooltip at bottom center
            tooltip.style.left = '15px';
            tooltip.style.top = `${window.innerHeight - tooltipHeight - 100}px`;
        } else {
            // Desktop positioning
            tooltipWidth = Math.min(450, window.innerWidth * 0.8);
            tooltipHeight = 150;
            
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
        }
        
        // Set width
        tooltip.style.maxWidth = `${tooltipWidth}px`;
        
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