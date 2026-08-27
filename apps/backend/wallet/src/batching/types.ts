/**
 * Transaction Batching for Gas Optimization — shared types
 * Issue #42
 */

export interface BatchTransactionItem {
  sourceAddress: string;
  contractId: string;
  method: string;
  args: unknown[];
  memo: string;
  userId: string;
}

export type BatchPriority = "normal" | "high";

export interface BatchTransactionRequest {
  transactions: BatchTransactionItem[];
  priority: BatchPriority;
}

export type BatchStatus =
  "queued" | "processing" | "completed" | "partial_failure";

export interface BatchTransactionResponse {
  batchId: string;
  status: BatchStatus;
  submittedAt: string; // ISO 8601
  estimatedCompletion: string; // ISO 8601
}

export interface BatchItemResult {
  userId: string;
  success: boolean;
  hash: string | null;
  error: string | null;
  ledger: number | null;
}

export interface BatchTransactionResult {
  batchId: string;
  transactionHash: string | null;
  results: BatchItemResult[];
  gasUsed: string; // stroops
  gasSaved: string; // stroops
  status: BatchStatus;
  completedAt: string | null;
}
