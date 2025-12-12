import { z } from "zod";

export const CreateOrderSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["limit", "market"]),
  price: z.number().nonnegative(),
  quantity: z.number().positive(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
