/**
 * Unit tests for Transaction Batching Queue
 * Issue #42
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@delegolabs/utils", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock batchSubmitter for unit tests
vi.mock("../batchSubmitter.js", () => ({
  estimateBatchGas: vi.fn((requests: unknown[]) => ({
    individualCostStroops: (requests.length * 100).toString(),
    batchedCostStroops: (100 + (requests.length - 1) * 10).toString(),
    savingsStroops: (
      requests.length * 100 -
      100 -
      (requests.length - 1) * 10
    ).toString(),
    savingsPercentage: 0,
  })),
}));

import {
  submitBatch,
  getBatchStatus,
  flushNow,
  clearBatchStore,
  stopBatchFlushTimers,
  batchStore,
  normalQueue,
  highQueue,
  MAX_BATCH_SIZE,
} from "./batchQueue.js";
import type { BatchTransactionItem } from "./types.js";

function makeTx(
  overrides: Partial<BatchTransactionItem> = {},
): BatchTransactionItem {
  return {
    sourceAddress: "GBSOURCE_ADDRESS_PLACEHOLDER",
    contractId: "CCONTRACT_PLACEHOLDER",
    method: "transfer",
    args: ["arg1", "arg2"],
    memo: "test transaction",
    userId: "user-001",
    ...overrides,
  };
}

beforeEach(() => {
  clearBatchStore();
  stopBatchFlushTimers();
  vi.clearAllMocks();
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  stopBatchFlushTimers();
  clearBatchStore();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// submitBatch
// ---------------------------------------------------------------------------

describe("submitBatch", () => {
  it("queues a normal priority batch and returns batchId", async () => {
    const result = await submitBatch({
      transactions: [makeTx()],
      priority: "normal",
    });

    expect(result.batchId).toMatch(/^batch_/);
    expect(result.status).toBe("queued");
    expect(result.submittedAt).toBeDefined();
    expect(result.estimatedCompletion).toBeDefined();
    expect(normalQueue).toContain(result.batchId);
  });

  it("queues a high-priority batch to the high queue", async () => {
    const result = await submitBatch({
      transactions: [makeTx()],
      priority: "high",
    });

    expect(result.status).toBe("queued");
    expect(highQueue).toContain(result.batchId);
    expect(normalQueue).not.toContain(result.batchId);
  });

  it("rejects empty transaction list", async () => {
    await expect(
      submitBatch({ transactions: [], priority: "normal" }),
    ).rejects.toThrow(/at least one/);
  });

  it("rejects batches larger than MAX_BATCH_SIZE", async () => {
    const oversized = Array.from({ length: MAX_BATCH_SIZE + 1 }, () =>
      makeTx(),
    );
    await expect(
      submitBatch({ transactions: oversized, priority: "normal" }),
    ).rejects.toThrow(/exceeds maximum/);
  });

  it("rejects missing sourceAddress", async () => {
    await expect(
      submitBatch({
        transactions: [makeTx({ sourceAddress: "" })],
        priority: "normal",
      }),
    ).rejects.toThrow(/sourceAddress/);
  });

  it("rejects missing contractId", async () => {
    await expect(
      submitBatch({
        transactions: [makeTx({ contractId: "" })],
        priority: "normal",
      }),
    ).rejects.toThrow(/contractId/);
  });

  it("rejects missing userId", async () => {
    await expect(
      submitBatch({
        transactions: [makeTx({ userId: "" })],
        priority: "normal",
      }),
    ).rejects.toThrow(/userId/);
  });

  it("estimated completion is after submittedAt", async () => {
    const result = await submitBatch({
      transactions: [makeTx()],
      priority: "normal",
    });
    expect(new Date(result.estimatedCompletion).getTime()).toBeGreaterThan(
      new Date(result.submittedAt).getTime(),
    );
  });

  it("high-priority has shorter estimated completion than normal", async () => {
    const high = await submitBatch({
      transactions: [makeTx()],
      priority: "high",
    });
    clearBatchStore();
    const normal = await submitBatch({
      transactions: [makeTx()],
      priority: "normal",
    });

    const highDelay =
      new Date(high.estimatedCompletion).getTime() -
      new Date(high.submittedAt).getTime();
    const normalDelay =
      new Date(normal.estimatedCompletion).getTime() -
      new Date(normal.submittedAt).getTime();

    expect(highDelay).toBeLessThan(normalDelay);
  });

  it("accepts up to MAX_BATCH_SIZE transactions", async () => {
    const maxBatch = Array.from({ length: MAX_BATCH_SIZE }, () => makeTx());
    const result = await submitBatch({
      transactions: maxBatch,
      priority: "normal",
    });
    expect(result.status).toBe("queued");
  });
});

// ---------------------------------------------------------------------------
// getBatchStatus
// ---------------------------------------------------------------------------

describe("getBatchStatus", () => {
  it("returns queued status for a pending batch", async () => {
    const submitted = await submitBatch({
      transactions: [makeTx()],
      priority: "normal",
    });
    const status = await getBatchStatus(submitted.batchId);
    expect(status.status).toBe("queued");
    expect(status.batchId).toBe(submitted.batchId);
  });

  it("throws for an unknown batchId", async () => {
    await expect(getBatchStatus("non-existent-batch-id")).rejects.toThrow(
      /not found/,
    );
  });
});

// ---------------------------------------------------------------------------
// flushNow / execution
// ---------------------------------------------------------------------------

describe("flushNow", () => {
  it("executes normal batches synchronously and updates status to completed", async () => {
    const submitted = await submitBatch({
      transactions: [makeTx()],
      priority: "normal",
    });

    await flushNow("normal");

    const result = await getBatchStatus(submitted.batchId);
    expect(result.status).toBe("completed");
  });

  it("executes high-priority batches immediately", async () => {
    const submitted = await submitBatch({
      transactions: [makeTx(), makeTx({ userId: "user-002" })],
      priority: "high",
    });

    await flushNow("high");

    const result = await getBatchStatus(submitted.batchId);
    expect(result.status).toBe("completed");
  });

  it("returns gas metrics after execution", async () => {
    const submitted = await submitBatch({
      transactions: [
        makeTx(),
        makeTx({ userId: "user-002" }),
        makeTx({ userId: "user-003" }),
      ],
      priority: "normal",
    });

    await flushNow("normal");

    const result = (await getBatchStatus(submitted.batchId)) as {
      gasUsed: string;
      gasSaved: string;
    };
    expect(result.gasUsed).toBeDefined();
    expect(result.gasSaved).toBeDefined();
    expect(Number(result.gasUsed)).toBeGreaterThan(0);
    expect(Number(result.gasSaved)).toBeGreaterThan(0);
  });

  it("handles partial failure (FORCE_FAIL memo)", async () => {
    const submitted = await submitBatch({
      transactions: [
        makeTx({ userId: "user-ok" }),
        makeTx({ userId: "user-fail", memo: "FORCE_FAIL" }),
      ],
      priority: "normal",
    });

    await flushNow("normal");

    const result = (await getBatchStatus(submitted.batchId)) as {
      status: string;
      results: Array<{ userId: string; success: boolean }>;
    };
    expect(result.status).toBe("partial_failure");
    expect(result.results.find((r) => r.userId === "user-ok")?.success).toBe(
      true,
    );
    expect(result.results.find((r) => r.userId === "user-fail")?.success).toBe(
      false,
    );
  });

  it("individual item results include userId, success, hash, and ledger", async () => {
    const submitted = await submitBatch({
      transactions: [makeTx({ userId: "user-result-check" })],
      priority: "normal",
    });

    await flushNow("normal");

    const result = (await getBatchStatus(submitted.batchId)) as {
      results: Array<{
        userId: string;
        success: boolean;
        hash: string | null;
        ledger: number | null;
      }>;
    };
    expect(result.results).toHaveLength(1);
    const item = result.results[0];
    expect(item.userId).toBe("user-result-check");
    expect(item.success).toBe(true);
    expect(item.hash).toBeDefined();
    expect(item.ledger).toBeDefined();
  });

  it("does nothing for an empty queue", async () => {
    await expect(flushNow("normal")).resolves.toBeUndefined();
    await expect(flushNow("high")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gas calculations
// ---------------------------------------------------------------------------

describe("gas calculations", () => {
  it("calculates gas savings for batch of 10", async () => {
    const txs = Array.from({ length: 10 }, (_, i) =>
      makeTx({ userId: `user-${i}` }),
    );
    const submitted = await submitBatch({
      transactions: txs,
      priority: "normal",
    });
    await flushNow("normal");

    const result = (await getBatchStatus(submitted.batchId)) as {
      gasUsed: string;
      gasSaved: string;
    };

    // Individual: 10 * 100 = 1000 stroops
    // Batched: 100 + 9 * 10 = 190 stroops
    // Saved: 810 stroops
    expect(Number(result.gasUsed)).toBe(190);
    expect(Number(result.gasSaved)).toBe(810);
  });

  it("calculates gas savings for batch of 1 (no savings)", async () => {
    const submitted = await submitBatch({
      transactions: [makeTx()],
      priority: "normal",
    });
    await flushNow("normal");

    const result = (await getBatchStatus(submitted.batchId)) as {
      gasUsed: string;
      gasSaved: string;
    };

    expect(Number(result.gasUsed)).toBe(100);
    expect(Number(result.gasSaved)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MAX_BATCH_SIZE constant
// ---------------------------------------------------------------------------

describe("MAX_BATCH_SIZE", () => {
  it("is 50", () => {
    expect(MAX_BATCH_SIZE).toBe(50);
  });
});
