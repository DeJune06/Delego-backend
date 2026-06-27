/**
 * @delego/orchestrator — Workflow coordination
 * #64 Purchase Recovery Engine — reconcileWorkflows compares DB state with on-chain escrow.
 */
import { createLogger, startHttpServer } from "@delego/utils";
import { Pool } from "pg";
import {
  createWorkflow,
  transitionWorkflow,
  getWorkflow,
  listWorkflows,
} from "../workflows/purchase/index.js";

const SERVICE_NAME = "orchestrator";
const DEFAULT_PORT = 3010;

const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.ORCHESTRATOR_PORT ?? DEFAULT_PORT);

log.info("Starting orchestrator", { port });

startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: [],
});

// ─── #64 Reconciliation Engine ───────────────────────────────────────────────

export interface ReconciliationFinding {
  orderId: string;
  workflowState: string;
  escrowStatus: string;
  recommendedAction: "resume" | "settle" | "refund" | "mark_failed" | "noop";
  reason: string;
}

function getPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

/**
 * Simulated on-chain escrow state lookup.
 * In production this would query the Soroban escrow contract via the wallet service.
 */
async function fetchOnChainEscrowStatus(escrowId: string): Promise<"funded" | "released" | "refunded" | "not_found"> {
  const walletUrl = process.env.WALLET_SERVICE_URL ?? "http://localhost:3012";
  try {
    const res = await fetch(`${walletUrl}/escrow/${encodeURIComponent(escrowId)}/status`);
    if (!res.ok) return "not_found";
    const body = await res.json() as { data?: { status?: string } };
    const status = body.data?.status;
    if (status === "released" || status === "refunded" || status === "funded") return status;
    return "not_found";
  } catch {
    return "not_found";
  }
}

function recommend(
  workflowState: string,
  escrowStatus: string
): { action: ReconciliationFinding["recommendedAction"]; reason: string } {
  // Terminal states — nothing to do
  if (workflowState === "COMPLETED" || workflowState === "CANCELLED") {
    return { action: "noop", reason: "Workflow is in terminal state" };
  }

  if (workflowState === "ESCROW_FUNDED" && escrowStatus === "released") {
    return { action: "settle", reason: "Escrow already released on-chain; advance to COMPLETED" };
  }
  if (workflowState === "ESCROW_FUNDED" && escrowStatus === "refunded") {
    return { action: "refund", reason: "Escrow refunded on-chain; cancel workflow" };
  }
  if ((workflowState === "APPROVED" || workflowState === "INITIATED") && escrowStatus === "funded") {
    return { action: "resume", reason: "Escrow funded on-chain but workflow not advanced" };
  }
  if (workflowState === "FAILED") {
    return { action: "mark_failed", reason: "Workflow already marked failed" };
  }

  return { action: "noop", reason: "State appears consistent" };
}

/**
 * Reconciles in-progress workflows against on-chain escrow state.
 * Resolves discrepancies from server crashes or missed events.
 */
export async function reconcileWorkflows(): Promise<ReconciliationFinding[]> {
  const pool = getPool();
  const findings: ReconciliationFinding[] = [];

  try {
    const { rows } = await pool.query<{
      order_id: string;
      state: string;
      context: { escrowId: string | null };
    }>(
      `SELECT order_id, state, context
       FROM purchase_workflows
       WHERE state NOT IN ('COMPLETED', 'CANCELLED', 'FAILED')
       ORDER BY updated_at ASC`
    );

    for (const row of rows) {
      const escrowId = row.context?.escrowId;
      const escrowStatus = escrowId
        ? await fetchOnChainEscrowStatus(escrowId)
        : "not_found";

      const { action, reason } = recommend(row.state, escrowStatus);

      const finding: ReconciliationFinding = {
        orderId: row.order_id,
        workflowState: row.state,
        escrowStatus,
        recommendedAction: action,
        reason,
      };

      findings.push(finding);

      // Apply safe automated remediations
      if (action === "settle") {
        try {
          await transitionWorkflow(row.order_id, { type: "SETTLE", txHash: "" });
          log.info("Reconciler: advanced workflow to settled", { orderId: row.order_id });
        } catch (err) {
          log.warn("Reconciler: could not settle workflow", { orderId: row.order_id, error: (err as Error).message });
        }
      } else if (action === "refund") {
        try {
          await transitionWorkflow(row.order_id, { type: "CANCEL", reason: "escrow_refunded_on_chain" });
          log.info("Reconciler: cancelled refunded workflow", { orderId: row.order_id });
        } catch (err) {
          log.warn("Reconciler: could not cancel workflow", { orderId: row.order_id, error: (err as Error).message });
        }
      } else if (action !== "noop") {
        log.info("Reconciler: manual action required", { ...finding });
      }
    }

    log.info("Reconciliation complete", { total: rows.length, findings: findings.length });
  } finally {
    await pool.end();
  }

  return findings;
}

// Export workflows for internal use
export {
  createWorkflow,
  transitionWorkflow,
  getWorkflow,
  listWorkflows,
};
