import { Pool, type QueryResultRow } from "pg";
import { createLogger } from "@delego/utils";

const log = createLogger(
  "payments:soroban-ledger:store",
  process.env.LOG_LEVEL ?? "info"
);

export type SorobanTransactionStatus = "PENDING" | "CONFIRMED" | "FAILED";

export interface SorobanTransactionLedgerRecord {
  hash: string;
  orderId: string | null;
  contractId: string;
  method: string;
  status: SorobanTransactionStatus;
  errorDetails: string | null;
  submittedAt: Date;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecordSubmissionInput {
  hash: string;
  orderId?: string;
  contractId: string;
  method: string;
  submittedAt?: Date;
}

export interface UpdateStatusInput {
  hash: string;
  status: SorobanTransactionStatus;
  errorDetails?: string;
  confirmedAt?: Date;
}

export enum SorobanLedgerErrorCode {
  DATABASE_UNAVAILABLE = "SOROBAN_LEDGER_DATABASE_UNAVAILABLE",
  INVALID_INPUT = "SOROBAN_LEDGER_INVALID_INPUT",
  NOT_FOUND = "SOROBAN_LEDGER_NOT_FOUND",
  INVALID_TRANSITION = "SOROBAN_LEDGER_INVALID_TRANSITION",
}

export class SorobanLedgerError extends Error {
  public readonly code: SorobanLedgerErrorCode;
  public readonly cause?: unknown;

  constructor(
    code: SorobanLedgerErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = "SorobanLedgerError";
    this.code = code;
    this.cause = cause;
  }
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl =
      process.env.DATABASE_URL ??
      "postgresql://delego:delego@localhost:5432/delego";
    pool = new Pool({ connectionString: databaseUrl });
  }
  return pool;
}

export function _setPoolForTesting(testPool: Pool): void {
  pool = testPool;
}

export function _resetPoolForTesting(): void {
  pool = null;
}

