import { OrderBook } from './orderBook.js';
import type { Order, Trade } from '../models/index.js';

/**
 * MatchingEngine manages multiple order books (one per symbol).
 */
export class MatchingEngine {
  private books = new Map<string, OrderBook>();

  private getOrCreateBook(symbol: string): OrderBook {
    let book = this.books.get(symbol);
    if (!book) {
      book = new OrderBook(symbol);
      this.books.set(symbol, book);
    }
    return book;
  }

  submit(order: Order): Trade[] {
    const book = this.getOrCreateBook(order.symbol);
    return book.addOrder(order);
  }

  cancel(symbol: string, orderId: string): boolean {
    const book = this.books.get(symbol);
    if (!book) return false;
    return book.cancelOrder(orderId);
  }

  getBook(symbol: string): OrderBook | undefined {
    return this.books.get(symbol);
  }
}
