import "dotenv/config";
import Fastify from "fastify";
import { MatchingEngine } from "./engine/index.js";
import {
  registerRoutes,
  registerWebSocket,
  broadcastTrades,
  sendOrderStatusUpdate,
  sendOrderComplete,
  sendOrderFailed,
} from "./api/index.js";
import { initDb, saveTrade, saveOrder, updateOrder } from "./db/index.js";
import { startOrderWorker, startDexExecutionWorker } from "./queue/index.js";
import type { Order } from "./models/index.js";
import type { SwapResult } from "./solana/index.js";
import { v4 as uuid } from "uuid";

async function main() {
  const app = Fastify({ logger: true });

  // Root route for health check
  app.get("/", async () => {
    return { status: "ok", service: "Order Execution Engine", version: "0.1.0" };
  });

  app.get("/health", async () => {
    return { status: "healthy", timestamp: new Date().toISOString() };
  });

  const engine = new MatchingEngine();

  // Initialize DB tables
  await initDb();

  // Register REST and WebSocket routes
  await registerRoutes(app, engine);
  await registerWebSocket(app);

  // Start traditional order book worker
  startOrderWorker(engine, async (trades) => {
    for (const t of trades) await saveTrade(t);
    broadcastTrades(trades);
  });

  // Start DEX execution worker with WebSocket status updates
  startDexExecutionWorker(
    // Status update callback
    async (orderId: string, status: Order["status"], data?: Partial<Order>) => {
      sendOrderStatusUpdate(orderId, status, data);
      // Persist status update to database
      await updateOrder(orderId, { status, ...data });
    },
    // Trade completion callback
    async (order: Order, result: SwapResult) => {
      // Send WebSocket completion notification
      sendOrderComplete(
        order.id,
        result.txSignature || "",
        result.executedPrice,
        result.outputAmount,
        result.dex
      );

      // Create and save trade record
      const trade = {
        id: uuid(),
        symbol: order.symbol,
        price: result.executedPrice,
        quantity: order.quantity,
        buyOrderId: order.id,
        sellOrderId: order.id, // Self-trade for DEX swaps
        createdAt: Date.now(),
        txSignature: result.txSignature,
        dexUsed: result.dex as Order["dexUsed"],
      };
      await saveTrade(trade);
      broadcastTrades([trade]);

      // Update order with final execution data
      await updateOrder(order.id, {
        status: "confirmed",
        filled: order.quantity,
        txSignature: result.txSignature,
        executedPrice: result.executedPrice,
        executedAmount: result.outputAmount,
        dexUsed: result.dex as Order["dexUsed"],
      });
    }
  );

  const port = Number(process.env.PORT) || 3000;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Server listening on http://localhost:${port}`);
  console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
  console.log(
    `DEX Order execution: POST http://localhost:${port}/api/orders/execute`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
