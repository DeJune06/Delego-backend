import type { Route } from "@delego/utils";
import { route } from "@delego/utils";
import { healthHandler } from "./health.js";
import { apiV1Handler } from "./api-v1.js";
import { registerHandler, loginHandler } from "./auth.js";

/** Register all gateway routes */
export function registerRoutes(): Route[] {
  return [
    route("GET", "/health", healthHandler),
    route("GET", "/api/v1/status", apiV1Handler),
    route("POST", "/api/v1/auth/register", registerHandler),
    route("POST", "/api/v1/auth/login", loginHandler),
    // TODO: Add delegation, order, wallet proxy routes
  ];
}

