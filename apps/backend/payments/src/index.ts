/**
 * @delego/payments — Entry point
 */
import { createLogger } from "@delego/utils";
import { startHttpServer } from "@delego/utils";
import { registerRoutes } from "./routes.js";

const SERVICE_NAME = "payments";
const DEFAULT_PORT = 3014;

const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.PAYMENTS_PORT ?? DEFAULT_PORT);

log.info("Starting service", { port, nodeEnv });

startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: registerRoutes(),
});
