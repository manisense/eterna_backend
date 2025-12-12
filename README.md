# Eterna Backend – Order Execution Engine

Real-time order execution engine with **DEX routing** (Raydium/Meteora) built with **Node.js + TypeScript**, **Fastify**, **BullMQ**, **Redis**, and **PostgreSQL**.

## 🎯 Order Type Choice: Limit Orders

**Why Limit Orders?** We chose to implement **Limit Orders** as the primary order type because:
1. **Price Protection**: Limit orders provide slippage protection by specifying a maximum acceptable price
2. **Extensibility**: Market orders are simply limit orders with `maxPrice = ∞` (or very high slippage tolerance)
3. **DEX Compatibility**: Limit orders map naturally to DEX swap parameters (amount + minOutputAmount)

**Extending to Other Order Types:**
- **Market Orders**: Already supported - just omit `maxPrice` and set higher `slippageBps`
- **Sniper Orders**: Add a price watcher service that monitors pools for target prices and auto-triggers limit orders when conditions are met

## Features

### DEX Execution (Option A - Real Devnet)
- ✅ Raydium and Meteora quote fetching
- ✅ Automatic routing to best-price DEX
- ✅ WebSocket status streaming (`pending` → `routing` → `building` → `submitted` → `confirmed`)
- ✅ Exponential backoff retry (≤3 attempts)
- ✅ Concurrent order processing (up to 10 orders)
- ✅ Slippage protection

### Core Features
- ✅ Limit & market orders with price-time priority matching
- ✅ BullMQ job queue for order processing
- ✅ WebSocket broadcast of executed trades and order status
- ✅ PostgreSQL for order/trade history; Redis for active orders

## Tech Stack
- Node.js 20+
- TypeScript 5
- Fastify (REST + WebSocket)
- BullMQ + ioredis
- PostgreSQL 15+, Redis 7+
- Solana Web3.js, Raydium SDK, Meteora SDK

## Quick Start

```bash
# Install deps
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your Solana wallet and database credentials

# Set env vars (or use .env)
export DATABASE_URL=postgres://user:pass@localhost:5432/orders
export REDIS_URL=redis://localhost:6379
export SOLANA_RPC_URL=https://api.devnet.solana.com
export WALLET_PRIVATE_KEY=your_base58_private_key

# Dev mode (hot reload)
npm run dev

# Build & run
npm run build && npm start

# Run tests
npm test
```

## API

### DEX Execution Endpoints

| Method | Endpoint                       | Description                    |
| ------ | ------------------------------ | ------------------------------ |
| POST   | `/api/orders/execute`          | Submit order for DEX execution |
| GET    | `/api/orders/execute/:orderId` | Get DEX order status           |
| GET    | `/api/queue/stats`             | Queue statistics               |
| GET    | `/api/tokens`                  | Known devnet token addresses   |
| GET    | `/health`                      | Health check with queue stats  |
| WS     | `/ws/orders/:orderId`          | Order-specific status stream   |

### Order Book Endpoints (Legacy)

| Method | Endpoint                   | Description    |
| ------ | -------------------------- | -------------- |
| POST   | `/orders`                  | Submit order   |
| DELETE | `/orders/:symbol/:orderId` | Cancel order   |
| GET    | `/orderbook/:symbol`       | Live bids/asks |
| GET    | `/orders?symbol=`          | Order history  |
| GET    | `/trades?symbol=`          | Trade history  |
| WS     | `/ws`                      | Trade stream   |

### Example: Submit DEX Order

```bash
curl -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tokenMintIn": "So11111111111111111111111111111111111111112",
    "tokenMintOut": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    "amountIn": 0.1,
    "slippageBps": 100,
    "type": "limit",
    "maxPrice": 250
  }'
```

### WebSocket Status Updates

Connect to `/ws/orders/:orderId` for live order status:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws/orders/your-order-id');
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log(`Status: ${update.status}`);
  // pending → routing → building → submitted → confirmed/failed
};
```

## Project Structure
```
src/
  api/        # Fastify routes + WebSocket
  db/         # Postgres & Redis helpers
  engine/     # OrderBook, MatchingEngine
  models/     # TypeScript types (Order, Trade)
  queue/      # BullMQ workers (order book + DEX execution)
  solana/     # Solana connection, DEX router
  index.ts    # Entrypoint
tests/        # Vitest unit tests
```

## Order Execution Flow

```
1. POST /api/orders/execute
   ↓
2. Order saved to DB + cached in Redis
   ↓
3. WebSocket: { status: "pending" }
   ↓
4. BullMQ worker picks up job
   ↓
5. WebSocket: { status: "routing" }
   ↓
6. Fetch quotes from Raydium & Meteora
   ↓
7. Select best price DEX
   ↓
8. WebSocket: { status: "building", dex: "raydium" }
   ↓
9. Build & sign Solana transaction
   ↓
10. WebSocket: { status: "submitted", txSignature: "..." }
    ↓
11. Wait for confirmation
    ↓
12. WebSocket: { status: "confirmed", executedPrice: 199.5, explorerUrl: "..." }
```
