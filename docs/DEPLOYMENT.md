# Deployment Guide: Cloud Hosting with WebSocket Support

This guide explains how to deploy the Order Execution Engine to a cloud provider. Since this application requires **long-running WebSocket connections** and a **persistent background worker** (BullMQ), standard serverless platforms like Vercel are **NOT recommended** for the main application server.

Instead, we recommend using **Render** or **Railway**, which offer free or low-cost tiers for persistent Node.js services.

## Recommended Stack (Free Tier Friendly)

| Component            | Service                  | Plan      |
| -------------------- | ------------------------ | --------- |
| **Backend API + WS** | **Render** (Web Service) | Free Tier |
| **PostgreSQL**       | **Neon** or **Supabase** | Free Tier |
| **Redis**            | **Upstash**              | Free Tier |

---

## Prerequisites

1. Push your code to a **GitHub repository**.
2. Sign up for accounts on [Render](https://render.com), [Neon](https://neon.tech), and [Upstash](https://upstash.com).

---

## Step 1: Set up the Database (PostgreSQL)

1. Go to **Neon** (or Supabase) and create a new project.
2. Copy the **Connection String** (e.g., `postgres://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require`).
3. Save this for later as your `DATABASE_URL`.

## Step 2: Set up Redis (Upstash)

1. Go to **Upstash** and create a new Redis database.
2. Scroll down to the "Connect" section and copy the `ioredis` connection string (e.g., `rediss://default:password@us1-xyz.upstash.io:3000`).
3. Save this for later as your `REDIS_URL`.

---

## Step 3: Deploy Backend to Render

Render is ideal because it allows you to run a standard Node.js server that keeps WebSocket connections alive.

1. **Create a Web Service**:
   - Go to the Render Dashboard and click **New +** -> **Web Service**.
   - Connect your GitHub repository.

2. **Configure the Service**:
   - **Name**: `eterna-backend`
   - **Region**: Choose one close to you (e.g., Ohio, Frankfurt).
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

3. **Environment Variables**:
   Scroll down to "Environment Variables" and add the following:

   | Key                  | Value                           |
   | -------------------- | ------------------------------- |
   | `NODE_ENV`           | `production`                    |
   | `DATABASE_URL`       | *(Paste from Step 1)*           |
   | `REDIS_URL`          | *(Paste from Step 2)*           |
   | `SOLANA_RPC_URL`     | `https://api.devnet.solana.com` |
   | `WALLET_PRIVATE_KEY` | *(Your Base58 Private Key)*     |

4. **Deploy**:
   - Click **Create Web Service**.
   - Render will clone your repo, install dependencies, build, and start the server.

5. **Verify**:
   - Once deployed, Render will give you a URL (e.g., `https://eterna-backend.onrender.com`).
   - Test the health endpoint: `https://eterna-backend.onrender.com/health`
   - Test WebSockets: `wss://eterna-backend.onrender.com/ws`

---

## Alternative: Deploy to Railway

Railway is another excellent option with a slightly better developer experience, though the free trial is limited.

1. Go to [Railway.app](https://railway.app) and start a new project.
2. Choose **Deploy from GitHub repo**.
3. Add **PostgreSQL** and **Redis** plugins directly within Railway (easiest setup) OR use external ones like Neon/Upstash.
4. Go to the **Settings** -> **Variables** tab of your Node.js service and add your env vars (`SOLANA_RPC_URL`, `WALLET_PRIVATE_KEY`, etc.).
5. Railway automatically detects the start command from `package.json`.
6. Once deployed, go to **Settings** -> **Networking** to generate a public domain.

---

## Why Not Vercel?

Vercel is designed for **Serverless Functions**, which are ephemeral (they spin up, handle a request, and die).

1. **WebSockets**: Standard WebSockets require a persistent connection. Vercel functions have a maximum execution time (usually 10-60 seconds), so they will kill active WebSocket connections.
2. **Background Workers**: This app uses `BullMQ` which needs a constantly running worker process to pick up jobs from Redis. Serverless functions cannot run background loops.

If you *must* use Vercel, you would need to split the architecture:
- **Vercel**: Host the HTTP API (POST /orders).
- **External Worker**: Host the BullMQ worker and WebSocket server on a VPS (DigitalOcean, EC2) or Render/Railway.

**Recommendation**: Stick to **Render** or **Railway** for this specific project to keep everything in one place.
