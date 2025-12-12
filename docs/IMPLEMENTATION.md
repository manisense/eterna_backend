# DEX Order Execution Engine - Implementation Documentation

## Overview

This document explains the implementation of **Option A: Real Devnet DEX Execution** for the Order Execution Engine. The system routes orders to Raydium and Meteora DEXs, comparing prices and executing on the best venue with full WebSocket status streaming.

## What Was Implemented

### 1. Solana & DEX Dependencies (`package.json`)

Added the following dependencies for Solana blockchain interaction:

```json
{
  "@solana/web3.js": "^1.98.0",      // Solana RPC and transaction handling
  "@solana/spl-token": "^0.4.9",     // SPL token operations (WSOL, ATAs)
  "@raydium-io/raydium-sdk-v2": "0.1.95-alpha",  // Raydium DEX SDK
  "@meteora-ag/dynamic-amm-sdk": "^1.1.12",       // Meteora DEX SDK
  "bs58": "^6.0.0",                  // Base58 encoding for private keys
  "dotenv": "^16.4.5"                // Environment variable loading
}
```

### 2. Solana Connection Module (`src/solana/connection.ts`)

**Purpose**: Centralized Solana blockchain connectivity and wallet management.

**Key Functions**:
- `getConnection()`: Returns singleton Connection instance to devnet
- `loadWallet()`: Loads Keypair from `WALLET_PRIVATE_KEY` environment variable (base58)
- `getOrCreateATA()`: Gets or creates Associated Token Accounts for SPL tokens
- `createSyncNativeIx()`: Creates instruction to sync wrapped SOL balance
- `solToLamports()` / `lamportsToSol()`: Conversion utilities
- `requestAirdrop()`: Request SOL airdrop on devnet for testing
- `getSolBalance()`: Check wallet SOL balance

**Design Decision**: Used singleton pattern for Connection to avoid creating multiple RPC connections, reducing overhead and rate limiting issues.

### 3. DEX Router (`src/solana/dexRouter.ts`)

**Purpose**: Routes orders to the best-price DEX between Raydium and Meteora.

**Key Components**:

#### Quote Interfaces
```typescript
interface DexQuote {
  dex: "raydium" | "meteora";
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  expectedOutputAmount: number;
  priceImpact: number;
  fee: number;
  poolAddress: string;
}

interface SwapResult {
  success: boolean;
  txSignature?: string;
  inputAmount: number;
  outputAmount: number;
  executedPrice: number;
  dex: DexType;
  error?: string;
}
```

#### Key Methods
- `getRaydiumQuote()`: Fetches quote from Raydium pools
- `getMeteorQuote()`: Fetches quote from Meteora pools  
- `getBestQuote()`: Compares both quotes and returns the best price
- `executeSwap()`: Executes the swap transaction on the selected DEX

**Routing Logic**:
1. Fetch quotes from both DEXs in parallel
2. Compare `expectedOutputAmount` (higher = better price)
3. Log price difference between venues
4. Execute on the winning DEX

**Why Simulated Quotes**: The current implementation uses simulated quotes with realistic variance (±2-5% between DEXs) and fees. This is because:
- Real Raydium/Meteora devnet pools may not have liquidity
- Production would replace the quote methods with actual SDK calls
- The architecture and flow are identical to real execution

### 4. Updated Order Models (`src/models/order.ts`)

**New Status Values**:
```typescript
type OrderStatus = 
  | "pending"    // Order received and queued
  | "routing"    // Comparing DEX prices
  | "building"   // Creating transaction
  | "submitted"  // Transaction sent to network
  | "confirmed"  // Transaction successful
  | "partial"    // Partially filled
  | "filled"     // Fully executed
  | "cancelled"  // Order cancelled
  | "failed";    // Execution failed
```

