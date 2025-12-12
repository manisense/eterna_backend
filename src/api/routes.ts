import { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { CreateOrderSchema, ExecuteOrderSchema } from "./schemas.js";
import { orderQueue, queueDexOrder, getQueueStats } from "../queue/index.js";
import { MatchingEngine } from "../engine/index.js";
import {
  saveOrder,
  getOrderHistory,
  getTradeHistory,
  cacheActiveOrder,
  removeActiveOrder,
  updateOrder,
  getOrder,
} from "../db/index.js";
import type { Order } from "../models/index.js";
import { sendOrderStatusUpdate } from "./ws.js";
import { DEVNET_TOKENS } from "../solana/index.js";

export async function registerRoutes(
  app: FastifyInstance,
  engine: MatchingEngine
): Promise<void> {
  // ============== DEX EXECUTION ENDPOINTS ==============

  /**
   * POST /api/orders/execute
   * Submit order for DEX execution (Raydium/Meteora routing)
   * Returns orderId immediately, execution progress via WebSocket
   */
  app.post("/api/orders/execute", async (req, reply) => {
    const parsed = ExecuteOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;

    // Create order with DEX execution fields
    const order: Order = {
      id: uuid(),
      symbol: `${input.tokenMintIn.slice(0, 4)}/${input.tokenMintOut.slice(
        0,
        4
      )}`,
      side: "buy", // DEX swaps are always "buy output token"
      type: input.type,
      price: input.maxPrice || 0,
      quantity: input.amountIn,
      filled: 0,
      status: "pending",
      createdAt: Date.now(),
      // DEX-specific fields
      tokenMintIn: input.tokenMintIn,
      tokenMintOut: input.tokenMintOut,
      slippageBps: input.slippageBps,
      retryCount: 0,
    };

    // Save to database
    await saveOrder(order);
    await cacheActiveOrder(order);

    // Send initial status update
    sendOrderStatusUpdate(order.id, "pending", {
      tokenMintIn: order.tokenMintIn,
      tokenMintOut: order.tokenMintOut,
      quantity: order.quantity,
    });

    // Queue for DEX execution
    await queueDexOrder(order);

    return reply.status(202).send({
      orderId: order.id,
      status: "pending",
      wsEndpoint: `/ws/orders/${order.id}`,
      message:
        "Order queued for DEX execution. Connect to WebSocket for live updates.",
    });
  });

  /**
   * GET /api/orders/execute/:orderId
   * Get status of a DEX execution order
   */
  app.get("/api/orders/execute/:orderId", async (req, reply) => {
    const { orderId } = req.params as { orderId: string };

    const order = await getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: "Order not found" });
    }

    return reply.send({
      order,
      explorerUrl: order.txSignature
        ? `https://explorer.solana.com/tx/${order.txSignature}?cluster=devnet`
        : null,
    });
  });

  /**
   * GET /api/queue/stats
   * Get DEX execution queue statistics
   */
  app.get("/api/queue/stats", async (_req, reply) => {
    const stats = await getQueueStats();
    return reply.send(stats);
  });

  /**
   * GET /api/tokens
   * Get known devnet token addresses
   */
  app.get("/api/tokens", async (_req, reply) => {
    return reply.send({
      tokens: DEVNET_TOKENS,
      note: "These are example devnet token addresses. Real pools may vary.",
    });
  });

  // ============== ORIGINAL ORDER BOOK ENDPOINTS ==============

  // Submit order (original order book matching)
  app.post("/orders", async (req, reply) => {
    const parsed = CreateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    const order: Order = {
      id: uuid(),
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      price: input.price,
      quantity: input.quantity,
      filled: 0,
      status: "pending",
      createdAt: Date.now(),
    };
    await saveOrder(order);
    await cacheActiveOrder(order);
    await orderQueue.add("order", order);
    return reply.status(202).send({ orderId: order.id });
  });

  // Cancel order
  app.delete("/orders/:symbol/:orderId", async (req, reply) => {
    const { symbol, orderId } = req.params as {
      symbol: string;
      orderId: string;
    };
    const cancelled = engine.cancel(symbol, orderId);
    if (cancelled) {
      await removeActiveOrder(symbol, orderId);
    }
    return reply.send({ cancelled });
  });

  // Get order book
  app.get("/orderbook/:symbol", async (req, reply) => {
    const { symbol } = req.params as { symbol: string };
    const book = engine.getBook(symbol);
    if (!book) return reply.send({ bids: [], asks: [] });
    return reply.send({ bids: book.getBids(), asks: book.getAsks() });
  });

  // Order history
  app.get("/orders", async (req, reply) => {
    const { symbol } = req.query as { symbol?: string };
    const orders = await getOrderHistory(symbol);
    return reply.send(orders);
  });

  // Trade history
  app.get("/trades", async (req, reply) => {
    const { symbol } = req.query as { symbol?: string };
    const trades = await getTradeHistory(symbol);
    return reply.send(trades);
  });

  // Health check
  app.get("/health", async (_req, reply) => {
    const queueStats = await getQueueStats();
    return reply.send({
      status: "ok",
      timestamp: Date.now(),
      queue: queueStats,
    });
  });
}
