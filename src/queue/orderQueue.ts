import { Queue, Worker, Job } from "bullmq";
import type { Order, Trade } from "../models/index.js";
import { MatchingEngine } from "../engine/index.js";
import { getDexRouter, type SwapResult } from "../solana/index.js";
import { v4 as uuid } from "uuid";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const MAX_RETRIES = 3;
const MAX_CONCURRENT_ORDERS = 10;

const connection = { url: REDIS_URL };

// Order status update callback type
export type OrderStatusCallback = (orderId: string, status: Order["status"], data?: Partial<Order>) => void;

export const orderQueue = new Queue<Order>("orders", { connection });

// DEX execution queue - separate from order book matching
export const dexExecutionQueue = new Queue<Order>("dex-execution", { 
  connection,
  defaultJobOptions: {
    attempts: MAX_RETRIES,
    backoff: {
      type: "exponential",
      delay: 1000, // Start with 1s, then 2s, then 4s
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  }
});

/**
 * Start the traditional order book matching worker
 */
export function startOrderWorker(
  engine: MatchingEngine,
  onTrade: (trades: Trade[]) => void
): Worker<Order> {
  const worker = new Worker<Order>(
    "orders",
    async (job: Job<Order>) => {
      const order = job.data;
      const trades = engine.submit(order);
      if (trades.length > 0) onTrade(trades);
      return { orderId: order.id, trades: trades.length };
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    console.error(`Order job ${job?.id} failed:`, err);
  });

  return worker;
}

/**
 * Start the DEX execution worker
 * Processes orders through Raydium/Meteora with WebSocket status updates
 */
export function startDexExecutionWorker(
  onStatusUpdate: OrderStatusCallback,
  onTradeComplete: (order: Order, result: SwapResult) => void
): Worker<Order> {
  const router = getDexRouter();

  const worker = new Worker<Order>(
    "dex-execution",
    async (job: Job<Order>) => {
      const order = job.data;
      const attemptNumber = job.attemptsMade + 1;
      
      console.log(`[DEX Worker] Processing order ${order.id} (attempt ${attemptNumber}/${MAX_RETRIES})`);

      try {
        // Update status: routing
        onStatusUpdate(order.id, "routing", { retryCount: attemptNumber });

        // Get best quote from DEXs
        const quote = await router.getBestQuote(
          order.tokenMintIn!,
          order.tokenMintOut!,
          order.quantity
        );

        if (!quote) {
          throw new Error("No quotes available from any DEX");
        }

        // Update status: building
        onStatusUpdate(order.id, "building", { dexUsed: quote.dex as Order["dexUsed"] });

        // Execute the swap
        const result = await router.executeSwap({
          orderId: order.id,
          tokenMintIn: order.tokenMintIn!,
          tokenMintOut: order.tokenMintOut!,
          amountIn: order.quantity,
          slippageBps: order.slippageBps || 100,
          maxPrice: order.type === "limit" ? order.price : undefined,
        });

        if (!result.success) {
          throw new Error(result.error || "Swap execution failed");
        }

        // Update status: submitted (transaction sent)
        onStatusUpdate(order.id, "submitted", { 
          txSignature: result.txSignature,
          dexUsed: result.dex as Order["dexUsed"],
        });

        // Simulate confirmation delay (in production, you'd wait for actual confirmation)
        await sleep(500);

        // Update status: confirmed
        onStatusUpdate(order.id, "confirmed", {
          txSignature: result.txSignature,
          executedPrice: result.executedPrice,
          executedAmount: result.outputAmount,
          filled: order.quantity,
          dexUsed: result.dex as Order["dexUsed"],
        });

        // Notify trade completion
        onTradeComplete(order, result);

        return {
          orderId: order.id,
          success: true,
          txSignature: result.txSignature,
          executedPrice: result.executedPrice,
          dex: result.dex,
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[DEX Worker] Order ${order.id} attempt ${attemptNumber} failed:`, errorMessage);

        // If this was the last attempt, mark as failed
        if (attemptNumber >= MAX_RETRIES) {
          onStatusUpdate(order.id, "failed", {
            failureReason: errorMessage,
            retryCount: attemptNumber,
          });
        }

        throw error; // Re-throw to trigger retry
      }
    },
    { 
      connection,
      concurrency: MAX_CONCURRENT_ORDERS, // Process up to 10 orders concurrently
    }
  );

  worker.on("completed", (job) => {
    console.log(`[DEX Worker] Order ${job.data.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    if (job && job.attemptsMade >= MAX_RETRIES) {
      console.error(`[DEX Worker] Order ${job.data.id} permanently failed after ${MAX_RETRIES} attempts:`, err.message);
    }
  });

  worker.on("error", (err) => {
    console.error("[DEX Worker] Worker error:", err);
  });

  return worker;
}

/**
 * Add order to DEX execution queue
 */
export async function queueDexOrder(order: Order): Promise<void> {
  await dexExecutionQueue.add("dex-order", order, {
    jobId: order.id, // Use order ID as job ID for deduplication
  });
  console.log(`[Queue] Order ${order.id} added to DEX execution queue`);
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const [waiting, active, completed, failed] = await Promise.all([
    dexExecutionQueue.getWaitingCount(),
    dexExecutionQueue.getActiveCount(),
    dexExecutionQueue.getCompletedCount(),
    dexExecutionQueue.getFailedCount(),
  ]);
  return { waiting, active, completed, failed };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
