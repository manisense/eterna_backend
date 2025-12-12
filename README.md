# Eterna Backend – Order Execution Engine

Real-time order matching engine built with **Node.js + TypeScript**, **Fastify**, **BullMQ**, **Redis**, and **PostgreSQL**.

## Features
- Limit & market orders with price-time priority matching
- BullMQ job queue for order processing
- WebSocket broadcast of executed trades
- PostgreSQL for order/trade history; Redis for active orders

## Tech Stack
- Node.js 20+
- TypeScript 5
- Fastify (REST + WebSocket)
- BullMQ + ioredis
- PostgreSQL 15+, Redis 7+

## Quick Start

```bash
# Install deps
npm install

# Set env vars (or use .env)
export DATABASE_URL=postgres://user:pass@localhost:5432/orders
export REDIS_URL=redis://localhost:6379

# Dev mode (hot reload)
npm run dev

# Build & run
npm run build && npm start

# Run tests
npm test
```

## API

| Method | Endpoint                   | Description    |
| ------ | -------------------------- | -------------- |
| POST   | `/orders`                  | Submit order   |
| DELETE | `/orders/:symbol/:orderId` | Cancel order   |
| GET    | `/orderbook/:symbol`       | Live bids/asks |
| GET    | `/orders?symbol=`          | Order history  |
| GET    | `/trades?symbol=`          | Trade history  |
| WS     | `/ws`                      | Trade stream   |

## Project Structure
```
src/
  api/        # Fastify routes + WebSocket
  db/         # Postgres & Redis helpers
  engine/     # OrderBook, MatchingEngine
  models/     # TypeScript types
  queue/      # BullMQ worker
  index.ts    # Entrypoint
tests/        # Vitest unit tests
```
