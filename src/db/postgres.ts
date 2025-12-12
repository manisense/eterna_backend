import { Pool } from "pg";
import type { Order, Trade } from "../models/index.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initDb(): Promise<void> {
  // Create tables
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
      created_at BIGINT NOT NULL,
      -- DEX execution fields
      token_mint_in VARCHAR(44),
      token_mint_out VARCHAR(44),
      slippage_bps INTEGER,
      tx_signature VARCHAR(128),
      dex_used VARCHAR(16),
      executed_price NUMERIC,
      executed_amount NUMERIC,
      failure_reason TEXT,
      retry_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS trades (
      id UUID PRIMARY KEY,
      symbol VARCHAR(32) NOT NULL,
      price NUMERIC NOT NULL,
      quantity NUMERIC NOT NULL,
      buy_order_id UUID NOT NULL,
      sell_order_id UUID NOT NULL,
      created_at BIGINT NOT NULL,
      tx_signature VARCHAR(128),
      dex_used VARCHAR(16)
    );
  `);

  // Add new columns to existing tables (if they don't exist)
  // This handles migrations for existing databases
  const alterStatements = [
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS token_mint_in VARCHAR(44)",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS token_mint_out VARCHAR(44)",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS slippage_bps INTEGER",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS tx_signature VARCHAR(128)",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS dex_used VARCHAR(16)",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS executed_price NUMERIC",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS executed_amount NUMERIC",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS failure_reason TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0",
    "ALTER TABLE trades ADD COLUMN IF NOT EXISTS tx_signature VARCHAR(128)",
    "ALTER TABLE trades ADD COLUMN IF NOT EXISTS dex_used VARCHAR(16)",
  ];

  for (const stmt of alterStatements) {
    try {
      await pool.query(stmt);
    } catch {
      // Ignore errors (column may already exist in older PostgreSQL versions)
    }
  }
}

export async function saveOrder(order: Order): Promise<void> {
  await pool.query(
    `INSERT INTO orders (
      id, symbol, side, type, price, quantity, filled, status, created_at,
      token_mint_in, token_mint_out, slippage_bps, tx_signature, dex_used,
      executed_price, executed_amount, failure_reason, retry_count
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT (id) DO UPDATE SET 
      filled = EXCLUDED.filled, 
      status = EXCLUDED.status,
      tx_signature = COALESCE(EXCLUDED.tx_signature, orders.tx_signature),
      dex_used = COALESCE(EXCLUDED.dex_used, orders.dex_used),
      executed_price = COALESCE(EXCLUDED.executed_price, orders.executed_price),
      executed_amount = COALESCE(EXCLUDED.executed_amount, orders.executed_amount),
      failure_reason = COALESCE(EXCLUDED.failure_reason, orders.failure_reason),
      retry_count = COALESCE(EXCLUDED.retry_count, orders.retry_count)`,
    [
      order.id,
      order.symbol,
      order.side,
      order.type,
      order.price,
      order.quantity,
      order.filled,
      order.status,
      order.createdAt,
      order.tokenMintIn || null,
      order.tokenMintOut || null,
      order.slippageBps || null,
      order.txSignature || null,
      order.dexUsed || null,
      order.executedPrice || null,
      order.executedAmount || null,
      order.failureReason || null,
      order.retryCount || 0,
    ]
  );
}

export async function saveTrade(trade: Trade): Promise<void> {
  await pool.query(
    `INSERT INTO trades (id, symbol, price, quantity, buy_order_id, sell_order_id, created_at, tx_signature, dex_used)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      trade.id,
      trade.symbol,
      trade.price,
      trade.quantity,
      trade.buyOrderId,
      trade.sellOrderId,
      trade.createdAt,
      trade.txSignature || null,
      trade.dexUsed || null,
    ]
  );
}

export async function getOrderHistory(symbol?: string): Promise<Order[]> {
  const res = symbol
    ? await pool.query(
        "SELECT * FROM orders WHERE symbol=$1 ORDER BY created_at DESC LIMIT 100",
        [symbol]
      )
    : await pool.query(
        "SELECT * FROM orders ORDER BY created_at DESC LIMIT 100"
      );
  return res.rows.map(rowToOrder);
}

export async function getTradeHistory(symbol?: string): Promise<Trade[]> {
  const res = symbol
    ? await pool.query(
        "SELECT * FROM trades WHERE symbol=$1 ORDER BY created_at DESC LIMIT 100",
        [symbol]
      )
    : await pool.query(
        "SELECT * FROM trades ORDER BY created_at DESC LIMIT 100"
      );
  return res.rows.map(rowToTrade);
}

/**
 * Get a single order by ID
 */
export async function getOrder(orderId: string): Promise<Order | null> {
  const res = await pool.query("SELECT * FROM orders WHERE id = $1", [orderId]);
  if (res.rows.length === 0) return null;
  return rowToOrder(res.rows[0]);
}

/**
 * Update order with partial data
 */
export async function updateOrder(
  orderId: string,
  updates: Partial<Order>
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  // Map of field names to column names
  const fieldMap: Record<string, string> = {
    status: "status",
    filled: "filled",
    txSignature: "tx_signature",
    dexUsed: "dex_used",
    executedPrice: "executed_price",
    executedAmount: "executed_amount",
    failureReason: "failure_reason",
    retryCount: "retry_count",
  };

  for (const [field, column] of Object.entries(fieldMap)) {
    if (field in updates && updates[field as keyof Order] !== undefined) {
      setClauses.push(`${column} = $${paramIndex}`);
      values.push(updates[field as keyof Order]);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) return;

  values.push(orderId);
  const query = `UPDATE orders SET ${setClauses.join(
    ", "
  )} WHERE id = $${paramIndex}`;
  await pool.query(query, values);
}

function rowToOrder(r: Record<string, unknown>): Order {
  return {
    id: r.id as string,
    symbol: r.symbol as string,
    side: r.side as Order["side"],
    type: r.type as Order["type"],
    price: Number(r.price),
    quantity: Number(r.quantity),
    filled: Number(r.filled),
    status: r.status as Order["status"],
    createdAt: Number(r.created_at),
    // DEX execution fields
    tokenMintIn: r.token_mint_in as string | undefined,
    tokenMintOut: r.token_mint_out as string | undefined,
    slippageBps: r.slippage_bps ? Number(r.slippage_bps) : undefined,
    txSignature: r.tx_signature as string | undefined,
    dexUsed: r.dex_used as Order["dexUsed"],
    executedPrice: r.executed_price ? Number(r.executed_price) : undefined,
    executedAmount: r.executed_amount ? Number(r.executed_amount) : undefined,
    failureReason: r.failure_reason as string | undefined,
    retryCount: r.retry_count ? Number(r.retry_count) : undefined,
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
    txSignature: r.tx_signature as string | undefined,
    dexUsed: r.dex_used as Trade["dexUsed"],
  };
}
