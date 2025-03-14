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
    // For very small screens, use simplified rendering
    const isVerySmallScreen = window.innerWidth <= 480;
    
    // Matrix settings
    let txDots = [];
    let cubeSize = isMobile ? 8 : 12; // Size for cubes (slightly smaller than diamonds)
    let dotSpacing = isMobile ? 30 : 40; // Increased spacing between cubes
    let activeTransaction = null;
    // Canvas clearing opacity (complete clear for no trails)
    const CANVAS_FADE_OPACITY = 1.0; // Full opacity for complete clear each frame
    
    // Transaction data
    let allTransactions = [];
    let transactionsById = {};
    
    // Transaction value color thresholds - Synthwave palette
    const VALUE_COLORS = {
        default: { r: 80, g: 250, b: 255 },     // Neon cyan (0-1 ETH)
        medium: { r: 255, g: 105, b: 180 },     // Hot pink (1-10 ETH)
        high: { r: 191, g: 85, b: 255 },        // Neon purple (10-100 ETH)
        veryHigh: { r: 255, g: 50, b: 50 }      // Bright red (>100 ETH)
    };
    
    // Chart data
    const chartData = {
        labels: [],
        datasets: [{
            label: 'Total Block Value (ETH)',
            data: [],
            borderColor: 'rgba(80, 250, 255, 1)',
            backgroundColor: 'rgba(80, 250, 255, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            segment: {
                borderColor: function(context) {
                    const value = context.p1.parsed.y;
                    if (value >= 1000) return 'rgba(255, 50, 50, 1)';        // Bright red
                    if (value >= 100) return 'rgba(191, 85, 255, 1)';        // Neon purple
                    if (value >= 10) return 'rgba(255, 105, 180, 1)';        // Hot pink
                    return 'rgba(80, 250, 255, 1)';                          // Neon cyan
                },
                backgroundColor: function(context) {
                    const value = context.p1.parsed.y;
                    if (value >= 1000) return 'rgba(255, 50, 50, 0.1)';      // Bright red
                    if (value >= 100) return 'rgba(191, 85, 255, 0.1)';      // Neon purple
                    if (value >= 10) return 'rgba(255, 105, 180, 0.1)';      // Hot pink
                    return 'rgba(80, 250, 255, 0.1)';                        // Neon cyan
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
        
        // Adjust cube size and spacing based on screen size
        cubeSize = isMobile ? 8 : 12;
        dotSpacing = isMobile ? 30 : 40;
        
        // For very small screens
        if (window.innerWidth <= 480) {
            cubeSize = 6;
            dotSpacing = 20;
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
                            color: 'rgba(80, 250, 255, 1)', // Neon cyan
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: window.innerWidth <= 768 ? 5 : 10 // Fewer labels on mobile
                        },
                        grid: { color: 'rgba(80, 250, 255, 0.15)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: 'rgba(80, 250, 255, 1)', // Neon cyan
                            callback: function(value) {
                                // Format large numbers with K (thousands) or M (millions)
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
                                return value;
                            }
                        },
                        grid: { color: 'rgba(80, 250, 255, 0.15)' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { 
                            color: 'rgba(80, 250, 255, 1)', // Neon cyan
                            boxWidth: window.innerWidth <= 768 ? 10 : 40, // Smaller legend on mobile
                            padding: window.innerWidth <= 480 ? 5 : 10 // Smaller padding on mobile
                        },
                        display: window.innerWidth > 480 ? true : false // Hide legend on very small screens
                    },
                    tooltip: {
                        backgroundColor: 'rgba(25, 25, 50, 0.9)', // Dark blue
                        borderColor: 'rgba(191, 85, 255, 1)', // Neon purple
                        borderWidth: 1,
                        titleColor: 'rgba(255, 105, 180, 1)', // Hot pink
                        bodyColor: 'rgba(80, 250, 255, 1)', // Neon cyan
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
    
    // Add chart setup for the transaction explorer
    function setupChartAndUI() {
        if (isMobile) {
            // We no longer need to add a toggle button as the chart will always be visible
            
            // Initialize chart with mobile-optimized settings
            setTimeout(() => {
                if (valueChart) {
                    valueChart.resize();
                }
            }, 100);
            
            // Ensure proper display on mobile
            const matrixContainer = document.getElementById('matrix-container');
            const detailsSection = document.querySelector('.details-section');
            
            // Make sure chart is properly sized
            setTimeout(() => {
                if (valueChart) valueChart.resize();
            }, 300);
        }
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        // Update mobile detection
        const wasMobile = isMobile;
        const newIsMobile = window.innerWidth <= 768;
        const newIsVerySmallScreen = window.innerWidth <= 480;
        
        // Only reinitialize if mobile status changed
        if (wasMobile !== newIsMobile) {
            location.reload(); // Simplest way to handle major layout change
        } else {
            // Update canvas dimensions
            initCanvas();
            
            // Reinitialize chart
            if (valueChart) {
                valueChart.destroy();
                initChart();
                
                // Make sure chart is properly sized
                setTimeout(() => {
                    valueChart.resize();
                }, 100);
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
        
        // Add synthwave colors based on status
        if (status === 'connected') {
            connectionStatus.style.color = 'rgba(80, 250, 255, 1)'; // Neon cyan for connected
        } else {
            connectionStatus.style.color = 'rgba(255, 50, 50, 1)'; // Bright red for disconnected/error
        }
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
    // Higher value = larger glow, but ensure all cubes have a substantial glow
    function calculateGlowSize(value) {
        if (!value || value === 0) return cubeSize * 2;
        
        // Increased minimum glow size to ensure all cubes glow prominently
        // Range from 2x to 3.5x of cube size
        return Math.min(cubeSize * 3.5, cubeSize * 2 + Math.log10(value + 1) * cubeSize * 0.5);
    }
    
    // Calculate speed based on transaction value and block number
    // This will cause transactions from the same block to move at similar speeds
    function calculateSpeed(value, blockNumber) {
        // Apply base speed factor (previously reduced by 40%)
        const baseSpeedFactor = 0.36;
        
        // Use block number to create block-based speed variations
        // Convert block number to a value between 0.85 and 1.15 for 30% variation between blocks
        const blockFactor = blockNumber ? (0.85 + (blockNumber % 10) * 0.03) : 1.0;
        
        // Base speed varies by value and is affected by mobile status
        let speed;
        if (!value || value === 0) {
            speed = 3.0 * baseSpeedFactor;
        } else {
            const baseSpeed = isMobile ? 2.0 * baseSpeedFactor : 3.0 * baseSpeedFactor;
            // Value still affects speed but to a lesser degree
            const valueSpeedFactor = Math.max(0.7, 1 - Math.log10(value + 1) / 10); // Reduced value impact
            speed = baseSpeed * valueSpeedFactor;
        }
        
        // Apply block factor to create grouping effect
        return speed * blockFactor;
    }
    
    // Add transactions to the matrix visualization
    function addTransactionsToMatrix(transactions) {
        // Group transactions by block number for better visual clustering
        const blockGroups = {};
        
        // First pass: group transactions by block
        transactions.forEach(tx => {
            const blockNumber = tx.blockNumber || 0;
            if (!blockGroups[blockNumber]) {
                blockGroups[blockNumber] = [];
            }
            blockGroups[blockNumber].push(tx);
        });
        
        // Second pass: add transactions with coordinated positioning by block
        Object.entries(blockGroups).forEach(([blockNumber, txs]) => {
            // Create a "lane" for this block - slight vertical alignment
            // Generate a random base Y position for this block (with some constraints to avoid edges)
            const blockBaseY = Math.random() * (canvas.height * 0.6) + (canvas.height * 0.2);
            const blockNum = parseInt(blockNumber);
            
            // Add each transaction in this block group
            txs.forEach((tx, index) => {
                // Calculate position with some variation but still clustered
                // Cubes in the same block will be roughly aligned horizontally and vertically
                const laneWidth = canvas.height * 0.2; // Lane takes 20% of canvas height
                
                // Vary y position within the block's lane for a bit of natural randomness
                // But keep them somewhat aligned by using the blockBaseY as a reference
                const yVariation = (Math.random() - 0.5) * laneWidth;
                const y = blockBaseY + yVariation;
                
                // Calculate speed based on both value and block number
                const value = tx.value || 0;
                const speed = calculateSpeed(value, blockNum);
                
                // Calculate glow size based on value
                const glowSize = calculateGlowSize(value);
                
                // Stagger x starting positions for cubes in the same block with increased spacing
                // This creates a small delay between cubes from the same block
                const xOffset = index * (Math.random() * 50 + 25); // Random spacing between 25-75px
                
                // Create a new transaction representation with cube
                const txDot = {
                    x: canvas.width + 10 + xOffset, // Start just off-screen to the right with offset
                    y: y,
                    size: cubeSize,   // Size of the cube
                    glowSize: glowSize,
                    speed: speed,
                    tx: tx,
                    color: getTransactionColor(value),
                    hash: tx.hash,
                    blockNumber: blockNum, // Store block number for reference
                    rotationX: Math.random() * Math.PI, // X-axis rotation
                    rotationY: Math.random() * Math.PI, // Y-axis rotation
                    rotationZ: Math.random() * Math.PI  // Z-axis rotation
                };
                
                // Add to txDots array
                txDots.push(txDot);
            });
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
            const maxDataPoints = isVerySmallScreen ? 8 : (isMobile ? 12 : 20);
            if (chartData.labels.length > maxDataPoints) {
                chartData.labels.shift();
                chartData.datasets[0].data.shift();
            }
        }
        
        // Always update the chart since it's always visible now
        valueChart.update();
        
        // Always update total volume display
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
        
        // Color the text based on the volume - synthwave colors
        if (totalVolume >= 10000) {
            totalVolumeElement.style.color = 'rgba(255, 50, 50, 1)'; // Bright red
        } else if (totalVolume >= 1000) {
            totalVolumeElement.style.color = 'rgba(191, 85, 255, 1)'; // Neon purple
        } else if (totalVolume >= 100) {
            totalVolumeElement.style.color = 'rgba(255, 105, 180, 1)'; // Hot pink
        } else {
            totalVolumeElement.style.color = 'rgba(80, 250, 255, 1)'; // Neon cyan
        }
    }
    
    // Draw the matrix animation (cubes moving horizontally)
    function drawMatrix() {
        // Clear canvas completely each frame (no trails)
        ctx.fillStyle = `rgba(0, 0, 0, ${CANVAS_FADE_OPACITY})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // For mobile devices, periodically limit the number of dots for performance
        if (isMobile && txDots.length > (isVerySmallScreen ? 30 : 50)) {
            txDots = txDots.slice(0, isVerySmallScreen ? 30 : 50);
        }
        
        // Draw each transaction cube
        txDots.forEach((dot, index) => {
            // Move cube leftward (from right to left)
            dot.x -= dot.speed;
            
            // Slowly rotate the cube on all axes
            dot.rotationX += 0.01;
            dot.rotationY += 0.015;
            dot.rotationZ += 0.005;
            
            // Set opacity based on distance from sides of screen
            let opacity = 1;
            const fadeDistance = 30;
            
            // Fade in when entering from right
            if (dot.x > canvas.width - fadeDistance) {
                opacity = 1 - ((dot.x - (canvas.width - fadeDistance)) / fadeDistance);
            }
            
            // Check if dot is active
            const isActive = activeTransaction && activeTransaction.hash === dot.hash;
            
            // Get the color and size
            const color = dot.color;
            const size = isActive ? dot.size * 1.3 : dot.size;
            
            // Enhanced glow effect for all cubes
            const glowSize = isActive ? dot.glowSize * 1.5 : dot.glowSize;
            
            // Apply multi-layered glow for a more prominent effect
            // First pass - outer glow (larger, more transparent)
            ctx.save();
            ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity * 0.5})`;
            ctx.shadowBlur = glowSize * 1.3;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Draw the 3D cube with perspective
            drawCube(ctx, dot.x, dot.y, size, color, opacity, dot.rotationX, dot.rotationY, dot.rotationZ);
            
            ctx.restore();
            
            // Second pass - inner glow (smaller, more intense)
            // Skip second glow pass on very small screens for performance
            if (!isVerySmallScreen) {
                ctx.save();
                ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity * 0.8})`;
                ctx.shadowBlur = glowSize * 0.8;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                
                // Redraw the cube for the inner glow (slightly smaller)
                drawCube(ctx, dot.x, dot.y, size * 0.95, color, opacity, dot.rotationX, dot.rotationY, dot.rotationZ);
                
                ctx.restore();
            }
            
            // If this cube is active or in the same block as the active transaction,
            // display the block number above it
            if (isActive || (activeTransaction && dot.blockNumber === activeTransaction.blockNumber)) {
                // Display block number above the cube
                ctx.save();
                ctx.font = `bold ${cubeSize * 0.8}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
                ctx.shadowColor = `rgba(0, 0, 0, 0.8)`;
                ctx.shadowBlur = 3;
                
                // Position the text above the cube
                ctx.fillText(`#${dot.blockNumber}`, dot.x, dot.y - cubeSize * 2);
                ctx.restore();
                
                // Draw connecting lines only on non-small screens for performance
                if (isActive && !isVerySmallScreen) {
                    txDots.forEach(otherDot => {
                        if (otherDot.hash !== dot.hash && otherDot.blockNumber === dot.blockNumber) {
                            // Draw a faint connecting line
                            ctx.beginPath();
                            ctx.moveTo(dot.x, dot.y);
                            ctx.lineTo(otherDot.x, otherDot.y);
                            ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.2)`;
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        }
                    });
                }
            }
            
            // Remove cubes that have moved off-screen to the left
            if (dot.x < -50) {
                txDots.splice(index, 1);
            }
        });
        
        // Request next frame
        requestAnimationFrame(drawMatrix);
    }
    
    // Function to draw a 3D cube
    function drawCube(ctx, x, y, size, color, opacity, rotationX, rotationY, rotationZ) {
        ctx.save();
        ctx.translate(x, y);
        
        // Create a brighter color for highlighted faces
        const brightColor = {
            r: Math.min(255, color.r + 100),
            g: Math.min(255, color.g + 100),
            b: Math.min(255, color.b + 100)
        };
        
        // Create a darker color for shadowed faces
        const darkColor = {
            r: Math.max(0, color.r - 50),
            g: Math.max(0, color.g - 50),
            b: Math.max(0, color.b - 50)
        };
        
        // For very small screens or low-performance devices, use simplified cubes (fewer faces)
        if (isVerySmallScreen) {
            // Simplified cube - just draw 3 faces for better performance
            // Use 2D rotation for simpler rendering
            ctx.rotate(rotationZ);
            
            // Draw a simplified cube (3 visible faces maximum)
            // Front face (always visible)
            ctx.beginPath();
            ctx.rect(-size, -size, size * 2, size * 2);
            ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(${Math.min(255, color.r + 120)}, ${Math.min(255, color.g + 120)}, ${Math.min(255, color.b + 120)}, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Add some 3D effect with simple lines
            ctx.beginPath();
            ctx.moveTo(-size, -size);
            ctx.lineTo(-size * 0.7, -size * 0.7);
            ctx.moveTo(size, -size);
            ctx.lineTo(size * 0.7, -size * 0.7);
            ctx.moveTo(size, size);
            ctx.lineTo(size * 0.7, size * 0.7);
            ctx.moveTo(-size, size);
            ctx.lineTo(-size * 0.7, size * 0.7);
            ctx.stroke();
            
            // Top face
            ctx.beginPath();
            ctx.moveTo(-size * 0.7, -size * 0.7);
            ctx.lineTo(size * 0.7, -size * 0.7);
            ctx.lineTo(size * 0.7, size * 0.7);
            ctx.lineTo(-size * 0.7, size * 0.7);
            ctx.closePath();
            ctx.fillStyle = `rgba(${brightColor.r}, ${brightColor.g}, ${brightColor.b}, ${opacity * 0.9})`;
            ctx.fill();
            ctx.stroke();
        } else {
            // Full 3D cube for better hardware
            // Define the vertices of a cube
            // Centered at origin for easier rotation
            const vertices = [
                { x: -size, y: -size, z: -size }, // 0: back-top-left
                { x: size, y: -size, z: -size },  // 1: back-top-right
                { x: size, y: size, z: -size },   // 2: back-bottom-right
                { x: -size, y: size, z: -size },  // 3: back-bottom-left
                { x: -size, y: -size, z: size },  // 4: front-top-left
                { x: size, y: -size, z: size },   // 5: front-top-right
                { x: size, y: size, z: size },    // 6: front-bottom-right
                { x: -size, y: size, z: size }    // 7: front-bottom-left
            ];
            
            // Apply 3D rotation to vertices
            const rotatedVertices = vertices.map(v => {
                // Apply X rotation
                let y1 = v.y * Math.cos(rotationX) - v.z * Math.sin(rotationX);
                let z1 = v.y * Math.sin(rotationX) + v.z * Math.cos(rotationX);
                
                // Apply Y rotation
                let x2 = v.x * Math.cos(rotationY) + z1 * Math.sin(rotationY);
                let z2 = -v.x * Math.sin(rotationY) + z1 * Math.cos(rotationY);
                
                // Apply Z rotation
                let x3 = x2 * Math.cos(rotationZ) - y1 * Math.sin(rotationZ);
                let y3 = x2 * Math.sin(rotationZ) + y1 * Math.cos(rotationZ);
                
                return { x: x3, y: y3, z: z2 };
            });
            
            // Define the faces of the cube (vertex indices)
            const faces = [
                { indices: [0, 1, 2, 3], color: darkColor },    // Back face
                { indices: [4, 5, 6, 7], color: color },        // Front face
                { indices: [0, 4, 7, 3], color: darkColor },    // Left face
                { indices: [1, 5, 6, 2], color: brightColor },  // Right face
                { indices: [0, 1, 5, 4], color: brightColor },  // Top face
                { indices: [3, 2, 6, 7], color: darkColor }     // Bottom face
            ];
            
            // Calculate depth for each face to determine drawing order (painter's algorithm)
            const faceDepths = faces.map((face, i) => {
                // Calculate center point of the face as average of its vertices
                const centerZ = face.indices.reduce((sum, index) => sum + rotatedVertices[index].z, 0) / face.indices.length;
                return { index: i, z: centerZ };
            });
            
            // Sort faces by depth (back to front)
            faceDepths.sort((a, b) => a.z - b.z);
            
            // Draw faces in sorted order
            faceDepths.forEach(fd => {
                const face = faces[fd.index];
                
                // Draw a face
                ctx.beginPath();
                for (let i = 0; i < face.indices.length; i++) {
                    const vertex = rotatedVertices[face.indices[i]];
                    if (i === 0) {
                        ctx.moveTo(vertex.x, vertex.y);
                    } else {
                        ctx.lineTo(vertex.x, vertex.y);
                    }
                }
                ctx.closePath();
                
                // Fill with appropriate color
                ctx.fillStyle = `rgba(${face.color.r}, ${face.color.g}, ${face.color.b}, ${opacity})`;
                ctx.fill();
                
                // Add stroke for edge definition
                ctx.strokeStyle = `rgba(${Math.min(255, color.r + 120)}, ${Math.min(255, color.g + 120)}, ${Math.min(255, color.b + 120)}, ${opacity})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            });
        }
        
        ctx.restore();
    }
    
    // Find the nearest transaction cube to a given position
    function findNearestDot(x, y) {
        let closestDot = null;
        let closestDistance = Number.MAX_VALUE;
        
        // Calculate distance to each cube
        txDots.forEach(dot => {
            const dx = dot.x - x;
            const dy = dot.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Check if this is the closest cube (using hit area based on size)
            if (distance < closestDistance && distance < dot.size * 2) {
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
        
        // Determine value category text and color - synthwave colors
        let valueCategory = '';
        let categoryColor = '';
        
        const value = tx.value || 0;
        if (value >= 100) {
            valueCategory = 'Very High';
            categoryColor = 'rgba(255, 50, 50, 1)'; // Bright red
        } else if (value >= 10) {
            valueCategory = 'High';
            categoryColor = 'rgba(191, 85, 255, 1)'; // Neon purple
        } else if (value >= 1) {
            valueCategory = 'Medium';
            categoryColor = 'rgba(255, 105, 180, 1)'; // Hot pink
        } else {
            valueCategory = 'Low';
            categoryColor = 'rgba(80, 250, 255, 1)'; // Neon cyan
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
    
    // When initializing for mobile, limit the number of transactions for better performance
    function initMobile() {
        // Keep fewer dots on screen for better performance on mobile
        if (isMobile) {
            const maxDots = isVerySmallScreen ? 30 : 50;
            if (txDots.length > maxDots) {
                txDots = txDots.slice(0, maxDots);
            }
        }
    }
    
    // Initialize everything
    function init() {
        initCanvas();
        initChart();
        setupChartAndUI();
        if (isMobile) {
            initMobile();
        }
        drawMatrix();
    }
    
    // Start the magic!
    init();
});