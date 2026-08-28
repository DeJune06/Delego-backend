/**
 * @delegolabs/wallet — Entry point
 * TODO: Implement service logic
 */
import { createLogger } from "@delegolabs/utils";
import { startHttpServer } from "@delegolabs/utils";
import {
  SorobanTransactionSimulator,
  readSorobanRpcConfig,
} from "./sorobanSimulator.js";

const SERVICE_NAME = "wallet";
const DEFAULT_PORT = 3012;

const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.WALLET_PORT ?? DEFAULT_PORT);

const sorobanConfig = readSorobanRpcConfig();
log.info("Starting service", {
  port,
  nodeEnv,
  sorobanRpcTimeoutMs: sorobanConfig.timeoutMs,
  sorobanRpcMaxRetries: sorobanConfig.maxRetries,
});

export const sorobanSimulator = new SorobanTransactionSimulator(sorobanConfig);

import { registerRoutes } from "./routes.js";
import { startWebSocketServer, stopWebSocketServer } from "./websocket/server.js";
import { startBatchFlushTimers, stopBatchFlushTimers } from "./batching/batchQueue.js";
import { closeQueue } from "./queue/txQueue.js";

const server = startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: registerRoutes(),
});

// Issue #41: Start WebSocket server on port 3013
startWebSocketServer();

// Issue #42: Start background batch flush timers
startBatchFlushTimers();

// ─── Graceful Shutdown ─────────────────────────────────────────────────────

async function gracefulShutdown(signal: NodeJS.Signals): Promise<void> {
  log.info("Received shutdown signal", { signal });

  // Stop accepting new connections
  server.close(() => {
    log.info("HTTP server closed");
  });

  // Drain batch flush timers
  try {
    stopBatchFlushTimers();
    log.info("Batch flush timers stopped");
  } catch (err) {
    log.error("Error stopping batch flush timers", { error: (err as Error).message });
  }

  // Close WebSocket server
  try {
    await stopWebSocketServer();
    log.info("WebSocket server closed");
  } catch (err) {
    log.error("Error stopping WebSocket server", { error: (err as Error).message });
  }

  // Drain BullMQ queue and close Redis
  try {
    await closeQueue();
    log.info("Transaction queue closed");
  } catch (err) {
    log.error("Error closing transaction queue", { error: (err as Error).message });
  }

  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void gracefulShutdown(signal);
  });
}

// TODO: Wire routes, database, and domain logic
