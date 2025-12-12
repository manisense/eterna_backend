import type { Order, Trade } from "../models/index.js";
import { v4 as uuid } from "uuid";

/**
 * In-memory order book for a single symbol.
 * Buy side: max-heap by price, then FIFO.
 * Sell side: min-heap by price, then FIFO.
 */
export class OrderBook {
  public readonly symbol: string;
  private buys: Order[] = []; // sorted: highest price first
  private sells: Order[] = []; // sorted: lowest price first

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  /** Add order and attempt matching; returns generated trades. */
  addOrder(order: Order): Trade[] {
    const trades: Trade[] = [];

    if (order.side === "buy") {
      this.matchBuy(order, trades);
      if (order.quantity > order.filled && order.type === "limit") {
        this.insertBuy(order);
      }
    } else {
      this.matchSell(order, trades);
      if (order.quantity > order.filled && order.type === "limit") {
        this.insertSell(order);
      }
    }

    this.updateStatus(order);
    return trades;
  }

  cancelOrder(orderId: string): boolean {
    let idx = this.buys.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      this.buys[idx].status = "cancelled";
      this.buys.splice(idx, 1);
      return true;
    }
    idx = this.sells.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      this.sells[idx].status = "cancelled";
      this.sells.splice(idx, 1);
      return true;
    }
    return false;
  }

  getBids(): Order[] {
    return [...this.buys];
  }

  getAsks(): Order[] {
    return [...this.sells];
  }

  /* ───────── Private helpers ───────── */

  private matchBuy(order: Order, trades: Trade[]): void {
    while (
      order.filled < order.quantity &&
      this.sells.length > 0 &&
      (order.type === "market" || order.price >= this.sells[0].price)
    ) {
      const best = this.sells[0];
      const qty = Math.min(
        order.quantity - order.filled,
        best.quantity - best.filled
      );
      order.filled += qty;
      best.filled += qty;
      trades.push(
        this.createTrade(order.symbol, best.price, qty, order.id, best.id)
      );
      this.updateStatus(best);
      if (best.filled >= best.quantity) this.sells.shift();
    }
  }

  private matchSell(order: Order, trades: Trade[]): void {
    while (
      order.filled < order.quantity &&
      this.buys.length > 0 &&
      (order.type === "market" || order.price <= this.buys[0].price)
    ) {
      const best = this.buys[0];
      const qty = Math.min(
        order.quantity - order.filled,
        best.quantity - best.filled
      );
      order.filled += qty;
      best.filled += qty;
      trades.push(
        this.createTrade(order.symbol, best.price, qty, best.id, order.id)
      );
      this.updateStatus(best);
      if (best.filled >= best.quantity) this.buys.shift();
    }
  }

  private insertBuy(order: Order): void {
    // descending by price, then FIFO (ascending createdAt)
    const idx = this.buys.findIndex(
      (o) =>
        o.price < order.price ||
        (o.price === order.price && o.createdAt > order.createdAt)
    );
    if (idx === -1) this.buys.push(order);
    else this.buys.splice(idx, 0, order);
  }

  private insertSell(order: Order): void {
    // ascending by price, then FIFO
    const idx = this.sells.findIndex(
      (o) =>
        o.price > order.price ||
        (o.price === order.price && o.createdAt > order.createdAt)
    );
    if (idx === -1) this.sells.push(order);
    else this.sells.splice(idx, 0, order);
  }

  private updateStatus(order: Order): void {
    if (order.filled >= order.quantity) order.status = "filled";
    else if (order.filled > 0) order.status = "partial";
  }

  private createTrade(
    symbol: string,
    price: number,
    quantity: number,
    buyOrderId: string,
    sellOrderId: string
  ): Trade {
    return {
      id: uuid(),
      symbol,
      price,
      quantity,
      buyOrderId,
      sellOrderId,
      createdAt: Date.now(),
    };
  }
}
