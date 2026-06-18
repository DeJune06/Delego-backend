export type PaymentEventType =
  | "escrow_created"
  | "escrow_released"
  | "escrow_refunded"
  | "settlement_complete";

export interface PaymentEvent {
  type: PaymentEventType;
  orderId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

/** Emit payment events — TODO: Publish to event bus / analytics */
export function emitPaymentEvent(_event: PaymentEvent): void {
  // TODO: Implement event publishing
}