interface SorobanTransactionLedgerRow extends QueryResultRow {
  hash: string;
  order_id: string | null;
  contract_id: string;
  method: string;
  status: string;
  error_details: string | null;
  submitted_at: Date;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: SorobanTransactionLedgerRow): SorobanTransactionLedgerRecord {
  return {
    hash: row.hash,
    orderId: row.order_id,
    contractId: row.contract_id,
    method: row.method,
    status: row.status as SorobanTransactionStatus,
    errorDetails: row.error_details,
    submittedAt: row.submitted_at,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateHash(hash: string): void {
  if (!hash || typeof hash !== "string") {
    throw new SorobanLedgerError(
      SorobanLedgerErrorCode.INVALID_INPUT,
      "Transaction hash is required"
    );
  }
  if (hash.length > 64) {
    throw new SorobanLedgerError(
      SorobanLedgerErrorCode.INVALID_INPUT,
      "Transaction hash exceeds maximum length of 64 characters"
    );
  }
}

function validateContractId(contractId: string): void {
  if (!contractId || typeof contractId !== "string") {
    throw new SorobanLedgerError(
      SorobanLedgerErrorCode.INVALID_INPUT,
      "Contract ID is required"
    );
  }
}

function validateMethod(method: string): void {
  if (!method || typeof method !== "string") {
    throw new SorobanLedgerError(
      SorobanLedgerErrorCode.INVALID_INPUT,
      "Method is required"
    );
  }
}

function isValidStatus(status: string): status is SorobanTransactionStatus {
  return status === "PENDING" || status === "CONFIRMED" || status === "FAILED";
}

function wrapDbError(cause: unknown, context: string): SorobanLedgerError {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (
    cause instanceof Error &&
    (cause.name === "ConnectionError" ||
      cause.message.includes("ECONNREFUSED") ||
      cause.message.includes("connect") ||
      cause.message.includes("timeout"))
  ) {
    return new SorobanLedgerError(
      SorobanLedgerErrorCode.DATABASE_UNAVAILABLE,
      `Database unavailable during ${context}: ${message}`,
      cause
    );
  }
  return new SorobanLedgerError(
    SorobanLedgerErrorCode.DATABASE_UNAVAILABLE,
    `Database error during ${context}: ${message}`,
    cause
  );
}

export async function recordSubmission(
  input: RecordSubmissionInput
): Promise<SorobanTransactionLedgerRecord> {
  validateHash(input.hash);
  validateContractId(input.contractId);
  validateMethod(input.method);

  const submittedAt = input.submittedAt ?? new Date();

  try {
    const { rows } = await getPool().query<SorobanTransactionLedgerRow>(
      `INSERT INTO soroban_transaction_ledger (
         hash,
         order_id,
         contract_id,
         method,
         status,
         submitted_at
       )
       VALUES ($1, $2, $3, $4, 'PENDING', $5)
       ON CONFLICT (hash) DO UPDATE SET
         updated_at = NOW()
       RETURNING *`,
      [
        input.hash,
        input.orderId ?? null,
        input.contractId,
        input.method,
        submittedAt,
      ]
    );

    const record = mapRow(rows[0]);
    log.debug("Soroban transaction submission recorded", {
      hash: record.hash,
      orderId: record.orderId,
      contractId: record.contractId,
      method: record.method,
      status: record.status,
    });
    return record;
  } catch (err) {
    throw wrapDbError(err, "recording transaction submission");
  }
}

export async function updateTransactionStatus(
  input: UpdateStatusInput
): Promise<SorobanTransactionLedgerRecord> {
  validateHash(input.hash);
  if (!isValidStatus(input.status)) {
    throw new SorobanLedgerError(
      SorobanLedgerErrorCode.INVALID_INPUT,
      `Invalid status: ${input.status}. Must be PENDING, CONFIRMED, or FAILED`
    );
  }

  try {
    const { rows } = await getPool().query<SorobanTransactionLedgerRow>(
      `UPDATE soroban_transaction_ledger
       SET status = $1,
           error_details = COALESCE($2, error_details),
           confirmed_at = COALESCE($3, confirmed_at),
           updated_at = NOW()
       WHERE hash = $4
       RETURNING *`,
      [
        input.status,
        input.errorDetails ?? null,
        input.confirmedAt ?? null,
        input.hash,
      ]
    );

    if (!rows[0]) {
      throw new SorobanLedgerError(
        SorobanLedgerErrorCode.NOT_FOUND,
        `Transaction not found for hash: ${input.hash}`
      );
    }

    const record = mapRow(rows[0]);
    log.debug("Soroban transaction status updated", {
      hash: record.hash,
      status: record.status,
      errorDetails: record.errorDetails,
    });
    return record;
  } catch (err) {
    if (err instanceof SorobanLedgerError) throw err;
    throw wrapDbError(err, "updating transaction status");
  }
}

export async function recordSubmissionIdempotent(
  input: RecordSubmissionInput
): Promise<{ record: SorobanTransactionLedgerRecord; created: boolean }> {
  validateHash(input.hash);
  validateContractId(input.contractId);
  validateMethod(input.method);

  const submittedAt = input.submittedAt ?? new Date();

  try {
    const existing = await findByHash(input.hash);
    if (existing) {
      log.debug("Soroban transaction already exists, returning existing record", {
        hash: input.hash,
        status: existing.status,
      });
      return { record: existing, created: false };
    }

    const record = await recordSubmission({ ...input, submittedAt });
    return { record, created: true };
  } catch (err) {
    if (err instanceof SorobanLedgerError) throw err;
    throw wrapDbError(err, "idempotently recording transaction submission");
  }
}

export async function updateStatusIdempotent(
  input: UpdateStatusInput
): Promise<{ record: SorobanTransactionLedgerRecord; updated: boolean }> {
  validateHash(input.hash);
  if (!isValidStatus(input.status)) {
    throw new SorobanLedgerError(
      SorobanLedgerErrorCode.INVALID_INPUT,
      `Invalid status: ${input.status}. Must be PENDING, CONFIRMED, or FAILED`
    );
  }

  try {
    const existing = await findByHash(input.hash);
    if (!existing) {
      throw new SorobanLedgerError(
        SorobanLedgerErrorCode.NOT_FOUND,
        `Transaction not found for hash: ${input.hash}`
      );
    }

    const isAlreadyTerminal =
      existing.status === "CONFIRMED" || existing.status === "FAILED";
    const isSameStatus = existing.status === input.status;

    if (isAlreadyTerminal && isSameStatus) {
      log.debug("Soroban transaction already in terminal state, no update needed", {
        hash: input.hash,
        status: existing.status,
      });
      return { record: existing, updated: false };
    }

    if (isAlreadyTerminal && !isSameStatus) {
      throw new SorobanLedgerError(
        SorobanLedgerErrorCode.INVALID_TRANSITION,
        `Cannot transition from ${existing.status} to ${input.status} for hash ${input.hash}`
      );
    }

    const record = await updateTransactionStatus(input);
    return { record, updated: true };
  } catch (err) {
    if (err instanceof SorobanLedgerError) throw err;
    throw wrapDbError(err, "idempotently updating transaction status");
  }
}

export async function findByHash(
  hash: string
): Promise<SorobanTransactionLedgerRecord | null> {
  validateHash(hash);

  try {
    const { rows } = await getPool().query<SorobanTransactionLedgerRow>(
      `SELECT *
       FROM soroban_transaction_ledger
       WHERE hash = $1
       LIMIT 1`,
      [hash]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    throw wrapDbError(err, "finding transaction by hash");
  }
}

export async function findByOrderId(
  orderId: string
): Promise<SorobanTransactionLedgerRecord[]> {
  if (!orderId || typeof orderId !== "string") {
    throw new SorobanLedgerError(
      SorobanLedgerErrorCode.INVALID_INPUT,
      "Order ID is required"
    );
  }

  try {
    const { rows } = await getPool().query<SorobanTransactionLedgerRow>(
      `SELECT *
       FROM soroban_transaction_ledger
       WHERE order_id = $1
       ORDER BY submitted_at DESC`,
      [orderId]
    );
    return rows.map(mapRow);
  } catch (err) {
    throw wrapDbError(err, "finding transactions by order ID");
  }
}

export async function listPendingTransactions(
  limit = 100
): Promise<SorobanTransactionLedgerRecord[]> {
  if (limit <= 0 || !Number.isFinite(limit)) {
    throw new SorobanLedgerError(
      SorobanLedgerErrorCode.INVALID_INPUT,
      "Limit must be a positive integer"
    );
  }

  try {
    const { rows } = await getPool().query<SorobanTransactionLedgerRow>(
      `SELECT *
       FROM soroban_transaction_ledger
       WHERE status = 'PENDING'
       ORDER BY submitted_at ASC
       LIMIT $1`,
      [limit]
    );
    return rows.map(mapRow);
  } catch (err) {
    throw wrapDbError(err, "listing pending transactions");
  }
}

export async function confirmTransaction(
  hash: string,
  confirmedAt?: Date
): Promise<SorobanTransactionLedgerRecord> {
  return updateTransactionStatus({
    hash,
    status: "CONFIRMED",
    confirmedAt: confirmedAt ?? new Date(),
  });
}

export async function failTransaction(
  hash: string,
  errorDetails: string
): Promise<SorobanTransactionLedgerRecord> {
  if (!errorDetails || typeof errorDetails !== "string") {
    throw new SorobanLedgerError(
      SorobanLedgerErrorCode.INVALID_INPUT,
      "Error details are required when marking a transaction as FAILED"
    );
  }
  return updateTransactionStatus({
    hash,
    status: "FAILED",
    errorDetails,
  });
}
