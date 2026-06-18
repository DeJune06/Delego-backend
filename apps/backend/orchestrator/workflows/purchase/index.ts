import type { Order } from "@delego/types";

export interface PurchaseWorkflowInput {
  delegationId: string;
  productId: string;
  quantity: number;
}

export interface PurchaseWorkflowState {
  step: "init" | "catalog" | "approval" | "escrow" | "complete";
  orderId: string | null;
}

/**
 * Purchase workflow orchestration.
 * TODO: Implement state machine with persistence (PostgreSQL + Redis)
 */
export async function purchaseWorkflow(
  _input: PurchaseWorkflowInput
): Promise<{ state: PurchaseWorkflowState; order: Order | null }> {
  return {
    state: { step: "init", orderId: null },
    order: null,
  };
}
