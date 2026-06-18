import type { AgentDefinition } from "@delego/types";

export const paymentAgentDefinition: AgentDefinition = {
  id: "payment-agent",
  role: "payment",
  name: "Payment Agent",
  description: "Executes payments within delegated spending policies",
  version: "0.0.1",
};

// TODO: Implement payment agent with wallet service integration
