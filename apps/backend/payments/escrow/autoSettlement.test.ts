import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleDeliveryConfirmationWebhook,
  resetProcessedWebhookStore,
  type DeliveryConfirmationWebhook,
} from "./autoSettlement.js";
import { escrowCoordinator } from "../src/escrowCoordinator/index.js";

vi.mock("../src/escrowCoordinator/index.js", () => ({
  escrowCoordinator: {
    getEscrowStatus: vi.fn(),
    releaseEscrow: vi.fn(),
    fundEscrow: vi.fn(),
    refundEscrow: vi.fn(),
  },
}));

function baseWebhook(overrides: Partial<DeliveryConfirmationWebhook> = {}): DeliveryConfirmationWebhook {
  return {
    webhookId: "wh-1",
    orderId: "order-1",
    escrowId: "42",
    escrowContractId: "CCONTRACT",
    callerAddress: "GCALLER",
    confirmedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("handleDeliveryConfirmationWebhook", () => {
  beforeEach(() => {
    resetProcessedWebhookStore();
    vi.mocked(escrowCoordinator.getEscrowStatus).mockReset();
    vi.mocked(escrowCoordinator.releaseEscrow).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers escrow release on delivery confirmation", async () => {
    vi.mocked(escrowCoordinator.getEscrowStatus).mockResolvedValue({
      escrowId: "42",
      buyer: "GBUYER",
      seller: "GSELLER",
      amount: "1000",
      status: "funded",
      createdAt: Date.now(),
    });
    vi.mocked(escrowCoordinator.releaseEscrow).mockResolvedValue({
      txHash: "tx-abc",
      ledger: 100,
      status: "released",
      sellerAddress: "GSELLER",
      amount: "1000",
    });

    const result = await handleDeliveryConfirmationWebhook(baseWebhook());

    expect(result.status).toBe("released");
    expect(result.release?.txHash).toBe("tx-abc");
    expect(escrowCoordinator.releaseEscrow).toHaveBeenCalledWith({
      escrowId: "42",
      escrowContractId: "CCONTRACT",
      callerAddress: "GCALLER",
    });
  });

  it("is idempotent for duplicate webhook deliveries", async () => {
    vi.mocked(escrowCoordinator.getEscrowStatus).mockResolvedValue({
      escrowId: "42",
      buyer: "GBUYER",
      seller: "GSELLER",
      amount: "1000",
      status: "funded",
      createdAt: Date.now(),
    });
    vi.mocked(escrowCoordinator.releaseEscrow).mockResolvedValue({
      txHash: "tx-abc",
      ledger: 100,
      status: "released",
      sellerAddress: "GSELLER",
      amount: "1000",
    });

    const webhook = baseWebhook();
    const first = await handleDeliveryConfirmationWebhook(webhook);
    const second = await handleDeliveryConfirmationWebhook(webhook);

    expect(first.status).toBe("released");
    expect(second.status).toBe("duplicate");
    expect(escrowCoordinator.releaseEscrow).toHaveBeenCalledTimes(1);
  });

  it("fails with already_settled when the escrow was already released", async () => {
    vi.mocked(escrowCoordinator.getEscrowStatus).mockResolvedValue({
      escrowId: "42",
      buyer: "GBUYER",
      seller: "GSELLER",
      amount: "1000",
      status: "released",
      createdAt: Date.now(),
    });

    const result = await handleDeliveryConfirmationWebhook(baseWebhook({ webhookId: "wh-2" }));

    expect(result.status).toBe("already_settled");
    expect(escrowCoordinator.releaseEscrow).not.toHaveBeenCalled();
  });

  it("returns failed status when the on-chain release fails", async () => {
    vi.mocked(escrowCoordinator.getEscrowStatus).mockResolvedValue({
      escrowId: "42",
      buyer: "GBUYER",
      seller: "GSELLER",
      amount: "1000",
      status: "funded",
      createdAt: Date.now(),
    });
    vi.mocked(escrowCoordinator.releaseEscrow).mockResolvedValue({
      txHash: "tx-fail",
      ledger: 0,
      status: "failed",
      sellerAddress: "GSELLER",
      amount: "1000",
    });

    const result = await handleDeliveryConfirmationWebhook(baseWebhook({ webhookId: "wh-3" }));

    expect(result.status).toBe("failed");
  });

  it("returns failed status when the coordinator throws", async () => {
    vi.mocked(escrowCoordinator.getEscrowStatus).mockResolvedValue(null as never);
    vi.mocked(escrowCoordinator.releaseEscrow).mockRejectedValue(new Error("network error"));

    const result = await handleDeliveryConfirmationWebhook(baseWebhook({ webhookId: "wh-4" }));

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("network error");
  });
});