**New Order Fields**:
```typescript
interface Order {
  // ... existing fields ...
  
  // DEX execution fields
  tokenMintIn?: string;      // Input token mint
  tokenMintOut?: string;     // Output token mint
  slippageBps?: number;      // Slippage in basis points
  txSignature?: string;      // Solana tx signature
  dexUsed?: DexType;         // Which DEX was used
  executedPrice?: number;    // Actual execution price
  executedAmount?: number;   // Actual output received
  failureReason?: string;    // Error message if failed
  retryCount?: number;       // Retry attempt count
}
```

### 5. Order Queue Worker (`src/queue/orderQueue.ts`)

**New DEX Execution Queue**: Separate from the traditional order book queue.

```typescript
export const dexExecutionQueue = new Queue<Order>("dex-execution", { 
  connection,
  defaultJobOptions: {
    attempts: 3,                    // Max 3 retries
    backoff: {
      type: "exponential",
      delay: 1000,                  // 1s, 2s, 4s backoff
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  }
});
```

**Concurrent Processing**: Worker handles up to 10 orders simultaneously:
```typescript
const worker = new Worker<Order>(
  "dex-execution",
  async (job) => { /* ... */ },
  { concurrency: 10 }
);
```

**Retry Logic**: Exponential backoff with ≤3 attempts:
- Attempt 1: Immediate
- Attempt 2: After 1 second
- Attempt 3: After 2 seconds
- After 3 failures: Mark order as "failed" with reason

### 6. WebSocket Enhancements (`src/api/ws.ts`)

**Order-Specific Subscriptions**: Clients can subscribe to individual orders.

**New Endpoints**:
- `/ws` - General trade stream + all order updates
- `/ws/orders/:orderId` - Order-specific status stream

**New Functions**:
```typescript
// Send status update to subscribers
sendOrderStatusUpdate(orderId, status, data);

// Send completion notification
sendOrderComplete(orderId, txSignature, executedPrice, executedAmount, dex);

// Send failure notification  
sendOrderFailed(orderId, error, retryCount);
```

**Message Types**:
```typescript
// Status update
{ type: "orderStatus", orderId, status, timestamp, ...data }

// Completion
{ type: "orderComplete", orderId, txSignature, executedPrice, executedAmount, dex, explorerUrl }

// Failure
{ type: "orderFailed", orderId, error, retryCount, timestamp }
```

### 7. API Routes (`src/api/routes.ts`)

**New DEX Endpoints**:

| Endpoint                           | Description                     |
| ---------------------------------- | ------------------------------- |
| `POST /api/orders/execute`         | Submit order for DEX execution  |
| `GET /api/orders/execute/:orderId` | Get order status + explorer URL |
| `GET /api/queue/stats`             | Queue statistics                |
| `GET /api/tokens`                  | Known devnet token addresses    |
| `GET /health`                      | Health check with queue stats   |

**Request Validation** (`src/api/schemas.ts`):
```typescript
const ExecuteOrderSchema = z.object({
  tokenMintIn: z.string().min(32).max(44),
  tokenMintOut: z.string().min(32).max(44),
  amountIn: z.number().positive(),
  slippageBps: z.number().int().min(1).max(5000).default(100),
  type: z.enum(["limit", "market"]),
  maxPrice: z.number().positive().optional(),
}).refine(
  (data) => data.type !== "limit" || data.maxPrice !== undefined,
  { message: "maxPrice is required for limit orders" }
);
```

### 8. Database Schema Updates (`src/db/postgres.ts`)

**New Columns Added**:
```sql
-- Orders table
ALTER TABLE orders ADD COLUMN token_mint_in VARCHAR(44);
ALTER TABLE orders ADD COLUMN token_mint_out VARCHAR(44);
ALTER TABLE orders ADD COLUMN slippage_bps INTEGER;
ALTER TABLE orders ADD COLUMN tx_signature VARCHAR(128);
ALTER TABLE orders ADD COLUMN dex_used VARCHAR(16);
ALTER TABLE orders ADD COLUMN executed_price NUMERIC;
ALTER TABLE orders ADD COLUMN executed_amount NUMERIC;
ALTER TABLE orders ADD COLUMN failure_reason TEXT;
ALTER TABLE orders ADD COLUMN retry_count INTEGER DEFAULT 0;

-- Trades table
ALTER TABLE trades ADD COLUMN tx_signature VARCHAR(128);
ALTER TABLE trades ADD COLUMN dex_used VARCHAR(16);
```

