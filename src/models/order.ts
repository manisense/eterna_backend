export type Side = "buy" | "sell";
export type OrderType = "limit" | "market";
export type OrderStatus =
  | "pending" // Order received and queued
  | "routing" // Comparing DEX prices
  | "building" // Creating transaction
  | "submitted" // Transaction sent to network
  | "confirmed" // Transaction successful
  | "partial" // Partially filled (for order book mode)
  | "filled" // Fully executed
  | "cancelled" // Order cancelled
  | "failed"; // Execution failed

export type DexType = "raydium" | "meteora" | "none";

export interface Order {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  price: number; // 0 for market orders, max price for limit orders in DEX mode
  quantity: number;
  filled: number;
  status: OrderStatus;
  createdAt: number; // epoch ms

  // DEX execution fields (optional for backward compatibility)
  tokenMintIn?: string; // Input token mint address
  tokenMintOut?: string; // Output token mint address
  slippageBps?: number; // Slippage tolerance in basis points (100 = 1%)
  txSignature?: string; // Solana transaction signature
  dexUsed?: DexType; // Which DEX executed the order
  executedPrice?: number; // Actual execution price
  executedAmount?: number; // Actual output amount received
  failureReason?: string; // Reason for failure if status is "failed"
  retryCount?: number; // Number of retry attempts
}

export interface Trade {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  buyOrderId: string;
  sellOrderId: string;
  createdAt: number;

  // DEX execution fields (optional)
  txSignature?: string;
  dexUsed?: DexType;
}

// DEX execution order input
export interface DexOrderInput {
  tokenMintIn: string;
  tokenMintOut: string;
  amountIn: number;
  slippageBps?: number; // Default: 100 (1%)
  maxPrice?: number; // For limit orders
  type: OrderType;
}
