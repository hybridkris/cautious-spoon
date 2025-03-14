document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const connectionStatus = document.getElementById('connection-status');
    const latestBlockElement = document.getElementById('latest-block');
    const canvas = document.getElementById('matrix-canvas');
    const ctx = canvas.getContext('2d');
    const detailsPanel = document.getElementById('details-panel');
    const txDetails = document.getElementById('tx-details');
    const detailBlock = document.getElementById('detail-block');
    const detailHash = document.getElementById('detail-hash');
    const detailFrom = document.getElementById('detail-from');
    const detailTo = document.getElementById('detail-to');
    const detailValue = document.getElementById('detail-value');
    const etherscanLink = document.getElementById('etherscan-link');
    const totalVolumeElement = document.getElementById('total-volume');
    const chartContainer = document.getElementById('chart-container');
    
    // Chart setup
    const chartCanvas = document.getElementById('value-chart');
    const chartCtx = chartCanvas.getContext('2d');
    
    // Detect if mobile
    const isMobile = window.innerWidth <= 768;
    
    // Matrix settings
    let txDots = [];
    let fontSize = isMobile ? 12 : 16; // Size for kanji characters
    let dotSpacing = isMobile ? 15 : 20; // Space between characters
    let activeTransaction = null;
    // Canvas clearing opacity (complete clear for no trails)
    const CANVAS_FADE_OPACITY = 1.0; // Full opacity for complete clear each frame
    
    // Collection of kanji characters to use for the visualization
    const KANJI_CHARS = [
        '零', '壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖', // Japanese numerals
        '金', '銀', '貨', '幣', '財', '宝', '富', '資', '産', '価', // Finance/value related
        '通', '送', '受', '取', '与', '仮', '想', '鎖', '証', '明', // Transaction related
        '東', '西', '南', '北', '空', '天', '地', '風', '火', '水', // Elements
        '光', '影', '動', '静', '高', '低', '大', '小', '急', '緩', // Properties
        '強', '弱', '速', '遅', '新', '古', '始', '終', '実', '虚'  // More properties
    ];
    
    // Transaction data
    let allTransactions = [];
    let transactionsById = {};
    
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
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        
        // Adjust font size and spacing based on screen size
        fontSize = isMobile ? 12 : 16;
        dotSpacing = isMobile ? 15 : 20;
        
        // For very small screens
        if (window.innerWidth <= 480) {
            fontSize = 10;
            dotSpacing = 10;
        }
        
        // Initialize empty txDots array
        txDots = [];
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
                            boxWidth: window.innerWidth <= 768 ? 10 : 40, // Smaller legend on mobile
                            padding: window.innerWidth <= 480 ? 5 : 10 // Smaller padding on mobile
                        },
                        display: window.innerWidth > 480 ? true : false // Hide legend on very small screens
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
                    duration: isMobile ? 500 : 1000 // Faster animations on mobile
                }
            }
        });
    }
    
    // Add chart expand/collapse toggle button for mobile
    function addChartToggleButton() {
        if (isMobile) {
            const toggleButton = document.createElement('button');
            toggleButton.textContent = 'Expand Chart';
            toggleButton.className = 'chart-toggle-btn';
            toggleButton.addEventListener('click', toggleChartSize);
            chartContainer.appendChild(toggleButton);
        }
    }
    
    // Toggle chart size between normal and expanded
    function toggleChartSize() {
        const isExpanded = chartContainer.classList.toggle('expanded');
        const toggleButton = document.querySelector('.chart-toggle-btn');
        
        if (isExpanded) {
            toggleButton.textContent = 'Collapse Chart';
        } else {
            toggleButton.textContent = 'Expand Chart';
        }
        
        // Give time for the CSS transition to complete
        setTimeout(() => {
            if (valueChart) {
                valueChart.resize();
            }
        }, 300);
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        // Update mobile detection
        const wasMobile = isMobile;
        const newIsMobile = window.innerWidth <= 768;
        
        // Only reinitialize if mobile status changed
        if (wasMobile !== newIsMobile) {
            location.reload(); // Simplest way to handle major layout change
        } else {
            initCanvas();
            
            // Reinitialize chart
            if (valueChart) {
                valueChart.destroy();
                initChart();
            }
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
        
        // Update transactionsById for quick lookups
        newTransactions.forEach(tx => {
            transactionsById[tx.hash] = tx;
        });
        
        // Limit the total number of transactions to prevent memory issues
        if (allTransactions.length > 1000) {
            const removed = allTransactions.slice(1000);
            allTransactions = allTransactions.slice(0, 1000);
            
            // Clean up transactionsById
            removed.forEach(tx => {
                delete transactionsById[tx.hash];
            });
        }
        
        // Add new transactions to matrix
        addTransactionsToMatrix(newTransactions);
        
        // Update the value chart with new data point
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
    
    // Calculate glow size based on transaction value
    // Higher value = larger glow
    function calculateGlowSize(value) {
        if (!value || value === 0) return fontSize * 1.2;
        
        // Use logarithmic scale for glow to handle wide range of values
        // Range from 1.2x to 3x of font size
        return Math.min(fontSize * 3, fontSize * 1.2 + Math.log10(value + 1) * fontSize * 0.5);
    }
    
    // Calculate speed based on transaction value
    // Higher value = slower movement
    function calculateSpeed(value) {
        if (!value || value === 0) return 3.0; // Further increased base speed for zero-value transactions
        
        // Base speed is much faster overall but still slightly slower on mobile
        const baseSpeed = isMobile ? 2.0 : 3.0; // Significantly increased from previous values
        
        // Use logarithmic scale to handle wide range of values
        // Range from 0.5x to 1x of base speed (higher value = slower)
        const speedFactor = Math.max(0.5, 1 - Math.log10(value + 1) / 6); // Adjusted factor for faster overall movement
        return baseSpeed * speedFactor;
    }
    
    // Add transactions to the matrix visualization
    function addTransactionsToMatrix(transactions) {
        transactions.forEach(tx => {
            // Calculate initial vertical position (spread across canvas height)
            const y = Math.random() * (canvas.height - fontSize) + fontSize;
            
            // Calculate speed based on value (higher value = slower movement)
            const value = tx.value || 0;
            const speed = calculateSpeed(value);
            
            // Calculate glow size based on value
            const glowSize = calculateGlowSize(value);
            
            // Select a random kanji character
            const kanji = KANJI_CHARS[Math.floor(Math.random() * KANJI_CHARS.length)];
            
            // Create a new transaction representation
            const txDot = {
                x: canvas.width + 10, // Start just off-screen to the right
                y: y,
                kanji: kanji,         // The kanji character to display
                fontSize: fontSize,   // Size of the character
                glowSize: glowSize,
                speed: speed,
                tx: tx,
                color: getTransactionColor(value),
                hash: tx.hash
            };
            
            // Add to txDots array
            txDots.push(txDot);
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
            const maxDataPoints = window.innerWidth <= 480 ? 8 : (window.innerWidth <= 768 ? 12 : 20);
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
    
    // Draw the matrix animation (kanji moving horizontally)
    function drawMatrix() {
        // Clear canvas completely each frame (no trails)
        ctx.fillStyle = `rgba(0, 0, 0, ${CANVAS_FADE_OPACITY})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw each transaction kanji
        txDots.forEach((dot, index) => {
            // Move kanji leftward (from right to left)
            dot.x -= dot.speed;
            
            // Set opacity based on distance from sides of screen
            let opacity = 1;
            const fadeDistance = 30;
            
            // Fade in when entering from right
            if (dot.x > canvas.width - fadeDistance) {
                opacity = 1 - ((dot.x - (canvas.width - fadeDistance)) / fadeDistance);
            }
            
            // Check if dot is active
            const isActive = activeTransaction && activeTransaction.hash === dot.hash;
            
            // Set font properties
            const color = dot.color;
            ctx.font = `bold ${dot.fontSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Draw multiple layers of shadow for stronger glow effect
            const glowSize = isActive ? dot.glowSize * 1.5 : dot.glowSize;
            
            // First pass - outer glow
            ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity * 0.5})`;
            ctx.shadowBlur = glowSize * 1.5;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Draw the character
            ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
            ctx.fillText(dot.kanji, dot.x, dot.y);
            
            // Second pass - inner glow (brighter)
            ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity * 0.8})`;
            ctx.shadowBlur = glowSize * 0.8;
            ctx.fillText(dot.kanji, dot.x, dot.y);
            
            // Final pass - character itself (brightest)
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgba(${Math.min(255, color.r + 50)}, ${Math.min(255, color.g + 50)}, ${Math.min(255, color.b + 50)}, ${opacity})`;
            ctx.fillText(dot.kanji, dot.x, dot.y);
            
            // Remove kanji that have moved off-screen to the left
            if (dot.x < -50) {
                txDots.splice(index, 1);
            }
        });
        
        // Request next frame
        requestAnimationFrame(drawMatrix);
    }
    
    // Find the nearest transaction kanji to a given position
    function findNearestDot(x, y) {
        let closestDot = null;
        let closestDistance = Number.MAX_VALUE;
        
        // Calculate distance to each kanji
        txDots.forEach(dot => {
            const dx = dot.x - x;
            const dy = dot.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Check if this is the closest kanji (using slightly larger hit area for text)
            if (distance < closestDistance && distance < 40) { // 40px hit area for kanji
                closestDistance = distance;
                closestDot = dot;
            }
        });
        
        return closestDot ? closestDot.tx : null;
    }
    
    // Handle mouse/touch interaction with transactions
    function handleInteraction(clientX, clientY) {
        // Convert client coordinates to canvas coordinates
        const rect = canvas.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        const canvasY = clientY - rect.top;
        
        // Find the nearest transaction
        const transaction = findNearestDot(canvasX, canvasY);
        
        if (transaction) {
            // Show transaction details in the details panel
            showTransactionDetails(transaction);
            
            // Make this the active transaction
            activeTransaction = transaction;
        }
    }
    
    // Handle mouse exit from canvas
    function handleMouseExit() {
        // On desktop, hide details when mouse leaves
        if (!isMobile) {
            hideTransactionDetails();
        }
    }
    
    // Mouse event handlers
    canvas.addEventListener('mousemove', (e) => {
        handleInteraction(e.clientX, e.clientY);
    });
    
    canvas.addEventListener('mouseleave', () => {
        handleMouseExit();
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
    
    // Add a button to clear details on mobile
    if (isMobile) {
        const clearButton = document.createElement('button');
        clearButton.textContent = 'Hide Details';
        clearButton.className = 'clear-details-btn';
        clearButton.addEventListener('click', hideTransactionDetails);
        detailsPanel.appendChild(clearButton);
    }
    
    // Show transaction details in the details panel
    function showTransactionDetails(tx) {
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
        
        // Update details content
        detailHash.textContent = truncateAddress(tx.hash);
        detailFrom.textContent = truncateAddress(tx.from);
        detailTo.textContent = truncateAddress(tx.to || 'Contract Creation');
        detailValue.innerHTML = `${formattedValue} ETH <span style="color:${categoryColor};font-weight:bold;margin-left:5px;">(${valueCategory})</span>`;
        detailBlock.textContent = tx.blockNumber;
        
        // Update Etherscan link
        etherscanLink.href = `https://etherscan.io/tx/${tx.hash}`;
        
        // Show the details
        txDetails.classList.remove('hidden');
    }
    
    // Hide transaction details
    function hideTransactionDetails() {
        txDetails.classList.add('hidden');
        activeTransaction = null;
    }
    
    // Initialize everything
    function init() {
        initCanvas();
        initChart();
        addChartToggleButton();
        drawMatrix();
    }
    
    // Start the magic!
    init();
}); 