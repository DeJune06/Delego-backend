import { getRedisClient } from "./redisClient.js";
import { getRateLimitConfig } from "./config.js";
import type { RateLimitConfig, RateLimitResult } from "./types.js";

function buildKey(
  identifier: string,
  endpoint: string,
  windowMs: number,
): string {
  const windowKey = Math.floor(Date.now() / windowMs);
  return `ratelimit:${identifier}:${endpoint}:${windowKey}`;
}

export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  overrideConfig?: RateLimitConfig,
): Promise<RateLimitResult> {
  const [method = "*", path = "*"] = endpoint.split(":", 2) as [string, string];
  const config = overrideConfig ?? getRateLimitConfig(method, path);

  const { maxRequests, windowMs } = config;
  const key = buildKey(identifier, endpoint, windowMs);

  const redis = getRedisClient();

  const pipeline = redis.multi();
  pipeline.incr(key);
  pipeline.expire(key, Math.ceil(windowMs / 1000));

  const results = await pipeline.exec();

  const count = (results?.[0]?.[1] as number) ?? 1;
  const allowed = count <= maxRequests;
  const remaining = Math.max(0, maxRequests - count);

  const windowEndMs =
    (Math.floor(Date.now() / windowMs) + 1) * windowMs;
  const resetInSeconds = Math.ceil((windowEndMs - Date.now()) / 1000);

  return {
    allowed,
    limit: maxRequests,
    remaining,
    resetInSeconds,
    identifier,
  };
}
