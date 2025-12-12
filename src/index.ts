import Fastify from 'fastify';
import { MatchingEngine } from './engine/index.js';
import { registerRoutes, registerWebSocket, broadcastTrades } from './api/index.js';
import { initDb, saveTrade } from './db/index.js';
import { startOrderWorker } from './queue/index.js';

async function main() {
  const app = Fastify({ logger: true });
  const engine = new MatchingEngine();

  // Initialize DB tables
  await initDb();

  // Register REST and WebSocket routes
  await registerRoutes(app, engine);
  await registerWebSocket(app);

  // Start BullMQ worker
  startOrderWorker(engine, async (trades) => {
    for (const t of trades) await saveTrade(t);
    broadcastTrades(trades);
  });

  const port = Number(process.env.PORT) || 3000;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Server listening on http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
