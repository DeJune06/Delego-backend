/** A delegation grants an AI agent scoped authority to act on behalf of a user */

export type DelegationStatus =
  | "pending"
  | "active"
  | "paused"
  | "revoked"
  | "expired";

export interface SpendingPolicy {
  /** Max per-transaction amount in stroops */
  maxPerTransaction: bigint;
  /** Max cumulative spend in stroops for this delegation */
  maxTotal: bigint;
  /** Allowed merchant IDs; empty = all */
  allowedMerchants: string[];
  /** ISO 8601 expiry */
  expiresAt: string | null;
}

export interface Delegation {
  id: string;
  userId: string;
  agentId: string;
  status: DelegationStatus;
  policy: SpendingPolicy;
  createdAt: Date;
  updatedAt: Date;
}
