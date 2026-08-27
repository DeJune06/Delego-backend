/**
 * Unit tests for Social Guardian Account Recovery Service
 * Issue #43
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("@delegolabs/utils", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// In-memory stores for mocked models
// ---------------------------------------------------------------------------

const guardianStore = new Map<string, Record<string, unknown>>();
const recoveryStore = new Map<string, Record<string, unknown>>();
const auditStore: Array<Record<string, unknown>> = [];

let idCounter = 0;
function nextId(): string {
  return `id-${++idCounter}`;
}

function makeGuardianInstance(data: Record<string, unknown>) {
  const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
  guardianStore.set(row.id as string, row);
  return {
    ...row,
    reload: async () =>
      makeGuardianInstance(guardianStore.get(row.id as string)!),
    update: async (changes: Record<string, unknown>) => {
      Object.assign(row, changes);
      guardianStore.set(row.id as string, row);
      return row;
    },
    destroy: async () => {
      guardianStore.delete(row.id as string);
    },
  };
}

function makeRecoveryInstance(data: Record<string, unknown>) {
  const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
  recoveryStore.set(row.id as string, row);
  return {
    ...row,
    reload: async () =>
      makeRecoveryInstance(recoveryStore.get(row.id as string)!),
    update: async (changes: Record<string, unknown>) => {
      Object.assign(row, changes);
      recoveryStore.set(row.id as string, row);
      return row;
    },
  };
}

vi.mock("../recovery/models.js", () => ({
  GuardianModel: {
    create: vi.fn(async (data: Record<string, unknown>) => {
      const id = nextId();
      return makeGuardianInstance({ ...data, id });
    }),
    findByPk: vi.fn(async (id: string) => {
      const row = guardianStore.get(id);
      return row ? makeGuardianInstance(row) : null;
    }),
    findAll: vi.fn(async (opts: { where: Record<string, unknown> }) => {
      const results: ReturnType<typeof makeGuardianInstance>[] = [];
      for (const row of guardianStore.values()) {
        const match = Object.entries(opts.where).every(
          ([k, v]) => row[k] === v,
        );
        if (match) results.push(makeGuardianInstance(row));
      }
      return results;
    }),
  },
  RecoveryRequestModel: {
    create: vi.fn(async (data: Record<string, unknown>) => {
      const id = nextId();
      return makeRecoveryInstance({ ...data, id });
    }),
    findByPk: vi.fn(async (id: string) => {
      const row = recoveryStore.get(id);
      return row ? makeRecoveryInstance(row) : null;
    }),
    findOne: vi.fn(async (opts: { where: Record<string, unknown> }) => {
      for (const row of recoveryStore.values()) {
        const match = Object.entries(opts.where).every(
          ([k, v]) => row[k] === v,
        );
        if (match) return makeRecoveryInstance(row);
      }
      return null;
    }),
  },
  RecoveryAuditLogModel: {
    create: vi.fn(async (data: Record<string, unknown>) => {
      auditStore.push(data);
      return data;
    }),
  },
}));

import {
  addGuardian,
  verifyGuardian,
  removeGuardian,
  listGuardians,
  initiateRecovery,
  approveRecovery,
  disableRecovery,
  enableRecovery,
  isRecoveryEnabled,
  encryptIdentifier,
  decryptIdentifier,
  deriveRecoveryKey,
  recoveryAttemptTimestamps,
} from "./guardianRecovery.js";

const WALLET_ADDRESS =
  "GBWALLET_TESTADDRESS_RECOVERY_UNIT_TESTS_FIXTURE_VALUE_001";
const INITIATOR = "GBINITIATOR_TESTADDRESS_VALUE";

beforeEach(() => {
  guardianStore.clear();
  recoveryStore.clear();
  auditStore.length = 0;
  recoveryAttemptTimestamps.clear();
  enableRecovery();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

describe("encryptIdentifier / decryptIdentifier", () => {
  it("round-trips an email identifier", async () => {
    const original = "user@example.com";
    const encrypted = await encryptIdentifier(original);
    const decrypted = await decryptIdentifier(encrypted);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertext each time (random salt+iv)", async () => {
    const original = "user@example.com";
    const e1 = await encryptIdentifier(original);
    const e2 = await encryptIdentifier(original);
    expect(e1).not.toBe(e2);
  });
});

// ---------------------------------------------------------------------------
// Recovery key derivation
// ---------------------------------------------------------------------------

describe("deriveRecoveryKey", () => {
  it("returns a non-empty hex string", () => {
    const key = deriveRecoveryKey(["sig1", "sig2", "sig3"]);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same signatures (order-independent)", () => {
    const k1 = deriveRecoveryKey(["sig1", "sig2", "sig3"]);
    const k2 = deriveRecoveryKey(["sig3", "sig1", "sig2"]);
    expect(k1).toBe(k2);
  });

  it("differs for different signatures", () => {
    const k1 = deriveRecoveryKey(["sig1", "sig2"]);
    const k2 = deriveRecoveryKey(["sig3", "sig4"]);
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// Emergency disable flag
// ---------------------------------------------------------------------------

describe("recovery enable/disable", () => {
  it("starts enabled by default", () => {
    expect(isRecoveryEnabled()).toBe(true);
  });

  it("can be disabled and re-enabled", () => {
    disableRecovery();
    expect(isRecoveryEnabled()).toBe(false);
    enableRecovery();
    expect(isRecoveryEnabled()).toBe(true);
  });

  it("blocks recovery initiation when disabled", async () => {
    disableRecovery();
    await expect(
      initiateRecovery({
        walletAddress: WALLET_ADDRESS,
        initiatedBy: INITIATOR,
      }),
    ).rejects.toThrow(/disabled/);
  });
});

// ---------------------------------------------------------------------------
// Guardian management
// ---------------------------------------------------------------------------

describe("addGuardian", () => {
  it("adds an email guardian with verification code", async () => {
    const guardian = await addGuardian({
      walletAddress: WALLET_ADDRESS,
      type: "email",
      identifier: "guardian@example.com",
    });

    expect(guardian.id).toBeDefined();
    expect(guardian.type).toBe("email");
    expect(guardian.verified).toBe(false);
    expect(guardian.verificationCode).toBeDefined();
    expect(guardian.verificationExpiresAt).toBeDefined();
  });

  it("adds a phone guardian", async () => {
    const guardian = await addGuardian({
      walletAddress: WALLET_ADDRESS,
      type: "phone",
      identifier: "+1-555-0100",
    });
    expect(guardian.type).toBe("phone");
  });

  it("adds a wallet guardian", async () => {
    const guardian = await addGuardian({
      walletAddress: WALLET_ADDRESS,
      type: "wallet",
      identifier: "GBGUARDIAN_WALLET_ADDRESS_HERE",
    });
    expect(guardian.type).toBe("wallet");
  });

  it("rejects missing walletAddress", async () => {
    await expect(
      addGuardian({ walletAddress: "", type: "email", identifier: "x@y.com" }),
    ).rejects.toThrow(/required/);
  });
});

describe("verifyGuardian", () => {
  it("verifies with correct code", async () => {
    const g = await addGuardian({
      walletAddress: WALLET_ADDRESS,
      type: "email",
      identifier: "g@example.com",
    });
    const row = guardianStore.get(g.id)!;
    const code = row.verificationCode as string;

    const verified = await verifyGuardian(g.id, code);
    expect(verified.verified).toBe(true);
    expect(verified.verificationCode).toBeNull();
  });

  it("rejects wrong code", async () => {
    const g = await addGuardian({
      walletAddress: WALLET_ADDRESS,
      type: "email",
      identifier: "g@example.com",
    });
    await expect(verifyGuardian(g.id, "WRONGCODE")).rejects.toThrow(
      /Invalid verification code/,
    );
  });

  it("rejects expired code", async () => {
    const g = await addGuardian({
      walletAddress: WALLET_ADDRESS,
      type: "email",
      identifier: "g@example.com",
    });
    const row = guardianStore.get(g.id)!;
    const code = row.verificationCode as string;
    // set expiry to past
    row.verificationExpiresAt = new Date(Date.now() - 1000);

    await expect(verifyGuardian(g.id, code)).rejects.toThrow(/expired/);
  });

  it("rejects double verification", async () => {
    const g = await addGuardian({
      walletAddress: WALLET_ADDRESS,
      type: "email",
      identifier: "g@example.com",
    });
    const row = guardianStore.get(g.id)!;
    const code = row.verificationCode as string;
    await verifyGuardian(g.id, code);
    await expect(verifyGuardian(g.id, code)).rejects.toThrow(
      /already verified/,
    );
  });
});

describe("removeGuardian", () => {
  it("removes an existing guardian", async () => {
    const g = await addGuardian({
      walletAddress: WALLET_ADDRESS,
      type: "email",
      identifier: "g@example.com",
    });
    await removeGuardian(g.id);
    expect(guardianStore.has(g.id)).toBe(false);
  });

  it("throws for missing guardian", async () => {
    await expect(removeGuardian("nonexistent")).rejects.toThrow(/not found/);
  });
});

describe("listGuardians", () => {
  it("lists only guardians for the given wallet", async () => {
    await addGuardian({
      walletAddress: WALLET_ADDRESS,
      type: "email",
      identifier: "a@x.com",
    });
    await addGuardian({
      walletAddress: WALLET_ADDRESS,
      type: "phone",
      identifier: "+1-555",
    });
    await addGuardian({
      walletAddress: "OTHER_WALLET",
      type: "email",
      identifier: "b@x.com",
    });

    const guardians = await listGuardians(WALLET_ADDRESS);
    expect(guardians).toHaveLength(2);
    expect(guardians.every((g) => g.type !== undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Recovery workflow
// ---------------------------------------------------------------------------

async function addVerifiedGuardian(id: string): Promise<string> {
  const g = await addGuardian({
    walletAddress: WALLET_ADDRESS,
    type: "wallet",
    identifier: `GBGUARDIAN_${id}`,
  });
  const row = guardianStore.get(g.id)!;
  const code = row.verificationCode as string;
  await verifyGuardian(g.id, code);
  return g.id;
}

describe("initiateRecovery", () => {
  it("creates a pending recovery request", async () => {
    const req = await initiateRecovery({
      walletAddress: WALLET_ADDRESS,
      initiatedBy: INITIATOR,
    });
    expect(req.status).toBe("pending");
    expect(req.walletAddress).toBe(WALLET_ADDRESS);
    expect(req.requiredApprovals).toBe(3);
    expect(req.approvals).toHaveLength(0);
  });

  it("enforces rate limit (max 1 per 30 days)", async () => {
    recoveryAttemptTimestamps.set(WALLET_ADDRESS, new Date());
    await expect(
      initiateRecovery({
        walletAddress: WALLET_ADDRESS,
        initiatedBy: INITIATOR,
      }),
    ).rejects.toThrow(/rate limit/i);
  });

  it("rejects duplicate active request", async () => {
    await initiateRecovery({
      walletAddress: WALLET_ADDRESS,
      initiatedBy: INITIATOR,
    });
    // Clear rate limit to test the duplicate path specifically
    recoveryAttemptTimestamps.delete(WALLET_ADDRESS);
    await expect(
      initiateRecovery({
        walletAddress: WALLET_ADDRESS,
        initiatedBy: INITIATOR,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("respects custom requiredApprovals", async () => {
    const req = await initiateRecovery({
      walletAddress: WALLET_ADDRESS,
      initiatedBy: INITIATOR,
      requiredApprovals: 2,
    });
    expect(req.requiredApprovals).toBe(2);
  });
});

describe("approveRecovery", () => {
  it("records guardian approvals", async () => {
    const g1Id = await addVerifiedGuardian("01");
    const req = await initiateRecovery({
      walletAddress: WALLET_ADDRESS,
      initiatedBy: INITIATOR,
      requiredApprovals: 3,
    });

    const result = await approveRecovery(req.id, {
      guardianId: g1Id,
      signature: "sig_g1",
    });

    // Still pending - only 1 of 3 approvals
    expect("status" in result && (result as { status: string }).status).toBe(
      "pending",
    );
  });

  it("completes recovery when threshold is met", async () => {
    const g1Id = await addVerifiedGuardian("A1");
    const g2Id = await addVerifiedGuardian("A2");
    const g3Id = await addVerifiedGuardian("A3");

    const req = await initiateRecovery({
      walletAddress: WALLET_ADDRESS,
      initiatedBy: INITIATOR,
      requiredApprovals: 3,
    });

    await approveRecovery(req.id, { guardianId: g1Id, signature: "sig1" });
    await approveRecovery(req.id, { guardianId: g2Id, signature: "sig2" });
    const result = await approveRecovery(req.id, {
      guardianId: g3Id,
      signature: "sig3",
    });

    expect("recoveryKey" in result).toBe(true);
    const completedResult = result as {
      recoveryKey: string;
      walletAddress: string;
      newMasterKey: string;
      completedAt: string;
    };
    expect(completedResult.recoveryKey).toBeDefined();
    expect(completedResult.walletAddress).toBe(WALLET_ADDRESS);
    expect(completedResult.newMasterKey).toBeDefined();
    expect(completedResult.completedAt).toBeDefined();
  });

  it("prevents duplicate guardian approvals", async () => {
    const g1Id = await addVerifiedGuardian("B1");
    const req = await initiateRecovery({
      walletAddress: WALLET_ADDRESS,
      initiatedBy: INITIATOR,
      requiredApprovals: 3,
    });

    await approveRecovery(req.id, { guardianId: g1Id, signature: "sig1" });
    await expect(
      approveRecovery(req.id, { guardianId: g1Id, signature: "sig1_dup" }),
    ).rejects.toThrow(/already approved/);
  });

  it("rejects unverified guardian", async () => {
    const g = await addGuardian({
      walletAddress: WALLET_ADDRESS,
      type: "email",
      identifier: "unverified@x.com",
    });
    const req = await initiateRecovery({
      walletAddress: WALLET_ADDRESS,
      initiatedBy: INITIATOR,
    });
    await expect(
      approveRecovery(req.id, { guardianId: g.id, signature: "sig" }),
    ).rejects.toThrow(/not verified/);
  });

  it("rejects guardian from a different wallet", async () => {
    const g = await addGuardian({
      walletAddress: "DIFFERENT_WALLET",
      type: "email",
      identifier: "x@x.com",
    });
    const row = guardianStore.get(g.id)!;
    row.verified = true;

    const req = await initiateRecovery({
      walletAddress: WALLET_ADDRESS,
      initiatedBy: INITIATOR,
    });
    await expect(
      approveRecovery(req.id, { guardianId: g.id, signature: "sig" }),
    ).rejects.toThrow(/does not belong/);
  });
});
