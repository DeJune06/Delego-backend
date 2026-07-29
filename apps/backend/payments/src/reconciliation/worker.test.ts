import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@delego/utils", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../escrowCoordinator/contractClient.js", () => ({
  getContractReadSourceAddress: (fallback?: string) => fallback ?? "GSOURCE",
  mapChainEscrowStatus: vi.fn(),
  readEscrowFromChain: vi.fn(),
}));

import { detectDiscrepancy, runReconciliationCycle } from "./worker.js";
import type {
  OnChainEscrowSource,
  OnChainEscrowStatus,
  PaymentRecordSource,
  ReconcilablePaymentRecord,
} from "./types.js";
import type { PaymentRecordStatus } from "../escrowCoordinator/types.js";

class InMemoryPaymentRecordSource implements PaymentRecordSource {
  constructor(public records: ReconcilablePaymentRecord[]) {}

  async findReconcilable(): Promise<ReconcilablePaymentRecord[]> {
    return this.records.filter((r) => !["released", "refunded", "failed"].includes(r.status));
  }

  async updateStatus(
    id: string,
    status: PaymentRecordStatus,
    expectedCurrentStatus: PaymentRecordStatus
  ): Promise<boolean> {
    const record = this.records.find((r) => r.id === id);
    if (!record || record.status !== expectedCurrentStatus) return false;
    record.status = status;
    return true;
  }
}

class StaticOnChainEscrowSource implements OnChainEscrowSource {
  constructor(private statuses: Record<string, OnChainEscrowStatus>) {}

  async getStatus(_contractId: string, escrowId: string): Promise<OnChainEscrowStatus> {
    return this.statuses[escrowId] ?? "not_found";
  }
}

function makeRecord(overrides: Partial<ReconcilablePaymentRecord> = {}): ReconcilablePaymentRecord {
  return {
    id: "payment-1",
    orderId: "order-1",
    escrowId: "1",
    escrowContractId: "CESCROW",
    buyerAddress: "GBUYER",
    status: "funded",
    ...overrides,
  };
}

describe("detectDiscrepancy", () => {
  it("returns null when statuses match", () => {
    expect(detectDiscrepancy("funded", "funded")).toBeNull();
  });

  it("returns null when on-chain escrow is not found", () => {
    expect(detectDiscrepancy("funded", "not_found")).toBeNull();
  });

  it("flags status_mismatch when on-chain is released but db is not", () => {
    expect(detectDiscrepancy("funded", "released")).toBe("status_mismatch");
  });

  it("flags status_mismatch when on-chain is refunded but db is not", () => {
    expect(detectDiscrepancy("funded", "refunded")).toBe("status_mismatch");
  });

  it("flags status_mismatch when on-chain is disputed but db is not", () => {
    expect(detectDiscrepancy("funded", "disputed")).toBe("status_mismatch");
  });

  it("flags status_mismatch when db claims released but on-chain is still funded", () => {
    expect(detectDiscrepancy("released", "funded")).toBe("status_mismatch");
  });

  it("flags status_mismatch when db claims refunded but on-chain is still funded", () => {
    expect(detectDiscrepancy("refunded", "funded")).toBe("status_mismatch");
  });
});

