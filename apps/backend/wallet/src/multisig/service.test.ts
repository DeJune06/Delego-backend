/**
 * Unit tests for Multi-Signature Wallet Service
 * Issue #44
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
// In-memory store to mock Sequelize models
// ---------------------------------------------------------------------------

const walletStore: Map<string, Record<string, unknown>> = new Map();
const proposalStore: Map<string, Record<string, unknown>> = new Map();
const auditStore: Array<Record<string, unknown>> = [];

let idCounter = 0;
function nextId(): string {
  return `id-${++idCounter}`;
}

function makeWalletInstance(data: Record<string, unknown>) {
  const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
  walletStore.set(row.id as string, row);
  return {
    ...row,
    reload: async () => makeWalletInstance(walletStore.get(row.id as string)!),
    update: async (changes: Record<string, unknown>) => {
      Object.assign(row, changes, { updatedAt: new Date() });
      walletStore.set(row.id as string, row);
      return row;
    },
  };
}

function makeProposalInstance(data: Record<string, unknown>) {
  const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
  proposalStore.set(row.id as string, row);
  return {
    ...row,
    reload: async () =>
      makeProposalInstance(proposalStore.get(row.id as string)!),
    update: async (changes: Record<string, unknown>) => {
      Object.assign(row, changes, { updatedAt: new Date() });
      proposalStore.set(row.id as string, row);
      return row;
    },
  };
}

vi.mock("../multisig/models.js", () => {
  return {
    MultiSigWalletModel: {
      create: vi.fn(async (data: Record<string, unknown>) => {
        const id = nextId();
        return makeWalletInstance({ ...data, id });
      }),
      findByPk: vi.fn(async (id: string) => {
        const row = walletStore.get(id);
        if (!row) return null;
        return makeWalletInstance(row);
      }),
      findAll: vi.fn(async () => []),
    },
    MultiSigProposalModel: {
      create: vi.fn(async (data: Record<string, unknown>) => {
        const id = nextId();
        return makeProposalInstance({ ...data, id });
      }),
      findOne: vi.fn(
        async (opts: { where: { id?: string; walletId?: string } }) => {
          const { id, walletId } = opts.where;
          for (const row of proposalStore.values()) {
            if (
              (!id || row.id === id) &&
              (!walletId || row.walletId === walletId)
            ) {
              return makeProposalInstance(row);
            }
          }
          return null;
        },
      ),
      findAll: vi.fn(async (opts: { where: { walletId: string } }) => {
        const results: ReturnType<typeof makeProposalInstance>[] = [];
        for (const row of proposalStore.values()) {
          if (row.walletId === opts.where.walletId) {
            results.push(makeProposalInstance(row));
          }
        }
        return results;
      }),
    },
    MultiSigAuditLogModel: {
      create: vi.fn(async (data: Record<string, unknown>) => {
        auditStore.push(data);
        return data;
      }),
    },
  };
});

// ---------------------------------------------------------------------------
// Import service after mocks are established
// ---------------------------------------------------------------------------
import {
  createMultiSigWallet,
  createProposal,
  submitSignature,
  executeProposal,
  updateSigner,
  pauseWallet,
  unpauseWallet,
  getWallet,
  listProposals,
} from "./service.js";

const SIGNER_A = "GBSIGNER_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SIGNER_B = "GBSIGNER_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const SIGNER_C = "GBSIGNER_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

const DEFAULT_SIGNERS = [
  { address: SIGNER_A, weight: 1 },
  { address: SIGNER_B, weight: 1 },
  { address: SIGNER_C, weight: 1 },
];

beforeEach(() => {
  walletStore.clear();
  proposalStore.clear();
  auditStore.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Wallet creation
// ---------------------------------------------------------------------------

describe("createMultiSigWallet", () => {
  it("creates a wallet with valid signers and threshold", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    expect(wallet.id).toBeDefined();
    expect(wallet.signers).toHaveLength(3);
    expect(wallet.threshold).toBe(2);
    expect(wallet.paused).toBe(false);
    expect(wallet.nonce).toBe(0);
  });

  it("rejects fewer than 2 signers", async () => {
    await expect(
      createMultiSigWallet({
        signers: [{ address: SIGNER_A, weight: 1 }],
        threshold: 1,
      }),
    ).rejects.toThrow(/2–10 signers/);
  });

  it("rejects more than 10 signers", async () => {
    const signers = Array.from({ length: 11 }, (_, i) => ({
      address: `GBSIGNER_${i.toString().padStart(50, "0")}`,
      weight: 1,
    }));
    await expect(
      createMultiSigWallet({ signers, threshold: 5 }),
    ).rejects.toThrow(/2–10 signers/);
  });

  it("rejects threshold exceeding total weight", async () => {
    await expect(
      createMultiSigWallet({ signers: DEFAULT_SIGNERS, threshold: 10 }),
    ).rejects.toThrow(/Threshold must be between 1/);
  });

  it("rejects threshold of 0", async () => {
    await expect(
      createMultiSigWallet({ signers: DEFAULT_SIGNERS, threshold: 0 }),
    ).rejects.toThrow(/Threshold must be between 1/);
  });

  it("derives a deterministic address", async () => {
    const w1 = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    // Reset store and create again with same params
    walletStore.clear();
    vi.clearAllMocks();
    const w2 = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    expect(w1.address).toBe(w2.address);
  });

  it("stores addedAt on each signer", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    for (const signer of wallet.signers) {
      expect(signer.addedAt).toBeDefined();
      expect(new Date(signer.addedAt).getTime()).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Proposal creation
// ---------------------------------------------------------------------------

describe("createProposal", () => {
  it("creates a proposal for a signer", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    const proposal = await createProposal(wallet.id, {
      proposer: SIGNER_A,
      transaction: {
        contractId: "CCONTRACT",
        method: "transfer",
        args: [SIGNER_B, "1000"],
        memo: "Test transfer",
      },
    });
    expect(proposal.status).toBe("pending");
    expect(proposal.walletId).toBe(wallet.id);
    expect(proposal.proposer).toBe(SIGNER_A);
    expect(proposal.signatures).toHaveLength(0);
  });

  it("rejects a non-signer proposer", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    await expect(
      createProposal(wallet.id, {
        proposer: "GNONSIGNER",
        transaction: { contractId: "C", method: "m", args: [], memo: "x" },
      }),
    ).rejects.toThrow(/not a signer/);
  });

  it("rejects proposals on paused wallet", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    // manually set paused flag in store
    const row = walletStore.get(wallet.id)!;
    row.paused = true;
    await expect(
      createProposal(wallet.id, {
        proposer: SIGNER_A,
        transaction: { contractId: "C", method: "m", args: [], memo: "x" },
      }),
    ).rejects.toThrow(/paused/);
  });

  it("rejects a past expiresAt", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    const pastDate = new Date(Date.now() - 1000).toISOString();
    await expect(
      createProposal(wallet.id, {
        proposer: SIGNER_A,
        transaction: { contractId: "C", method: "m", args: [], memo: "x" },
        expiresAt: pastDate,
      }),
    ).rejects.toThrow(/future/);
  });
});

// ---------------------------------------------------------------------------
// Signature submission
// ---------------------------------------------------------------------------

describe("submitSignature", () => {
  it("accumulates signatures and advances to 'signed' when threshold met", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    const proposal = await createProposal(wallet.id, {
      proposer: SIGNER_A,
      transaction: { contractId: "C", method: "m", args: [], memo: "x" },
    });

    await submitSignature(wallet.id, proposal.id, {
      signer: SIGNER_A,
      signature: "sig_a",
    });
    const result = await submitSignature(wallet.id, proposal.id, {
      signer: SIGNER_B,
      signature: "sig_b",
    });

    expect(result.status).toBe("signed");
    expect(result.signatures).toHaveLength(2);
  });

  it("stays 'pending' when below threshold", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 3,
    });
    const proposal = await createProposal(wallet.id, {
      proposer: SIGNER_A,
      transaction: { contractId: "C", method: "m", args: [], memo: "x" },
    });

    const result = await submitSignature(wallet.id, proposal.id, {
      signer: SIGNER_A,
      signature: "sig_a",
    });

    expect(result.status).toBe("pending");
  });

  it("rejects a non-signer", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    const proposal = await createProposal(wallet.id, {
      proposer: SIGNER_A,
      transaction: { contractId: "C", method: "m", args: [], memo: "x" },
    });

    await expect(
      submitSignature(wallet.id, proposal.id, {
        signer: "GNONSIGNER",
        signature: "x",
      }),
    ).rejects.toThrow(/not a signer/);
  });

  it("prevents duplicate signatures from same signer", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    const proposal = await createProposal(wallet.id, {
      proposer: SIGNER_A,
      transaction: { contractId: "C", method: "m", args: [], memo: "x" },
    });

    await submitSignature(wallet.id, proposal.id, {
      signer: SIGNER_A,
      signature: "sig_a",
    });
    await expect(
      submitSignature(wallet.id, proposal.id, {
        signer: SIGNER_A,
        signature: "sig_a_dup",
      }),
    ).rejects.toThrow(/already signed/);
  });
});

// ---------------------------------------------------------------------------
// Proposal execution
// ---------------------------------------------------------------------------

describe("executeProposal", () => {
  it("executes a fully-signed proposal", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    const proposal = await createProposal(wallet.id, {
      proposer: SIGNER_A,
      transaction: { contractId: "C", method: "m", args: [], memo: "x" },
    });

    await submitSignature(wallet.id, proposal.id, {
      signer: SIGNER_A,
      signature: "sig_a",
    });
    await submitSignature(wallet.id, proposal.id, {
      signer: SIGNER_B,
      signature: "sig_b",
    });

    const executed = await executeProposal(wallet.id, proposal.id, SIGNER_A);
    expect(executed.status).toBe("executed");
    expect(executed.executionHash).toBeDefined();
    expect(executed.executedAt).toBeDefined();
  });

  it("rejects execution of pending (unsigned) proposal", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    const proposal = await createProposal(wallet.id, {
      proposer: SIGNER_A,
      transaction: { contractId: "C", method: "m", args: [], memo: "x" },
    });

    await expect(
      executeProposal(wallet.id, proposal.id, SIGNER_A),
    ).rejects.toThrow(/'signed' status/);
  });

  it("blocks execution on paused wallet", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    const proposal = await createProposal(wallet.id, {
      proposer: SIGNER_A,
      transaction: { contractId: "C", method: "m", args: [], memo: "x" },
    });
    await submitSignature(wallet.id, proposal.id, {
      signer: SIGNER_A,
      signature: "sig_a",
    });
    await submitSignature(wallet.id, proposal.id, {
      signer: SIGNER_B,
      signature: "sig_b",
    });

    const row = walletStore.get(wallet.id)!;
    row.paused = true;

    await expect(
      executeProposal(wallet.id, proposal.id, SIGNER_A),
    ).rejects.toThrow(/paused/);
  });
});

// ---------------------------------------------------------------------------
// Signer management
// ---------------------------------------------------------------------------

describe("updateSigner", () => {
  it("adds a new signer", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    const SIGNER_D =
      "GBSIGNER_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";
    const updated = await updateSigner(wallet.id, {
      action: "add",
      address: SIGNER_D,
      weight: 1,
      proposedBy: SIGNER_A,
    });
    expect(updated.signers).toHaveLength(4);
    expect(updated.signers.some((s) => s.address === SIGNER_D)).toBe(true);
  });

  it("removes an existing signer", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    const updated = await updateSigner(wallet.id, {
      action: "remove",
      address: SIGNER_C,
      weight: 0,
      proposedBy: SIGNER_A,
    });
    expect(updated.signers).toHaveLength(2);
    expect(updated.signers.some((s) => s.address === SIGNER_C)).toBe(false);
  });

  it("updates a signer weight", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    const updated = await updateSigner(wallet.id, {
      action: "update_weight",
      address: SIGNER_A,
      weight: 3,
      proposedBy: SIGNER_A,
    });
    const signer = updated.signers.find((s) => s.address === SIGNER_A);
    expect(signer?.weight).toBe(3);
  });

  it("rejects removing below minimum signer count", async () => {
    const wallet = await createMultiSigWallet({
      signers: [
        { address: SIGNER_A, weight: 1 },
        { address: SIGNER_B, weight: 1 },
      ],
      threshold: 1,
    });
    await expect(
      updateSigner(wallet.id, {
        action: "remove",
        address: SIGNER_B,
        weight: 0,
        proposedBy: SIGNER_A,
      }),
    ).rejects.toThrow(/at least 2 signers/);
  });

  it("rejects weight update that breaks threshold", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 3,
    });
    // Reduce weight of SIGNER_A to 0 effectively
    await expect(
      updateSigner(wallet.id, {
        action: "update_weight",
        address: SIGNER_A,
        weight: 0,
        proposedBy: SIGNER_A,
      }),
    ).rejects.toThrow(/positive integer|threshold/);
  });
});

// ---------------------------------------------------------------------------
// Pause / unpause
// ---------------------------------------------------------------------------

describe("pauseWallet / unpauseWallet", () => {
  it("pauses and unpauses a wallet", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });

    const paused = await pauseWallet(wallet.id, SIGNER_A);
    expect(paused.paused).toBe(true);

    const unpaused = await unpauseWallet(wallet.id, SIGNER_A);
    expect(unpaused.paused).toBe(false);
  });

  it("rejects double-pause", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    await pauseWallet(wallet.id, SIGNER_A);
    await expect(pauseWallet(wallet.id, SIGNER_A)).rejects.toThrow(
      /already paused/,
    );
  });

  it("rejects unpause on active wallet", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    await expect(unpauseWallet(wallet.id, SIGNER_A)).rejects.toThrow(
      /not paused/,
    );
  });
});

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

describe("getWallet / listProposals", () => {
  it("throws on missing wallet", async () => {
    await expect(getWallet("non-existent-id")).rejects.toThrow(/not found/);
  });

  it("lists proposals for a wallet", async () => {
    const wallet = await createMultiSigWallet({
      signers: DEFAULT_SIGNERS,
      threshold: 2,
    });
    await createProposal(wallet.id, {
      proposer: SIGNER_A,
      transaction: { contractId: "C", method: "m", args: [], memo: "x" },
    });
    await createProposal(wallet.id, {
      proposer: SIGNER_B,
      transaction: { contractId: "C2", method: "m2", args: [], memo: "y" },
    });
    const proposals = await listProposals(wallet.id);
    expect(proposals.length).toBeGreaterThanOrEqual(2);
  });
});
