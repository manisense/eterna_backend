export type Side = "buy" | "sell";
export type OrderType = "limit" | "market";
export type OrderStatus = "pending" | "partial" | "filled" | "cancelled";

export interface Order {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  price: number; // 0 for market orders
  quantity: number;
  filled: number;
  status: OrderStatus;
  createdAt: number; // epoch ms
}

export interface Trade {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  buyOrderId: string;
  sellOrderId: string;
  createdAt: number;
}
