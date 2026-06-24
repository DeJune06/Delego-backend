/** Higher-level policy definition for a rate limit tier — not yet consumed,
 *  reserved for future per-endpoint policy configuration. */
export interface RateLimitPolicy {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  redisClient?: any;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetInSeconds: number;
  identifier: string;
}
