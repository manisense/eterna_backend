import { FastifyInstance, FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import type { Trade, Order } from "../models/index.js";
import type WebSocket from "ws";

// All connected WebSocket clients
const clients = new Set<WebSocket>();

// Order-specific subscriptions: orderId -> Set of WebSocket clients
const orderSubscriptions = new Map<string, Set<WebSocket>>();

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  // General WebSocket endpoint for trade broadcasts
  app.get(
    "/ws",
    { websocket: true },
    (socket: WebSocket, _req: FastifyRequest) => {
      clients.add(socket);
      socket.on("close", () => {
        clients.delete(socket);
        // Clean up order subscriptions for this client
        for (const [orderId, subs] of orderSubscriptions) {
          subs.delete(socket);
          if (subs.size === 0) {
            orderSubscriptions.delete(orderId);
          }
        }
      });

      // Handle incoming messages for order subscriptions
      socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === "subscribe" && message.orderId) {
            subscribeToOrder(message.orderId, socket);
            socket.send(
              JSON.stringify({
                type: "subscribed",
                orderId: message.orderId,
              })
            );
          } else if (message.type === "unsubscribe" && message.orderId) {
            unsubscribeFromOrder(message.orderId, socket);
            socket.send(
              JSON.stringify({
                type: "unsubscribed",
                orderId: message.orderId,
              })
            );
          }
        } catch {
          // Ignore invalid JSON
        }
      });
    }
  );

  // Order-specific WebSocket endpoint with orderId in path
  app.get(
    "/ws/orders/:orderId",
    { websocket: true },
    (socket: WebSocket, req: FastifyRequest) => {
      const { orderId } = req.params as { orderId: string };

      clients.add(socket);
      subscribeToOrder(orderId, socket);

      // Send subscription confirmation
      socket.send(
        JSON.stringify({
          type: "subscribed",
          orderId,
          message: "You will receive status updates for this order",
        })
      );

      socket.on("close", () => {
        clients.delete(socket);
        unsubscribeFromOrder(orderId, socket);
      });
    }
  );
}

/**
 * Subscribe a WebSocket client to order updates
 */
function subscribeToOrder(orderId: string, socket: WebSocket): void {
  if (!orderSubscriptions.has(orderId)) {
    orderSubscriptions.set(orderId, new Set());
  }
  orderSubscriptions.get(orderId)!.add(socket);
}

/**
 * Unsubscribe a WebSocket client from order updates
 */
function unsubscribeFromOrder(orderId: string, socket: WebSocket): void {
  const subs = orderSubscriptions.get(orderId);
  if (subs) {
    subs.delete(socket);
    if (subs.size === 0) {
      orderSubscriptions.delete(orderId);
    }
  }
}

/**
 * Broadcast trades to all connected clients
 */
export function broadcastTrades(trades: Trade[]): void {
  const msg = JSON.stringify({ type: "trades", data: trades });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

/**
 * Send order status update to subscribed clients
 * Status flow: pending → routing → building → submitted → confirmed/failed
 */
export function sendOrderStatusUpdate(
  orderId: string,
  status: Order["status"],
  data?: Partial<Order>
): void {
  const message = JSON.stringify({
    type: "orderStatus",
    orderId,
    status,
    timestamp: Date.now(),
    ...data,
  });

  // Send to clients subscribed to this specific order
  const subscribers = orderSubscriptions.get(orderId);
  if (subscribers) {
    for (const ws of subscribers) {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    }
  }

  // Also broadcast to all clients (they can filter by orderId)
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      // Don't double-send to subscribers
      if (!subscribers?.has(ws)) {
        ws.send(message);
      }
    }
  }

  console.log(`[WS] Order ${orderId} status: ${status}`);
}

/**
 * Send order execution complete notification
 */
export function sendOrderComplete(
  orderId: string,
  txSignature: string,
  executedPrice: number,
  executedAmount: number,
  dex: string
): void {
  const message = JSON.stringify({
    type: "orderComplete",
    orderId,
    txSignature,
    executedPrice,
    executedAmount,
    dex,
    timestamp: Date.now(),
    explorerUrl: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
  });

  // Send to all clients (both subscribers and general clients)
  const allRecipients = new Set([
    ...(orderSubscriptions.get(orderId) || []),
    ...clients,
  ]);

  for (const ws of allRecipients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }

  console.log(`[WS] Order ${orderId} complete - TX: ${txSignature}`);
}

/**
 * Send order failure notification
 */
export function sendOrderFailed(
  orderId: string,
  error: string,
  retryCount: number
): void {
  const message = JSON.stringify({
    type: "orderFailed",
    orderId,
    error,
    retryCount,
    timestamp: Date.now(),
  });

  const allRecipients = new Set([
    ...(orderSubscriptions.get(orderId) || []),
    ...clients,
  ]);

  for (const ws of allRecipients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }

  console.log(`[WS] Order ${orderId} failed: ${error}`);
}

/**
 * Get count of connected clients
 */
export function getConnectedClientCount(): number {
  return clients.size;
}

/**
 * Get count of active order subscriptions
 */
export function getOrderSubscriptionCount(): number {
  return orderSubscriptions.size;
}
