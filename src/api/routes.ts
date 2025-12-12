import { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { CreateOrderSchema } from './schemas.js';
import { orderQueue } from '../queue/index.js';
import { MatchingEngine } from '../engine/index.js';
import { saveOrder, getOrderHistory, getTradeHistory, cacheActiveOrder, removeActiveOrder } from '../db/index.js';
import type { Order } from '../models/index.js';

export async function registerRoutes(app: FastifyInstance, engine: MatchingEngine): Promise<void> {
  // Submit order
  app.post('/orders', async (req, reply) => {
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
      status: 'pending',
      createdAt: Date.now(),
    };
    await saveOrder(order);
    await cacheActiveOrder(order);
    await orderQueue.add('order', order);
    return reply.status(202).send({ orderId: order.id });
  });

  // Cancel order
  app.delete('/orders/:symbol/:orderId', async (req, reply) => {
    const { symbol, orderId } = req.params as { symbol: string; orderId: string };
    const cancelled = engine.cancel(symbol, orderId);
    if (cancelled) {
      await removeActiveOrder(symbol, orderId);
    }
    return reply.send({ cancelled });
  });

  // Get order book
  app.get('/orderbook/:symbol', async (req, reply) => {
    const { symbol } = req.params as { symbol: string };
    const book = engine.getBook(symbol);
    if (!book) return reply.send({ bids: [], asks: [] });
    return reply.send({ bids: book.getBids(), asks: book.getAsks() });
  });

  // Order history
  app.get('/orders', async (req, reply) => {
    const { symbol } = req.query as { symbol?: string };
    const orders = await getOrderHistory(symbol);
    return reply.send(orders);
  });

  // Trade history
  app.get('/trades', async (req, reply) => {
    const { symbol } = req.query as { symbol?: string };
    const trades = await getTradeHistory(symbol);
    return reply.send(trades);
  });
}
