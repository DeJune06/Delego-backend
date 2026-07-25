/**
 * Payment Event Publisher — Issue #205
 *
 * Defines the canonical `PaymentEvent<T>` shape that every route, worker,
 * and settlement path must use when emitting payment lifecycle events.
 *
 * The `publishPaymentEvent` helper serialises the event to a Redis stream
 * (or an in-process fallback in test environments) so that every downstream
 * consumer — analytics, notifications, audit logs — can subscribe from one
 * place.
 *
 * Also provides the idempotent Soroban Transaction Ledger tracking service
 * that persists submission states (PENDING / CONFIRMED / FAILED) to the
 * `soroban_transaction_ledger` table for reconciliation and retry loops.
 */

import { createRequire } from "node:module";
import { createLogger } from "@delego/utils";
import {
  InMemoryProcessedContractEventStore,
  processEscrowContractEvent,
  type EscrowContractEvent,
  type ProcessedContractEventStore,
} from "./dedup-store.js";
import {
  confirmTransaction as dbConfirmTransaction,
  failTransaction as dbFailTransaction,
  findByHash as dbFindByHash,
  findByOrderId as dbFindByOrderId,
  listPendingTransactions as dbListPending,
  recordSubmissionIdempotent as dbRecordSubmission,
  updateStatusIdempotent as dbUpdateStatus,
  SorobanLedgerError,
  SorobanLedgerErrorCode,
  type SorobanTransactionLedgerRecord,
  type SorobanTransactionStatus,
} from "../src/escrowCoordinator/sorobanTransactionLedgerStore.js";

const log = createLogger("payments:events", process.env.LOG_LEVEL ?? "info");

// ---------------------------------------------------------------------------
// Legacy narrow event types (kept for backward-compat)
// ---------------------------------------------------------------------------

export type PaymentEventType =
  | "escrow_created"
  | "escrow_released"
  | "escrow_refunded"
  | "settlement_complete";

// ---------------------------------------------------------------------------
// Issue #205 – Generic PaymentEvent<T>
// ---------------------------------------------------------------------------

/**
 * Canonical shape for all payment lifecycle events.
 *
 * @template T – the type of the event-specific `payload`.
 *
 * @property type        – domain event name, e.g. `"escrow_released"`
 * @property orderId     – the order this event belongs to (always required)
 * @property paymentId   – optional payment / transaction identifier
 * @property payload     – event-specific data (strongly typed by `T`)
 * @property occurredAt  – ISO-8601 timestamp of when the event occurred
 */
export interface PaymentEvent<T = unknown> {
  type: string;
  orderId: string;
  paymentId?: string;
  payload: T;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Redis stream key
// ---------------------------------------------------------------------------

const STREAM_KEY = "payments:events";

let processedEventStore: ProcessedContractEventStore =
  new InMemoryProcessedContractEventStore();

/** Swap the backing store for a DB-backed implementation in production. */
export function setProcessedContractEventStore(store: ProcessedContractEventStore): void {
  processedEventStore = store;
}

export function resetProcessedContractEventStore(): void {
  processedEventStore = new InMemoryProcessedContractEventStore();
}

// ---------------------------------------------------------------------------
// Internal: lazy Redis client factory
// ---------------------------------------------------------------------------

type RedisLike = {
  xadd(
    key: string,
    id: string,
    ...fieldValues: string[]
  ): Promise<string | null>;
};

let _redis: RedisLike | null = null;

/** Lightweight in-process stub used in test / mock mode. */
function makeInMemoryRedis(): RedisLike {
  const store: Array<{ id: string; fields: Record<string, string> }> = [];
  return {
    async xadd(_key: string, _id: string, ...fieldValues: string[]) {
      const fields: Record<string, string> = {};
      for (let i = 0; i < fieldValues.length; i += 2) {
        fields[fieldValues[i]] = fieldValues[i + 1];
      }
      const id = `${Date.now()}-${store.length}`;
      store.push({ id, fields });
      return id;
    },
  };
}

function getRedisClient(): RedisLike {
  if (_redis) return _redis;

  const isTest = process.env.NODE_ENV === "test";
  const useMock = isTest || process.env.MOCK_REDIS === "true" || process.env.CI === "true";

  if (useMock) {
    log.info("Using in-memory Redis stub for payment events");
    _redis = makeInMemoryRedis();
  } else {
    // Use createRequire so this ESM module can load CommonJS ioredis safely.
    // ioredis ships a CJS build; a bare `import` from NodeNext ESM would need
    // an explicit `.js` interop shim.  createRequire is the standard solution.
    const _require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Redis } = _require("ioredis") as any;
    _redis = new Redis(
      process.env.REDIS_URL ?? "redis://localhost:6379"
    ) as unknown as RedisLike;
  }

