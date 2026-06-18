/** Delivery workflow — TODO: Implement fulfillment tracking */
export interface DeliveryWorkflowInput {
  orderId: string;
}

export async function deliveryWorkflow(
  _input: DeliveryWorkflowInput
): Promise<{ status: "pending" }> {
  // TODO: Coordinate with delivery agent and merchant
  return { status: "pending" };
}
