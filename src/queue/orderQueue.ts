import { Queue, Worker, Job } from 'bullmq';
import type { Order, Trade } from '../models/index.js';
import { MatchingEngine } from '../engine/index.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = { url: REDIS_URL };

export const orderQueue = new Queue<Order>('orders', { connection });

export function startOrderWorker(
  engine: MatchingEngine,
  onTrade: (trades: Trade[]) => void
): Worker<Order> {
  const worker = new Worker<Order>(
    'orders',
    async (job: Job<Order>) => {
      const order = job.data;
      const trades = engine.submit(order);
      if (trades.length > 0) onTrade(trades);
      return { orderId: order.id, trades: trades.length };
    },
    { connection }
  );

  worker.on('failed', (job, err) => {
    console.error(`Order job ${job?.id} failed:`, err);
  });

  return worker;
}
