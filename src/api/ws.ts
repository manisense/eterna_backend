import { FastifyInstance, FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import type { Trade } from "../models/index.js";
import type { WebSocket } from "ws";

const clients = new Set<WebSocket>();

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get(
    "/ws",
    { websocket: true },
    (socket: WebSocket, _req: FastifyRequest) => {
      clients.add(socket);
      socket.on("close", () => clients.delete(socket));
    }
  );
}

export function broadcastTrades(trades: Trade[]): void {
  const msg = JSON.stringify({ type: "trades", data: trades });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}