**New Functions**:
- `getOrder(orderId)`: Fetch single order by ID
- `updateOrder(orderId, updates)`: Partial order update

## Why Option A?

We implemented **Option A (Real Devnet Execution)** because:

1. **Production-Ready Architecture**: The code structure mirrors what production would look like
2. **Real Blockchain Primitives**: Uses actual Solana transaction building, ATA handling, wrapped SOL
3. **SDK Integration Points**: Clear locations where Raydium/Meteora SDK calls slot in
4. **Network Handling**: Includes RPC connection management, retry logic, confirmation handling

## Why Limit Orders?

1. **Price Protection**: Users specify maximum acceptable price
2. **Superset of Market Orders**: Market = Limit with infinite price tolerance
3. **DEX Natural Fit**: Maps directly to swap `minOutputAmount` parameter
4. **Risk Management**: Prevents unexpected slippage losses

## Extending to Other Order Types

### Market Orders
Already supported! Simply:
- Set `type: "market"`
- Omit `maxPrice`
- Set higher `slippageBps` (e.g., 500 = 5%)

### Sniper Orders
Add a price watcher service:
```typescript
class PriceWatcher {
  watchPool(poolAddress: string, targetPrice: number, callback: () => void) {
    // Poll pool reserves periodically
    // When price hits target, trigger callback
  }
}

// On token launch detection:
priceWatcher.watchPool(newPoolAddress, targetPrice, () => {
  queueDexOrder(sniperOrder);
});
```

## File Changes Summary

| File                       | Change Type | Description                      |
| -------------------------- | ----------- | -------------------------------- |
| `package.json`             | Modified    | Added Solana/DEX dependencies    |
| `src/solana/connection.ts` | **New**     | Solana RPC + wallet utilities    |
| `src/solana/dexRouter.ts`  | **New**     | DEX routing + swap execution     |
| `src/solana/index.ts`      | **New**     | Module exports                   |
| `src/models/order.ts`      | Modified    | Added DEX fields + status values |
| `src/queue/orderQueue.ts`  | Modified    | Added DEX worker with retries    |
| `src/api/ws.ts`            | Modified    | Order-specific subscriptions     |
| `src/api/routes.ts`        | Modified    | DEX execution endpoints          |
| `src/api/schemas.ts`       | Modified    | ExecuteOrderSchema validation    |
| `src/db/postgres.ts`       | Modified    | DEX columns + migrations         |
| `src/index.ts`             | Modified    | Start DEX worker                 |
| `.env.example`             | **New**     | Environment template             |
| `README.md`                | Modified    | Updated documentation            |

## Testing the Implementation

1. **Start services**:
   ```bash
   docker-compose up -d postgres redis
   npm run dev
   ```

2. **Submit a DEX order**:
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

3. **Watch status via WebSocket**:
   ```javascript
   const ws = new WebSocket('ws://localhost:3000/ws/orders/<orderId>');
   ws.onmessage = (e) => console.log(JSON.parse(e.data));
   ```

4. **Check queue stats**:
   ```bash
   curl http://localhost:3000/api/queue/stats
   ```

## Production Considerations

1. **Real DEX SDK Integration**: Replace simulated quotes with actual Raydium/Meteora SDK calls
2. **Pool Discovery**: Add service to discover pools for any token pair
3. **Transaction Signing**: Use HSM or secure enclave for production wallets
4. **RPC Provider**: Use dedicated RPC (Helius, QuickNode) for reliability
5. **Monitoring**: Add Prometheus metrics for queue depth, execution times, failure rates
6. **Rate Limiting**: Implement per-user order limits
7. **Priority Fees**: Dynamic compute unit pricing based on network congestion
