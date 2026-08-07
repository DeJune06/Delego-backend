/** Escrow event reconciliation worker contracts */
import type { PaymentRecordStatus } from "../escrowCoordinator/types.js";

export type OnChainEscrowStatus = "funded" | "released" | "refunded" | "disputed" | "not_found";

export interface ReconciliationDiscrepancy {
  paymentId: string;
  orderId: string;
  escrowId: string;
  dbStatus: PaymentRecordStatus;
  onChainStatus: OnChainEscrowStatus;
  discrepancyType: "status_mismatch" | "missing_escrow_id";
  resolvedAt?: string;
}

export interface ReconciliationResult {
  totalChecked: number;
  discrepancies: ReconciliationDiscrepancy[];
  resolved: number;
  failed: number;
  startedAt: string;
  durationMs: number;
}

/** Minimal shape of a payment record the worker needs to reconcile. */
export interface ReconcilablePaymentRecord {
  id: string;
  orderId: string;
  escrowId: string | null;
  escrowContractId: string;
  buyerAddress: string;
  status: PaymentRecordStatus;
}

/** Source of payment records pending reconciliation. Backed by Postgres in production. */
export interface PaymentRecordSource {
  findReconcilable(): Promise<ReconcilablePaymentRecord[]>;
  updateStatus(id: string, status: PaymentRecordStatus, expectedCurrentStatus: PaymentRecordStatus): Promise<boolean>;
}

/** Source of canonical on-chain escrow state. Backed by Soroban RPC in production. */
export interface OnChainEscrowSource {
  getStatus(escrowContractId: string, escrowId: string, sourceAddress: string): Promise<OnChainEscrowStatus>;
}

export interface ReconciliationWorkerOptions {
  intervalMs?: number;
  onCycleComplete?: (result: ReconciliationResult) => void;
  onError?: (error: Error) => void;
}
