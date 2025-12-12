import { z } from "zod";

// Original order book schema (for backward compatibility)
export const CreateOrderSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["limit", "market"]),
  price: z.number().nonnegative(),
  quantity: z.number().positive(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// DEX execution order schema
export const ExecuteOrderSchema = z
  .object({
    tokenMintIn: z.string().min(32).max(44), // Solana public key
    tokenMintOut: z.string().min(32).max(44),
    amountIn: z.number().positive(),
    slippageBps: z.number().int().min(1).max(5000).default(100), // 0.01% to 50%
    type: z.enum(["limit", "market"]),
    maxPrice: z.number().positive().optional(), // Required for limit orders
  })
  .refine((data) => data.type !== "limit" || data.maxPrice !== undefined, {
    message: "maxPrice is required for limit orders",
    path: ["maxPrice"],
  });

export type ExecuteOrderInput = z.infer<typeof ExecuteOrderSchema>;

// Order status query schema
export const OrderStatusSchema = z.object({
  orderId: z.string().uuid(),
});

export type OrderStatusInput = z.infer<typeof OrderStatusSchema>;

// Pagination schema
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;
