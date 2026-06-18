/**
 * @delego/notifications — Entry point
 * TODO: Implement service logic
 */
import { createLogger } from "@delego/utils";
import { startHttpServer } from "@delego/utils";

const SERVICE_NAME = "notifications";
const DEFAULT_PORT = 3015;

const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.NOTIFICATIONS_PORT ?? DEFAULT_PORT);

log.info("Starting service", { port, nodeEnv });

startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: [],
});

// TODO: Wire routes, database, and domain logic
