import { Pool } from 'pg';
import type { Order, Trade } from '../models/index.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      symbol VARCHAR(32) NOT NULL,
      side VARCHAR(4) NOT NULL,
      type VARCHAR(8) NOT NULL,
      price NUMERIC NOT NULL,
      quantity NUMERIC NOT NULL,
      filled NUMERIC NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trades (
      id UUID PRIMARY KEY,
      symbol VARCHAR(32) NOT NULL,
      price NUMERIC NOT NULL,
      quantity NUMERIC NOT NULL,
      buy_order_id UUID NOT NULL,
      sell_order_id UUID NOT NULL,
      created_at BIGINT NOT NULL
    );
  `);
}

export async function saveOrder(order: Order): Promise<void> {
  await pool.query(
    `INSERT INTO orders (id, symbol, side, type, price, quantity, filled, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET filled=$7, status=$8`,
    [order.id, order.symbol, order.side, order.type, order.price, order.quantity, order.filled, order.status, order.createdAt]
  );
}

export async function saveTrade(trade: Trade): Promise<void> {
  await pool.query(
    `INSERT INTO trades (id, symbol, price, quantity, buy_order_id, sell_order_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [trade.id, trade.symbol, trade.price, trade.quantity, trade.buyOrderId, trade.sellOrderId, trade.createdAt]
  );
}

export async function getOrderHistory(symbol?: string): Promise<Order[]> {
  const res = symbol
    ? await pool.query('SELECT * FROM orders WHERE symbol=$1 ORDER BY created_at DESC LIMIT 100', [symbol])
    : await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100');
  return res.rows.map(rowToOrder);
}

export async function getTradeHistory(symbol?: string): Promise<Trade[]> {
  const res = symbol
    ? await pool.query('SELECT * FROM trades WHERE symbol=$1 ORDER BY created_at DESC LIMIT 100', [symbol])
    : await pool.query('SELECT * FROM trades ORDER BY created_at DESC LIMIT 100');
  return res.rows.map(rowToTrade);
}

function rowToOrder(r: Record<string, unknown>): Order {
  return {
    id: r.id as string,
    symbol: r.symbol as string,
    side: r.side as Order['side'],
    type: r.type as Order['type'],
    price: Number(r.price),
    quantity: Number(r.quantity),
    filled: Number(r.filled),
    status: r.status as Order['status'],
    createdAt: Number(r.created_at),
  };
}

function rowToTrade(r: Record<string, unknown>): Trade {
  return {
    id: r.id as string,
    symbol: r.symbol as string,
    price: Number(r.price),
    quantity: Number(r.quantity),
    buyOrderId: r.buy_order_id as string,
    sellOrderId: r.sell_order_id as string,
    createdAt: Number(r.created_at),
  };
}
