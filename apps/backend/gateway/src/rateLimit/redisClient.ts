/**
 * Redis client singleton for the rate limiter.
 *
 * Uses ioredis for robust Redis interaction including pipelining
 * and MULTI/EXEC support required by the rate limiter.
 * Falls back to ioredis-mock during unit tests.
 */

import { Redis } from "ioredis";
// @ts-ignore
import MockRedis from "ioredis-mock";
import { createLogger } from "@delego/utils";

const log = createLogger("gateway:redis", process.env.LOG_LEVEL ?? "info");

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let redis: Redis | null = null;

/** Get or create the singleton Redis client */
export function getRedisClient(): Redis {
  if (!redis) {
    const isTest = process.env.NODE_ENV === "test";
    const useMock = isTest || process.env.MOCK_REDIS === "true";

    if (useMock) {
      log.info("Using mock Redis connection for rate limiting");
      const MockRedisConstructor = MockRedis as any;
      redis = new MockRedisConstructor();
    } else {
      log.info("Connecting to real Redis for rate limiting", { url: REDIS_URL });
      redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times: number): number | null {
          if (times > 5) {
            log.error("Redis connection failed after 5 retries — giving up");
            return null; // stop retrying
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: false,
      });

      redis.on("connect", () => log.info("Redis connected", { url: REDIS_URL }));
      redis.on("error", (err: any) =>
        log.error("Redis error", { error: err.message })
      );
    }
  }
  return redis!;
}

/** Gracefully close the Redis connection */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    log.info("Redis disconnected");
  }
}