describe("runReconciliationCycle - discrepancy detection", () => {
  it("detects a released-on-chain discrepancy for a funded db record", async () => {
    const records = new InMemoryPaymentRecordSource([
      makeRecord({ id: "p1", escrowId: "1", status: "funded" }),
    ]);
    const chain = new StaticOnChainEscrowSource({ "1": "released" });

    const result = await runReconciliationCycle(records, chain);

    expect(result.totalChecked).toBe(1);
    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0]).toMatchObject({
      paymentId: "p1",
      dbStatus: "funded",
      onChainStatus: "released",
      discrepancyType: "status_mismatch",
    });
  });

  it("reports no discrepancies when db and chain agree", async () => {
    const records = new InMemoryPaymentRecordSource([
      makeRecord({ id: "p1", escrowId: "1", status: "funded" }),
      makeRecord({ id: "p2", escrowId: "2", status: "disputed" }),
    ]);
    const chain = new StaticOnChainEscrowSource({ "1": "funded", "2": "disputed" });

    const result = await runReconciliationCycle(records, chain);

    expect(result.discrepancies).toHaveLength(0);
    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("flags records with a missing escrow_id without querying the chain", async () => {
    const records = new InMemoryPaymentRecordSource([
      makeRecord({ id: "p1", escrowId: null, status: "pending" }),
    ]);
    const chain = new StaticOnChainEscrowSource({});
    const getStatusSpy = vi.spyOn(chain, "getStatus");

    const result = await runReconciliationCycle(records, chain);

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].discrepancyType).toBe("missing_escrow_id");
    expect(getStatusSpy).not.toHaveBeenCalled();
  });

  it("skips escrows not found on-chain", async () => {
    const records = new InMemoryPaymentRecordSource([
      makeRecord({ id: "p1", escrowId: "99", status: "funded" }),
    ]);
    const chain = new StaticOnChainEscrowSource({});

    const result = await runReconciliationCycle(records, chain);

    expect(result.discrepancies).toHaveLength(0);
  });

  it("excludes terminal-status records from the reconciliation set", async () => {
    const records = new InMemoryPaymentRecordSource([
      makeRecord({ id: "p1", escrowId: "1", status: "released" }),
      makeRecord({ id: "p2", escrowId: "2", status: "refunded" }),
      makeRecord({ id: "p3", escrowId: "3", status: "failed" }),
    ]);
    const chain = new StaticOnChainEscrowSource({});

    const result = await runReconciliationCycle(records, chain);

    expect(result.totalChecked).toBe(0);
  });
});

describe("runReconciliationCycle - conflict resolution", () => {
  it("updates the db record to the canonical on-chain status", async () => {
    const source = new InMemoryPaymentRecordSource([
      makeRecord({ id: "p1", escrowId: "1", status: "funded" }),
    ]);
    const chain = new StaticOnChainEscrowSource({ "1": "released" });

    const result = await runReconciliationCycle(source, chain);

    expect(result.resolved).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.discrepancies[0].resolvedAt).toBeDefined();
    expect(source.records[0].status).toBe("released");
  });

  it("counts a failed resolution when the record changed concurrently", async () => {
    class ConcurrentConflictSource implements PaymentRecordSource {
      async findReconcilable(): Promise<ReconcilablePaymentRecord[]> {
        return [makeRecord({ id: "p1", escrowId: "1", status: "funded" })];
      }
      async updateStatus(): Promise<boolean> {
        // Simulates another process having already changed the row.
        return false;
      }
    }

    const source = new ConcurrentConflictSource();
    const chain = new StaticOnChainEscrowSource({ "1": "released" });

    const result = await runReconciliationCycle(source, chain);

    expect(result.discrepancies).toHaveLength(1);
    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.discrepancies[0].resolvedAt).toBeUndefined();
  });

  it("does not call updateStatus when db and chain already agree", async () => {
    const records = new InMemoryPaymentRecordSource([
      makeRecord({ id: "p1", escrowId: "1", status: "funded" }),
    ]);
    const chain = new StaticOnChainEscrowSource({ "1": "funded" });
    const updateSpy = vi.spyOn(records, "updateStatus");

    await runReconciliationCycle(records, chain);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("continues reconciling remaining records when one record errors", async () => {
    class ThrowingOnceSource implements PaymentRecordSource {
      calls = 0;
      async findReconcilable(): Promise<ReconcilablePaymentRecord[]> {
        return [
          makeRecord({ id: "p1", escrowId: "1", status: "funded" }),
          makeRecord({ id: "p2", escrowId: "2", status: "funded" }),
        ];
      }
      async updateStatus(id: string): Promise<boolean> {
        this.calls++;
        if (id === "p1") throw new Error("db unavailable");
        return true;
      }
    }

    const source = new ThrowingOnceSource();
    const chain = new StaticOnChainEscrowSource({ "1": "released", "2": "released" });

    const result = await runReconciliationCycle(source, chain);

    expect(result.totalChecked).toBe(2);
    expect(result.discrepancies).toHaveLength(2);
    expect(result.failed).toBe(1);
    expect(result.resolved).toBe(1);
  });
});