  return _redis!;
}

/** Override the Redis client — useful in tests. */
export function _setRedisClientForTesting(client: RedisLike): void {
  _redis = client;
}

/** Reset the Redis client — call in afterEach to isolate tests. */
export function _resetRedisClient(): void {
  _redis = null;
}

// ---------------------------------------------------------------------------
// publishPaymentEvent
// ---------------------------------------------------------------------------

/**
 * Publish a `PaymentEvent<T>` to the Redis stream `payments:events`.
 *
 * The event is serialised to a single `data` field so that consumers can
 * `JSON.parse` without knowing the individual field layout.
 *
 * On failure the error is logged and re-thrown so callers can decide whether
 * to retry or fall back to a dead-letter queue.
 */
export async function publishPaymentEvent<T = unknown>(
  event: PaymentEvent<T>
): Promise<void> {
  const redis = getRedisClient();
  const serialised = JSON.stringify(event);

  try {
    const id = await redis.xadd(STREAM_KEY, "*", "data", serialised);
    log.info("Payment event published", {
      streamId: id,
      type: event.type,
      orderId: event.orderId,
      paymentId: event.paymentId,
    });
  } catch (err) {
    log.error("Failed to publish payment event", {
      type: event.type,
      orderId: event.orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// emitPaymentEvent (legacy shim — wraps publishPaymentEvent)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `publishPaymentEvent` directly.  This shim exists to keep
 * existing call sites compiling without changes.  It is fire-and-forget and
 * never throws.
 */
export function emitPaymentEvent(event: {
  type: PaymentEventType;
  orderId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}): void {
  publishPaymentEvent<Record<string, unknown>>({
    type: event.type,
    orderId: event.orderId,
    payload: event.payload,
    occurredAt: event.timestamp,
  }).catch((err) =>
    log.error("emitPaymentEvent publish error", {
      error: err instanceof Error ? err.message : String(err),
    })
  );
}

/**
 * Handles on-chain escrow contract events with deduplication.
 * Duplicate blockchain deliveries are skipped after the first successful process.
 *
 * Backed by `processed_contract_events` (see database/migrations/004_processed_contract_events.sql).
 */
export async function handleEscrowContractEvent(
  event: EscrowContractEvent,
  onProcess: (paymentEvent: PaymentEvent<Record<string, unknown>>) => Promise<void> | void
): Promise<boolean> {
  return processEscrowContractEvent(
    event,
    async (contractEvent) => {
      await onProcess({
        type: contractEvent.type,
        orderId: String(contractEvent.payload.orderId ?? ""),
        payload: contractEvent.payload,
        occurredAt: new Date().toISOString(),
      });
    },
    processedEventStore
  );
}

export {
  deriveContractEventId,
  InMemoryProcessedContractEventStore,
  processEscrowContractEvent,
  type EscrowContractEvent,
  type ProcessedContractEventStore,
} from "./dedup-store.js";

// ===========================================================================
// Soroban Transaction Ledger Tracking Service
// ===========================================================================

export type {
  SorobanTransactionLedgerRecord,
  SorobanTransactionStatus,
} from "../src/escrowCoordinator/sorobanTransactionLedgerStore.js";
export {
  SorobanLedgerError,
  SorobanLedgerErrorCode,
} from "../src/escrowCoordinator/sorobanTransactionLedgerStore.js";

export interface SorobanTransactionSubmissionInput {
  hash: string;
  orderId?: string;
  contractId: string;
  method: string;
  submittedAt?: Date;
}

export interface SorobanLedgerStore {
  recordSubmission(
    input: SorobanTransactionSubmissionInput
  ): Promise<{ record: SorobanTransactionLedgerRecord; created: boolean }>;
  updateStatus(
    input: {
      hash: string;
      status: SorobanTransactionStatus;
      errorDetails?: string;
      confirmedAt?: Date;
    }
  ): Promise<{ record: SorobanTransactionLedgerRecord; updated: boolean }>;
  findByHash(hash: string): Promise<SorobanTransactionLedgerRecord | null>;
  findByOrderId(orderId: string): Promise<SorobanTransactionLedgerRecord[]>;
  listPending(limit?: number): Promise<SorobanTransactionLedgerRecord[]>;
  confirm(
    hash: string,
    confirmedAt?: Date
  ): Promise<SorobanTransactionLedgerRecord>;
  fail(
    hash: string,
    errorDetails: string
  ): Promise<SorobanTransactionLedgerRecord>;
}

class PostgresSorobanLedgerStore implements SorobanLedgerStore {
  async recordSubmission(input: SorobanTransactionSubmissionInput) {
    return dbRecordSubmission(input);
  }

  async updateStatus(input: {
    hash: string;
    status: SorobanTransactionStatus;
    errorDetails?: string;
    confirmedAt?: Date;
  }) {
    return dbUpdateStatus(input);
  }

  async findByHash(hash: string) {
    return dbFindByHash(hash);
  }

  async findByOrderId(orderId: string) {
    return dbFindByOrderId(orderId);
  }

  async listPending(limit = 100) {
    return dbListPending(limit);
  }

  async confirm(hash: string, confirmedAt?: Date) {
    return dbConfirmTransaction(hash, confirmedAt);
  }

  async fail(hash: string, errorDetails: string) {
    return dbFailTransaction(hash, errorDetails);
  }
}

export class InMemorySorobanLedgerStore implements SorobanLedgerStore {
  private readonly records = new Map<string, SorobanTransactionLedgerRecord>();

  private now(): Date {
    return new Date();
  }

  async recordSubmission(input: SorobanTransactionSubmissionInput) {
    const existing = this.records.get(input.hash);
    if (existing) {
      const updated: SorobanTransactionLedgerRecord = {
        ...existing,
        updatedAt: this.now(),
      };
      this.records.set(input.hash, updated);
      return { record: updated, created: false };
    }

    const submittedAt = input.submittedAt ?? this.now();
    const record: SorobanTransactionLedgerRecord = {
      hash: input.hash,
      orderId: input.orderId ?? null,
      contractId: input.contractId,
      method: input.method,
      status: "PENDING",
      errorDetails: null,
      submittedAt,
      confirmedAt: null,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.records.set(input.hash, record);
    return { record, created: true };
  }

  async updateStatus(input: {
    hash: string;
    status: SorobanTransactionStatus;
    errorDetails?: string;
    confirmedAt?: Date;
  }) {
    const existing = this.records.get(input.hash);
    if (!existing) {
      throw new SorobanLedgerError(
        SorobanLedgerErrorCode.NOT_FOUND,
        `Transaction not found for hash: ${input.hash}`
      );
    }

    const isTerminal =
      existing.status === "CONFIRMED" || existing.status === "FAILED";
    if (isTerminal && existing.status === input.status) {
      return { record: existing, updated: false };
    }
    if (isTerminal && existing.status !== input.status) {
      throw new SorobanLedgerError(
        SorobanLedgerErrorCode.INVALID_TRANSITION,
        `Cannot transition from ${existing.status} to ${input.status}`
      );
    }

    const updated: SorobanTransactionLedgerRecord = {
      ...existing,
      status: input.status,
      errorDetails: input.errorDetails ?? existing.errorDetails,
      confirmedAt: input.confirmedAt ?? existing.confirmedAt,
      updatedAt: this.now(),
    };
    this.records.set(input.hash, updated);
    return { record: updated, updated: true };
  }

  async findByHash(hash: string) {
    return this.records.get(hash) ?? null;
  }

  async findByOrderId(orderId: string) {
    return Array.from(this.records.values())
      .filter((r) => r.orderId === orderId)
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
  }

  async listPending(limit = 100) {
    return Array.from(this.records.values())
      .filter((r) => r.status === "PENDING")
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
      .slice(0, limit);
  }

  async confirm(hash: string, confirmedAt?: Date) {
    const result = await this.updateStatus({
      hash,
      status: "CONFIRMED",
      confirmedAt: confirmedAt ?? this.now(),
    });
    return result.record;
  }

  async fail(hash: string, errorDetails: string) {
    const result = await this.updateStatus({
      hash,
      status: "FAILED",
      errorDetails,
    });
    return result.record;
  }
}

let sorobanLedgerStore: SorobanLedgerStore = new InMemorySorobanLedgerStore();

export function setSorobanLedgerStore(store: SorobanLedgerStore): void {
  sorobanLedgerStore = store;
}

export function resetSorobanLedgerStore(): void {
  sorobanLedgerStore = new InMemorySorobanLedgerStore();
}

export function enablePostgresSorobanLedgerStore(): void {
  sorobanLedgerStore = new PostgresSorobanLedgerStore();
  log.info("Soroban ledger store switched to PostgreSQL backend");
}

// ---------------------------------------------------------------------------
// High-level ledger tracking service functions
// ---------------------------------------------------------------------------

export async function recordSorobanTransactionSubmission(
  input: SorobanTransactionSubmissionInput
): Promise<{ record: SorobanTransactionLedgerRecord; created: boolean }> {
  try {
    const result = await sorobanLedgerStore.recordSubmission(input);
    log[result.created ? "info" : "debug"](
      "Soroban transaction submission recorded",
      {
        hash: input.hash,
        orderId: input.orderId,
        contractId: input.contractId,
        method: input.method,
        status: result.record.status,
        created: result.created,
      }
    );
    return result;
  } catch (err) {
    log.error("Failed to record Soroban transaction submission", {
      hash: input.hash,
      orderId: input.orderId,
      error: err instanceof Error ? err.message : String(err),
      code: (err as SorobanLedgerError)?.code,
    });
    throw err;
  }
}

export async function confirmSorobanTransaction(
  hash: string,
  confirmedAt?: Date
): Promise<SorobanTransactionLedgerRecord> {
  try {
    const record = await sorobanLedgerStore.confirm(hash, confirmedAt);
    log.info("Soroban transaction confirmed on-chain", {
      hash,
      confirmedAt: record.confirmedAt?.toISOString(),
    });
    return record;
  } catch (err) {
    log.error("Failed to confirm Soroban transaction", {
      hash,
      error: err instanceof Error ? err.message : String(err),
      code: (err as SorobanLedgerError)?.code,
    });
    throw err;
  }
}

export async function failSorobanTransaction(
  hash: string,
  errorDetails: string
): Promise<SorobanTransactionLedgerRecord> {
  try {
    const record = await sorobanLedgerStore.fail(hash, errorDetails);
    log.warn("Soroban transaction marked as FAILED", {
      hash,
      errorDetails,
    });
    return record;
  } catch (err) {
    log.error("Failed to mark Soroban transaction as failed", {
      hash,
      error: err instanceof Error ? err.message : String(err),
      code: (err as SorobanLedgerError)?.code,
    });
    throw err;
  }
}

export async function updateSorobanTransactionStatus(input: {
  hash: string;
  status: SorobanTransactionStatus;
  errorDetails?: string;
  confirmedAt?: Date;
}): Promise<{ record: SorobanTransactionLedgerRecord; updated: boolean }> {
  try {
    const result = await sorobanLedgerStore.updateStatus(input);
    log[result.updated ? "info" : "debug"](
      "Soroban transaction status update processed",
      {
        hash: input.hash,
        status: input.status,
        updated: result.updated,
      }
    );
    return result;
  } catch (err) {
    log.error("Failed to update Soroban transaction status", {
      hash: input.hash,
      status: input.status,
      error: err instanceof Error ? err.message : String(err),
      code: (err as SorobanLedgerError)?.code,
    });
    throw err;
  }
}

export async function getSorobanTransaction(
  hash: string
): Promise<SorobanTransactionLedgerRecord | null> {
  try {
    return await sorobanLedgerStore.findByHash(hash);
  } catch (err) {
    log.error("Failed to fetch Soroban transaction by hash", {
      hash,
      error: err instanceof Error ? err.message : String(err),
      code: (err as SorobanLedgerError)?.code,
    });
    throw err;
  }
}

export async function getSorobanTransactionsByOrderId(
  orderId: string
): Promise<SorobanTransactionLedgerRecord[]> {
  try {
    return await sorobanLedgerStore.findByOrderId(orderId);
  } catch (err) {
    log.error("Failed to fetch Soroban transactions by order ID", {
      orderId,
      error: err instanceof Error ? err.message : String(err),
      code: (err as SorobanLedgerError)?.code,
    });
    throw err;
  }
}

export async function listPendingSorobanTransactions(
  limit = 100
): Promise<SorobanTransactionLedgerRecord[]> {
  try {
    return await sorobanLedgerStore.listPending(limit);
  } catch (err) {
    log.error("Failed to list pending Soroban transactions", {
      error: err instanceof Error ? err.message : String(err),
      code: (err as SorobanLedgerError)?.code,
    });
    throw err;
  }
}
