import { describe, it, expect } from "vitest";
import { OrderBook } from "../src/engine/orderBook.js";
import type { Order } from "../src/models/order.js";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: Math.random().toString(36).slice(2),
    symbol: "BTC/USD",
    side: "buy",
    type: "limit",
    price: 100,
    quantity: 10,
    filled: 0,
    status: "pending",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("OrderBook", () => {
  it("adds buy order to bids when no match", () => {
    const book = new OrderBook("BTC/USD");
    const order = makeOrder({ side: "buy", price: 100 });
    const trades = book.addOrder(order);
    expect(trades).toHaveLength(0);
    expect(book.getBids()).toHaveLength(1);
  });

  it("adds sell order to asks when no match", () => {
    const book = new OrderBook("BTC/USD");
    const order = makeOrder({ side: "sell", price: 110 });
    const trades = book.addOrder(order);
    expect(trades).toHaveLength(0);
    expect(book.getAsks()).toHaveLength(1);
  });

  it("matches crossing buy against existing sell", () => {
    const book = new OrderBook("BTC/USD");
    book.addOrder(makeOrder({ side: "sell", price: 100, quantity: 5 }));
    const trades = book.addOrder(
      makeOrder({ side: "buy", price: 100, quantity: 5 })
    );
    expect(trades).toHaveLength(1);
    expect(trades[0].quantity).toBe(5);
    expect(book.getAsks()).toHaveLength(0);
    expect(book.getBids()).toHaveLength(0);
  });

  it("partial fill leaves remainder on book", () => {
    const book = new OrderBook("BTC/USD");
    book.addOrder(makeOrder({ side: "sell", price: 100, quantity: 3 }));
    const buyOrder = makeOrder({ side: "buy", price: 100, quantity: 5 });
    const trades = book.addOrder(buyOrder);
    expect(trades).toHaveLength(1);
    expect(trades[0].quantity).toBe(3);
    expect(buyOrder.filled).toBe(3);
    expect(book.getBids()).toHaveLength(1);
    expect(book.getBids()[0].quantity - book.getBids()[0].filled).toBe(2);
  });

  it("market order sweeps liquidity", () => {
    const book = new OrderBook("BTC/USD");
    book.addOrder(makeOrder({ side: "sell", price: 100, quantity: 2 }));
    book.addOrder(makeOrder({ side: "sell", price: 101, quantity: 3 }));
    const mkt = makeOrder({
      side: "buy",
      type: "market",
      price: 0,
      quantity: 4,
    });
    const trades = book.addOrder(mkt);
    expect(trades).toHaveLength(2);
    expect(mkt.filled).toBe(4);
  });

  it("cancels order", () => {
    const book = new OrderBook("BTC/USD");
    const order = makeOrder({ side: "buy", price: 100 });
    book.addOrder(order);
    expect(book.cancelOrder(order.id)).toBe(true);
    expect(book.getBids()).toHaveLength(0);
  });
});
