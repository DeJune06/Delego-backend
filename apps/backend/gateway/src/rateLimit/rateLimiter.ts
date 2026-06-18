/**
 * Core rate-limiting logic using Redis sliding windows.
 * @see AGENTS.md — Functions to Implement → checkRateLimit
 *
 * Redis key structure:
 *   ratelimit:{identifier}:{endpoint}:{window_key}
 *
 * Uses MULTI/EXEC for atomicity of INCR + EXPIRE.
 */

import { getRedisClient } from "./redisClient.js";
import { getRateLimitConfig } from "./config.js";
import type { RateLimitConfig, RateLimitResult } from "./types.js";

/**
 * Build the Redis key for a rate limit window.
 *
 * @param identifier - Authenticated userId or client IP
 * @param endpoint   - METHOD:/path (e.g. "POST:/api/v1/auth/login")
 * @param windowSeconds - Window size for the key bucket
 */
function buildKey(
  identifier: string,
  endpoint: string,
  windowSeconds: number,
): string {
  const windowKey = Math.floor(Date.now() / (windowSeconds * 1000));
  return `ratelimit:${identifier}:${endpoint}:${windowKey}`;
}

/**
 * Check (and increment) the rate limit for the given identifier + endpoint.
 *
 * @returns A {@link RateLimitResult} indicating whether the request is allowed
 *          and providing limit/remaining/reset metadata.
 */
export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  overrideConfig?: RateLimitConfig,
): Promise<RateLimitResult> {
  // Determine the method and path from the endpoint string
  const [method = "*", path = "*"] = endpoint.split(":", 2) as [string, string];
  const config = overrideConfig ?? getRateLimitConfig(method, path);

  const { maxRequests, windowSeconds } = config;
  const key = buildKey(identifier, endpoint, windowSeconds);

  const redis = getRedisClient();

  // Atomic INCR + conditional EXPIRE
  const pipeline = redis.multi();
  pipeline.incr(key);
  pipeline.expire(key, windowSeconds);

  const results = await pipeline.exec();

  // results[0] = [err | null, count]
  const count = (results?.[0]?.[1] as number) ?? 1;
  const allowed = count <= maxRequests;
  const remaining = Math.max(0, maxRequests - count);

  // Calculate seconds until the current window expires
  const currentWindowStart =
    Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000;
  const windowEndMs = currentWindowStart + windowSeconds * 1000;
  const resetInSeconds = Math.ceil((windowEndMs - Date.now()) / 1000);

  return {
    allowed,
    limit: maxRequests,
    remaining,
    resetInSeconds,
  };
}
