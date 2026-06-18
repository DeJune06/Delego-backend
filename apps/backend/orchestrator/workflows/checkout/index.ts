/** Checkout workflow — TODO: Implement payment confirmation flow */
export interface CheckoutWorkflowInput {
  orderId: string;
}

export async function checkoutWorkflow(
  _input: CheckoutWorkflowInput
): Promise<{ status: "pending" }> {
  // TODO: Coordinate with payments service and user approval
  return { status: "pending" };
}
