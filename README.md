# BTC/USD Streaming Platform

A real-time BTC/USD price streaming platform using Polymarket's Real-Time Data Socket (RTDS).

## Features

- Real-time BTC/USD price updates from Polymarket
- Chainlink oracle network data source
- Automatic reconnection on connection loss
- Price change indicators
- Modern, responsive UI
- BTC Up/Down 15m events tracking
- Active event display with countdown timer
- Price to Beat tracking for events
- Event details (Condition ID, Question ID, CLOB Token IDs)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

### Usage

1. Click "Connect" to start streaming BTC/USD prices
2. View real-time price updates in the main display
3. Click "Disconnect" to stop streaming

## Project Structure

```
polymarket-streaming/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── streaming-platform.ts   # Main platform class
│   ├── websocket-client.ts     # WebSocket client implementation
│   ├── types.ts                # TypeScript type definitions
│   └── styles.css              # Application styles
├── index.html                  # HTML template
├── package.json                # Project dependencies
├── tsconfig.json              # TypeScript configuration
└── vite.config.ts             # Vite configuration
```

## Technologies

- **TypeScript**: Type-safe JavaScript
- **Vite**: Fast build tool and dev server
- **WebSocket**: Real-time communication with Polymarket RTDS

## Data Source

### Chainlink Source
- Topic: `crypto_prices_chainlink`
- Symbol: `btc/usd`
- Format: Slash-separated pairs
- Provides reliable BTC/USD price data from Chainlink oracle networks

## WebSocket Endpoint

The application connects to Polymarket's WebSocket endpoint:
- `wss://ws-live-data.polymarket.com`

## License

MIT

