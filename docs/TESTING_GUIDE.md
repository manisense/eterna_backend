# 🧪 Backend Testing Guide

This guide provides a step-by-step walkthrough to thoroughly test the Order Execution Engine, including the **DEX Aggregator** (Solana) and the **Traditional Order Book**.

---

## 🛠 Prerequisites

You will need:
1.  **Terminal** (for `curl` commands).
2.  **WebSocket Client**:
    *   **CLI**: `wscat` (Recommended: `npm install -g wscat`)
    *   **GUI**: [Postman](https://www.postman.com/) or [Hoppscotch](https://hoppscotch.io/).
3.  **Base URL**:
    *   Local: `http://localhost:3000`
    *   Cloud: `https://eterna-backend-9ulk.onrender.com` (Replace with your actual URL)

---

## 1️⃣ System Health Check

Verify the server is running and accessible.

**Request:**
```bash
curl https://eterna-backend-9ulk.onrender.com/
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "Order Execution Engine",
  "version": "0.1.0"
}
```

---

## 2️⃣ Real-Time Data Feed (WebSockets)

Before placing orders, connect to the WebSocket feed to see real-time updates.

**Action:**
Open a new terminal window and connect.

```bash
wscat -c wss://eterna-backend-9ulk.onrender.com/ws
```

**Expected Output:**
```
Connected (press CTRL+C to quit)
```
*Keep this window open. You will see trade broadcasts here.*

---

## 3️⃣ Scenario A: DEX Execution (Solana Swap)

This tests the "Smart Router" that finds the best price between Raydium and Meteora on Solana Devnet.

### Step 1: Subscribe to Order Updates
In your **WebSocket terminal**, you can listen for global trades, but for specific order updates, you usually subscribe by ID. For this test, we'll watch the global feed or use the specific order endpoint after we get an ID.

### Step 2: Place a Swap Order
We will swap **0.01 SOL** for **USDC** (Devnet).

**Request:**
```bash
curl -X POST https://eterna-backend-9ulk.onrender.com/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tokenMintIn": "So11111111111111111111111111111111111111112",
    "tokenMintOut": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    "amountIn": 0.01,
    "slippageBps": 100,
    "type": "market"
  }'
```

**Expected Response:**
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "message": "Order queued for execution"
}
```

### Step 3: Monitor Progress
1.  Copy the `orderId` from the response.
2.  (Optional) Connect to the specific order stream:
    ```bash
    wscat -c wss://your-app.onrender.com/ws/orders/<YOUR_ORDER_ID>
    ```
3.  **Watch the logs** (in Render dashboard or local terminal). You should see:
    *   `[Queue] Processing order...`
    *   `[Router] Checking Raydium...`
    *   `[Router] Checking Meteora...`
    *   `[Router] Best route found: Raydium`
    *   `[Execution] Transaction confirmed: <TX_SIGNATURE>`

---

## 4️⃣ Scenario B: Traditional Order Book (Matching Engine)

This tests the internal matching engine (Limit Orders).

### Step 1: Place a SELL Limit Order
User A wants to sell **10 BTC** at **$50,000**.

**Request:**
```bash
curl -X POST https://eterna-backend-9ulk.onrender.com/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "type": "limit",
    "side": "sell",
    "price": 50000,
    "quantity": 10,
    "symbol": "BTC-USDC"
  }'
```

**Response:** `{"orderId": "..."}`

### Step 2: Place a BUY Limit Order (Matching)
User B wants to buy **5 BTC** at **$50,000**. This should match immediately.

**Request:**
```bash
curl -X POST https://eterna-backend-9ulk.onrender.com/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "type": "limit",
    "side": "buy",
    "price": 50000,
    "quantity": 5,
    "symbol": "BTC-USDC"
  }'
```

### Step 3: Verify Match (WebSocket)
Check your **WebSocket terminal**. You should see a trade message:

```json
{
  "type": "trades",
  "data": [
    {
      "symbol": "BTC-USDC",
      "price": 50000,
      "quantity": 5,
      "makerOrderId": "...",
      "takerOrderId": "..."
    }
  ]
}
```

### Step 4: Verify Order Book State
Check the order book. There should be **5 BTC** left for sale at $50,000.

**Request:**
```bash
curl https://eterna-backend-9ulk.onrender.com/api/orderbook/BTC-USDC
```

**Expected Response:**
```json
{
  "bids": [],
  "asks": {
    "50000": 5
  }
}
```

---

## 5️⃣ Error Handling Tests

### Invalid Token Mint (DEX)
Try to swap a non-existent token.

**Request:**
```bash
curl -X POST https://eterna-backend-9ulk.onrender.com/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tokenMintIn": "INVALID_TOKEN_MINT_ADDRESS",
    "tokenMintOut": "So11111111111111111111111111111111111111112",
    "amountIn": 1,
    "type": "market"
  }'
```

**Expected Result:**
*   API returns 202 (Accepted).
*   WebSocket/Logs show: `Order failed: Invalid token mint` or similar error from the Solana SDK.

---

## 6️⃣ Load Testing (Optional)

To test the queue system, you can spam multiple orders.

```bash
for i in {1..5}; do
  curl -X POST https://eterna-backend-9ulk.onrender.com/api/orders/execute \
    -H "Content-Type: application/json" \
    -d '{
      "tokenMintIn": "So11111111111111111111111111111111111111112",
      "tokenMintOut": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "amountIn": 0.001,
      "type": "market"
    }' &
done
```

**Observation:**
*   The server should accept all requests immediately.
*   The logs should show them being processed one by one (or concurrently depending on worker concurrency settings).
