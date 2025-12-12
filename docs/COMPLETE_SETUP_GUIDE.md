# Complete Setup & Deployment Guide

This guide covers everything from generating your Solana wallet to deploying the application on the cloud.

---

## 🔑 Part 1: Getting the Required Keys

You need 4 main credentials to run this application:

### 1. Solana Wallet (Private Key)
You need a Solana wallet to sign transactions.
**Option A: Using Solana CLI (Recommended for Devnet)**
1. Install Solana CLI: [Official Docs](https://docs.solanalabs.com/cli/install)
2. Generate a new keypair:
   ```bash
   solana-keygen new --outfile devnet.json
   ```
3. Get the Base58 Private Key (this is your `WALLET_PRIVATE_KEY`):
   ```bash
   cat devnet.json | node -e "console.log(require('bs58').encode(Buffer.from(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')))))"
   ```
   *Save this output string.*

**Option B: Using Phantom/Solflare**
1. Create a new wallet in the browser extension.
2. Go to Settings -> Export Private Key.
3. Copy the string.

### 2. Solana RPC URL
This connects your app to the blockchain.
*   **Free/Public (Devnet)**: `https://api.devnet.solana.com` (Rate limited, good for testing).
*   **Production (Mainnet)**: Sign up for [Helius](https://helius.dev) or [QuickNode](https://www.quicknode.com) to get a dedicated URL.

### 3. PostgreSQL Database URL
*   **Cloud (Free)**: Sign up for [Neon.tech](https://neon.tech).
    *   Create a project -> Dashboard -> Connection Details.
    *   Copy the connection string: `postgres://user:pass@.../neondb?sslmode=require`
*   **Local**: `postgresql://postgres:postgres@localhost:5432/order_engine`

### 4. Redis URL
*   **Cloud (Free)**: Sign up for [Upstash](https://upstash.com).
    *   Create Redis Database -> Scroll to "Connect" -> Select "ioredis".
    *   Copy the URL: `rediss://default:pass@...:6379`
*   **Local**: `redis://localhost:6379`

---

## 💻 Part 2: Local Setup

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd eterna_backend
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and paste the keys you obtained in Part 1:
   ```env
   PORT=3000
   DATABASE_URL=postgres://...
   REDIS_URL=rediss://...
   SOLANA_RPC_URL=https://api.devnet.solana.com
   WALLET_PRIVATE_KEY=5M... (your base58 key)
   ```

4. **Run Locally**:
   ```bash
   npm run dev
   ```
   Server should start at `http://localhost:3000`.

---

## ww Part 3: Cloud Deployment (Render.com)

We use **Render** because it supports WebSockets (unlike Vercel).

1. **Push your code to GitHub**.
2. **Sign up for [Render.com](https://render.com)**.
3. **Create a New Web Service**:
   *   Click **New +** -> **Web Service**.
   *   Connect your GitHub repo.
4. **Settings**:
   *   **Runtime**: Node
   *   **Build Command**: `npm install && npm run build`
   *   **Start Command**: `npm start`
   *   **Instance Type**: Free
5. **Environment Variables**:
   Scroll down and add the same variables from your local `.env`:
   *   `DATABASE_URL`
   *   `REDIS_URL`
   *   `SOLANA_RPC_URL`
   *   `WALLET_PRIVATE_KEY`
   *   `NODE_ENV` = `production`
6. **Deploy**: Click "Create Web Service".

---

## 🚀 Part 4: How to Use

Once deployed (e.g., `https://your-app.onrender.com`), you can interact with it.

### 1. Check Health
```bash
curl https://your-app.onrender.com/health
```

### 2. Connect WebSocket (Live Updates)
Use a WebSocket client (like Postman or a simple JS script) to connect to:
`wss://your-app.onrender.com/ws`

### 3. Submit an Order (DEX Execution)
```bash
curl -X POST https://your-app.onrender.com/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tokenMintIn": "So11111111111111111111111111111111111111112",
    "tokenMintOut": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    "amountIn": 0.1,
    "slippageBps": 100,
    "type": "limit",
    "maxPrice": 200
  }'
```

### 4. Watch the Magic
1. You will receive an `orderId` from the POST request.
2. Connect to `wss://your-app.onrender.com/ws/orders/<orderId>`.
3. You will see status updates:
   *   `pending` -> `routing` (checking Raydium/Meteora) -> `building` -> `submitted` -> `confirmed`.
