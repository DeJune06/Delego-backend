/**
 * Rate limiting middleware for the gateway.
 *
 * Integrates with the node:http request lifecycle used by @delego/utils
 * startHttpServer.
 *
 * @see AGENTS.md — Functions to Implement → rateLimitMiddleware
 *
 * Response headers (on every request):
 *   X-RateLimit-Limit
 *   X-RateLimit-Remaining
 *   X-RateLimit-Reset
 *
 * 429 Response Body:
 *   { error, message, retryAfter }
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { checkRateLimit } from "../src/rateLimit/rateLimiter.js";
import { extractAuth } from "./auth.js";
import type { RateLimitConfig } from "../src/rateLimit/types.js";

/**
 * Derive the client identifier from the request.
 *
 * Authenticated users are keyed by userId; anonymous requests fall back
 * to the client IP address.
 */
function getIdentifier(req: IncomingMessage): string {
  const auth = extractAuth(req);
  if (auth.userId) {
    return auth.userId;
  }

  // x-forwarded-for may be a comma-separated list; take the first entry
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }

  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Build the endpoint key from the HTTP method and URL path.
 *
 * Example: "POST:/api/v1/auth/login"
 */
function getEndpoint(req: IncomingMessage): string {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  return `${method}:${url.pathname}`;
}

/**
 * Express-compatible middleware factory that checks and enforces rate limits.
 * Returns 429 Too Many Requests with Retry-After and X-RateLimit-* headers when exceeded.
 *
 * @param config - Optional override configuration. If omitted, matching rules are looked up automatically.
 */
export function rateLimitMiddleware(config?: RateLimitConfig) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: any) => void
  ): Promise<void> => {
    try {
      const identifier = getIdentifier(req);
      const endpoint = getEndpoint(req);

      const result = await checkRateLimit(identifier, endpoint, config);

      // Calculate absolute reset timestamp (epoch seconds) for the header
      const resetTimestamp = Math.floor(Date.now() / 1000) + result.resetInSeconds;

      // Set rate-limit headers on every response
      res.setHeader("X-RateLimit-Limit", result.limit);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", resetTimestamp);

      if (!result.allowed) {
        res.setHeader("Retry-After", result.resetInSeconds);
        json(res, 429, {
          error: "Too Many Requests",
          message: `Rate limit exceeded. Please retry after ${result.resetInSeconds} seconds.`,
          retryAfter: result.resetInSeconds,
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
