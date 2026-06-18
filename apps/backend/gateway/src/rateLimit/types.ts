/**
 * Rate limiting type definitions.
 * @see AGENTS.md — Acceptance Criteria → Types
 */

/** Configuration for a single rate limit rule */
export interface RateLimitConfig {
  /** Requests allowed per window */
  maxRequests: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/** Result returned after checking a rate limit */
export interface RateLimitResult {
  allowed: boolean;
  /** Total requests allowed in window */
  limit: number;
  /** Requests remaining in current window */
  remaining: number;
  /** Seconds until the window resets */
  resetInSeconds: number;
}
