/**
 * Escrow Auto-Settlement on Delivery Confirmation (Issue #363)
 *
 * Listens for delivery-confirmed webhook events (e.g. from a logistics
 * partner) and automatically releases the matching escrow to the seller.
 *
 * Duplicate webhook deliveries are handled idempotently via a processed-event
 * store, and releases are rejected with a typed error when the escrow has
 * already been settled.
 */

import { createLogger } from "@delego/utils";
import { escrowCoordinator } from "../src/escrowCoordinator/index.js";
import type { ReleaseResult } from "../src/escrowCoordinator/types.js";

const log = createLogger("payments:escrow:auto-settlement", process.env.LOG_LEVEL ?? "info");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeliveryConfirmationWebhook {
  /** Unique id for this webhook delivery — used for idempotency. */
  webhookId: string;
  orderId: string;
  escrowId: string;
  escrowContractId: string;
  /** Address authorized to trigger the on-chain release call. */
  callerAddress: string;
  confirmedAt: string;
}

export interface AutoSettlementResult {
  webhookId: string;
  orderId: string;
  escrowId: string;
  status: "released" | "duplicate" | "already_settled" | "failed";
  release?: ReleaseResult;
  reason?: string;
}

export class EscrowAlreadySettledError extends Error {
  constructor(escrowId: string) {
    super(`Escrow ${escrowId} is already settled`);
    this.name = "EscrowAlreadySettledError";
  }
}

// ---------------------------------------------------------------------------
// Idempotency store — dedupes duplicate webhook deliveries by webhookId
// ---------------------------------------------------------------------------

export interface ProcessedWebhookStore {
  has(webhookId: string): Promise<boolean>;
  markProcessed(webhookId: string): Promise<void>;
}

export class InMemoryProcessedWebhookStore implements ProcessedWebhookStore {
  private readonly processed = new Set<string>();

  async has(webhookId: string): Promise<boolean> {
    return this.processed.has(webhookId);
  }

  async markProcessed(webhookId: string): Promise<void> {
    this.processed.add(webhookId);
  }
}

let processedWebhookStore: ProcessedWebhookStore = new InMemoryProcessedWebhookStore();

/** Swap the backing store for a DB/Redis-backed implementation in production. */
export function setProcessedWebhookStore(store: ProcessedWebhookStore): void {
  processedWebhookStore = store;
}

export function resetProcessedWebhookStore(): void {
  processedWebhookStore = new InMemoryProcessedWebhookStore();
}

// ---------------------------------------------------------------------------
// Auto-settlement handler
// ---------------------------------------------------------------------------

/**
 * Handles a delivery-confirmation webhook by auto-releasing the escrow.
 *
 * - Duplicate webhooks (same `webhookId`) are skipped and reported as
 *   `"duplicate"` rather than re-triggering the release.
 * - Escrows already released are reported as `"already_settled"` and do not
 *   attempt a second on-chain call.
 */
export async function handleDeliveryConfirmationWebhook(
  webhook: DeliveryConfirmationWebhook
): Promise<AutoSettlementResult> {
  const { webhookId, orderId, escrowId, escrowContractId, callerAddress } = webhook;

  if (await processedWebhookStore.has(webhookId)) {
    log.info("Duplicate delivery confirmation webhook skipped", { webhookId, orderId, escrowId });
    return { webhookId, orderId, escrowId, status: "duplicate" };
  }

  try {
    const status = await escrowCoordinator.getEscrowStatus(escrowId).catch(() => null);
    if (status && status.status === "released") {
      await processedWebhookStore.markProcessed(webhookId);
      log.warn("Auto-settlement skipped: escrow already settled", { webhookId, orderId, escrowId });
      return {
        webhookId,
        orderId,
        escrowId,
        status: "already_settled",
        reason: new EscrowAlreadySettledError(escrowId).message,
      };
    }

    log.info("Auto-releasing escrow on delivery confirmation", { webhookId, orderId, escrowId });

    const release = await escrowCoordinator.releaseEscrow({
      escrowId,
      escrowContractId,
      callerAddress,
    });

    await processedWebhookStore.markProcessed(webhookId);

    if (release.status !== "released") {
      log.error("Auto-settlement release failed", { webhookId, orderId, escrowId });
      return { webhookId, orderId, escrowId, status: "failed", release, reason: "Release transaction failed" };
    }

    log.info("Auto-settlement completed", { webhookId, orderId, escrowId, txHash: release.txHash });
    return { webhookId, orderId, escrowId, status: "released", release };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown auto-settlement error";
    log.error("Auto-settlement failed", { webhookId, orderId, escrowId, error: message });
    return { webhookId, orderId, escrowId, status: "failed", reason: message };
  }
}
