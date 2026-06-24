/**
 * Purchase workflow — delegates to PurchaseWorkflowMachine (issue #7).
 *
 * The machine persists every transition via the `onTransition` hook.
 * Callers can restore a crashed workflow with PurchaseWorkflowMachine.fromSnapshot().
 */

import { PurchaseWorkflowMachine } from "../../state/index.js";
import type {
  WorkflowSnapshot,
  TransitionHook,
} from "../../state/index.js";
import { generateId } from "@delego/utils";

export interface PurchaseWorkflowInput {
  delegationId: string;
  userId: string;
  /** Override the auto-generated workflow ID (e.g. for replay). */
  workflowId?: string;
}

export interface PurchaseWorkflowHandle {
  machine: PurchaseWorkflowMachine;
  snapshot: WorkflowSnapshot;
}

/**
 * Creates a new purchase workflow machine wired to the provided persistence hook.
 *
 * The `onTransition` hook is called after every valid state transition.
 * Pass a database writer here to durably log transitions and enable crash recovery.
 */
export function purchaseWorkflow(
  input: PurchaseWorkflowInput,
  onTransition?: TransitionHook
): PurchaseWorkflowHandle {
  const workflowId = input.workflowId ?? generateId();

  const machine = new PurchaseWorkflowMachine(
    {
      workflowId,
      delegationId: input.delegationId,
      userId: input.userId,
    },
    onTransition
  );

  return { machine, snapshot: machine.getSnapshot() };
}

/**
 * Restores a purchase workflow from a persisted snapshot.
 * Use this after a service restart to resume in-progress workflows.
 */
export function restorePurchaseWorkflow(
  snapshot: WorkflowSnapshot,
  onTransition?: TransitionHook
): PurchaseWorkflowHandle {
  const machine = PurchaseWorkflowMachine.fromSnapshot(snapshot, onTransition);
  return { machine, snapshot: machine.getSnapshot() };
}
