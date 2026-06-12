/** AI agent definitions */

export type AgentRole = "buyer" | "merchant" | "payment" | "delivery";

export interface AgentDefinition {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  version: string;
}

export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema for parameters */
  parameters: Record<string, unknown>;
}

export interface AgentRunContext {
  delegationId: string;
  userId: string;
  sessionId: string;
}

export interface AgentRunResult {
  runId: string;
  status: "completed" | "failed" | "awaiting_approval";
  output: string | null;
  /** Order ID if a purchase was initiated */
  orderId: string | null;
}
