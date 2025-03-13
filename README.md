# Ethereum Transaction Explorer

A simple Node.js server application that uses the Etherscan.io API to retrieve and display Ethereum transactions in real-time.

## Prerequisites

- Node.js (v14.0.0 or later)
- npm (v6.0.0 or later)
- Etherscan API key (get one at https://etherscan.io/apis)

## Installation

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add your Etherscan API key:
   ```
   ETHERSCAN_API_KEY=your_api_key_here
   ```

## Usage

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

3. You will see a scrolling window displaying Ethereum transactions in real-time.

## Features

- Real-time Ethereum transaction monitoring
- Responsive scrolling transaction display
- Transaction filtering options

## License

MIT
