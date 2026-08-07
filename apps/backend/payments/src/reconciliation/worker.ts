/**
 * Escrow Event Reconciliation Worker
 * Periodically compares payment_records against canonical on-chain escrow
 * state to catch discrepancies caused by missed or dropped contract events.
 */
import { createLogger } from "@delego/utils";
import { Pool } from "pg";
import {
  getContractReadSourceAddress,
  mapChainEscrowStatus,
  readEscrowFromChain,
} from "../escrowCoordinator/contractClient.js";
import type { PaymentRecordStatus } from "../escrowCoordinator/types.js";
import type {
  OnChainEscrowSource,
  OnChainEscrowStatus,
  PaymentRecordSource,
  ReconcilablePaymentRecord,
  ReconciliationDiscrepancy,
  ReconciliationResult,
  ReconciliationWorkerOptions,
} from "./types.js";

const log = createLogger("payments:reconciliation-worker", process.env.LOG_LEVEL ?? "info");

const DEFAULT_INTERVAL_MS = Number(process.env.RECONCILIATION_INTERVAL_SECONDS ?? 300) * 1000;

/** Postgres-backed payment record source used in production. */
export class PostgresPaymentRecordSource implements PaymentRecordSource {
  constructor(private readonly pool: Pool) {}

  async findReconcilable(): Promise<ReconcilablePaymentRecord[]> {
    const { rows } = await this.pool.query<{
      id: string;
      order_id: string;
      escrow_id: string | null;
      escrow_contract_id: string;
      buyer_address: string;
      status: string;
    }>(
      `SELECT id, order_id, escrow_id, escrow_contract_id, buyer_address, status
       FROM payment_records
       WHERE status NOT IN ('released', 'refunded', 'failed')
       ORDER BY updated_at ASC`
    );

    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      escrowId: row.escrow_id,
      escrowContractId: row.escrow_contract_id,
      buyerAddress: row.buyer_address,
      status: row.status as PaymentRecordStatus,
    }));
  }

  async updateStatus(
    id: string,
    status: PaymentRecordStatus,
    expectedCurrentStatus: PaymentRecordStatus
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE payment_records
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND status = $3`,
      [status, id, expectedCurrentStatus]
    );
    return rowCount === 1;
  }
}

/** Soroban-backed on-chain escrow source used in production. */
export class SorobanEscrowSource implements OnChainEscrowSource {
  async getStatus(
    escrowContractId: string,
    escrowId: string,
    sourceAddress: string
  ): Promise<OnChainEscrowStatus> {
    try {
      const record = await readEscrowFromChain(escrowContractId, escrowId, sourceAddress);
      return mapChainEscrowStatus(record.status);
    } catch (err) {
      log.warn("Failed to read on-chain escrow status", {
        escrowId,
        error: (err as Error).message,
      });
      return "not_found";
    }
  }
}

/**
 * Determines whether the recorded database status diverges from the
 * canonical on-chain status, and if so, what the correct resolved status is.
 */
export function detectDiscrepancy(
  dbStatus: PaymentRecordStatus,
  onChainStatus: OnChainEscrowStatus
): ReconciliationDiscrepancy["discrepancyType"] | null {
  if (onChainStatus === "not_found") return null;
  if (dbStatus === onChainStatus) return null;

  // Terminal on-chain states always win over non-terminal DB states.
  if (
    (onChainStatus === "released" || onChainStatus === "refunded" || onChainStatus === "disputed") &&
    dbStatus !== onChainStatus
  ) {
    return "status_mismatch";
  }

  // DB claims a terminal state on-chain disagrees with — on-chain is canonical.
  if ((dbStatus === "released" || dbStatus === "refunded") && onChainStatus === "funded") {
    return "status_mismatch";
  }

  return null;
}

/** Maps on-chain status to the payment record status it should resolve to. */
function resolvedStatusFor(onChainStatus: OnChainEscrowStatus): PaymentRecordStatus | null {
  switch (onChainStatus) {
    case "funded":
    case "released":
    case "refunded":
    case "disputed":
      return onChainStatus;
    default:
      return null;
  }
}

async function resolveDiscrepancy(
  store: PaymentRecordSource,
  discrepancy: ReconciliationDiscrepancy
): Promise<boolean> {
  const targetStatus = resolvedStatusFor(discrepancy.onChainStatus);
  if (!targetStatus) return false;

  try {
    const updated = await store.updateStatus(discrepancy.paymentId, targetStatus, discrepancy.dbStatus);
    if (updated) {
      discrepancy.resolvedAt = new Date().toISOString();
      log.info("Reconciliation discrepancy resolved", {
        paymentId: discrepancy.paymentId,
        from: discrepancy.dbStatus,
        to: targetStatus,
      });
    } else {
      log.warn("Reconciliation discrepancy resolution skipped; record changed concurrently", {
        paymentId: discrepancy.paymentId,
      });
    }
    return updated;
  } catch (err) {
    log.error("Error resolving reconciliation discrepancy", {
      paymentId: discrepancy.paymentId,
      error: (err as Error).message,
    });
    return false;
  }
}

/** Runs a single reconciliation pass over all reconcilable payment records. */
export async function runReconciliationCycle(
  recordSource: PaymentRecordSource,
  escrowSource: OnChainEscrowSource
): Promise<ReconciliationResult> {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const discrepancies: ReconciliationDiscrepancy[] = [];
  let resolved = 0;
  let failed = 0;

  log.info("Starting escrow reconciliation cycle");

  const records = await recordSource.findReconcilable();

  for (const record of records) {
    if (!record.escrowId) {
      discrepancies.push({
        paymentId: record.id,
        orderId: record.orderId,
        escrowId: "",
        dbStatus: record.status,
        onChainStatus: "not_found",
        discrepancyType: "missing_escrow_id",
      });
      continue;
    }

    try {
      const sourceAddress = getContractReadSourceAddress(record.buyerAddress);
      const onChainStatus = await escrowSource.getStatus(
        record.escrowContractId,
        record.escrowId,
        sourceAddress
      );

      const discrepancyType = detectDiscrepancy(record.status, onChainStatus);
      if (!discrepancyType) continue;

      const discrepancy: ReconciliationDiscrepancy = {
        paymentId: record.id,
        orderId: record.orderId,
        escrowId: record.escrowId,
        dbStatus: record.status,
        onChainStatus,
        discrepancyType,
      };
      discrepancies.push(discrepancy);

      const wasResolved = await resolveDiscrepancy(recordSource, discrepancy);
      if (wasResolved) {
        resolved++;
      } else {
        failed++;
      }
    } catch (err) {
      log.error("Error reconciling payment record", {
        paymentId: record.id,
        error: (err as Error).message,
      });
      failed++;
    }
  }

  const result: ReconciliationResult = {
    totalChecked: records.length,
    discrepancies,
    resolved,
    failed,
    startedAt,
    durationMs: Date.now() - start,
  };

  log.info("Escrow reconciliation cycle completed", {
    totalChecked: result.totalChecked,
    discrepancyCount: discrepancies.length,
    resolved,
    failed,
    durationMs: result.durationMs,
  });

  return result;
}

let sharedPool: Pool | null = null;

function getSharedPool(): Pool {
  if (!sharedPool) {
    const databaseUrl =
      process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";
    sharedPool = new Pool({ connectionString: databaseUrl });
  }
  return sharedPool;
}

/**
 * Starts the periodic reconciliation worker. Interval is configurable via
 * `RECONCILIATION_INTERVAL_SECONDS` or the `intervalMs` option.
 */
export function startReconciliationWorker(options: ReconciliationWorkerOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const recordSource = new PostgresPaymentRecordSource(getSharedPool());
  const escrowSource = new SorobanEscrowSource();

  const runCycle = () => {
    runReconciliationCycle(recordSource, escrowSource)
      .then((result) => options.onCycleComplete?.(result))
      .catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error("Unhandled error in reconciliation worker cycle", { error: error.message });
        options.onError?.(error);
      });
  };

  const intervalId = setInterval(runCycle, intervalMs);
  log.info("Escrow reconciliation worker started", { intervalMs });

  return () => {
    clearInterval(intervalId);
    log.info("Escrow reconciliation worker stopped");
  };
}
