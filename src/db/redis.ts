import Redis from "ioredis";
import type { Order } from "../models/index.js";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const ACTIVE_KEY = (symbol: string) => `active:orders:${symbol}`;

export async function cacheActiveOrder(order: Order): Promise<void> {
  await redis.hset(ACTIVE_KEY(order.symbol), order.id, JSON.stringify(order));
}

export async function removeActiveOrder(
  symbol: string,
  orderId: string
): Promise<void> {
  await redis.hdel(ACTIVE_KEY(symbol), orderId);
}

export async function getActiveOrders(symbol: string): Promise<Order[]> {
  const data = await redis.hgetall(ACTIVE_KEY(symbol));
  return Object.values(data).map((s) => JSON.parse(s) as Order);
}
