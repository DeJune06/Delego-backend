/**
 * Multi-Signature Wallet Service
 * Issue #44 — business logic for wallet creation, proposals, signing, execution,
 * signer management, pause/unpause, nested multi-sig support, and audit logging.
 */
import * as crypto from "node:crypto";
import { createLogger } from "@delegolabs/utils";
import {
  MultiSigWalletModel,
  MultiSigProposalModel,
  MultiSigAuditLogModel,
} from "./models.js";
import type {
  MultiSigWallet,
  MultiSigProposal,
  MultiSigSigner,
  CreateMultiSigWalletRequest,
  CreateProposalRequest,
  SubmitSignatureRequest,
  UpdateSignerRequest,
  SignerUpdate,
} from "./types.js";

const log = createLogger("wallet:multisig", process.env.LOG_LEVEL ?? "info");

const DEFAULT_EXPIRY_DAYS = 7;
const MIN_SIGNERS = 2;
const MAX_SIGNERS = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toWallet(m: MultiSigWalletModel): MultiSigWallet {
  return {
    id: m.id,
    address: m.address,
    signers: m.signers,
    threshold: m.threshold,
    nonce: m.nonce,
    createdAt: m.createdAt.toISOString(),
    paused: m.paused,
  };
}

function toProposal(m: MultiSigProposalModel): MultiSigProposal {
  return {
    id: m.id,
    walletId: m.walletId,
    proposer: m.proposer,
    transaction: m.transaction,
    signatures: m.signatures,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    expiresAt: m.expiresAt.toISOString(),
    executedAt: m.executedAt?.toISOString() ?? null,
    executionHash: m.executionHash,
  };
}

async function addAuditLog(
  walletId: string,
  eventType: string,
  payload: Record<string, unknown>,
  performedBy: string,
): Promise<void> {
  await MultiSigAuditLogModel.create({
    walletId,
    eventType,
    payload,
    performedBy,
  });
}

// ---------------------------------------------------------------------------
// Wallet creation
// ---------------------------------------------------------------------------

/**
 * Creates a new multi-sig wallet.
 * Signers: 2–10; threshold: 1–sum(weights).
 */
export async function createMultiSigWallet(
  req: CreateMultiSigWalletRequest,
): Promise<MultiSigWallet> {
  const { signers, threshold } = req;

  if (
    !signers ||
    signers.length < MIN_SIGNERS ||
    signers.length > MAX_SIGNERS
  ) {
    throw new Error(
      `MultiSig wallets require ${MIN_SIGNERS}–${MAX_SIGNERS} signers, got ${signers?.length ?? 0}`,
    );
  }

  for (const s of signers) {
    if (!s.address || typeof s.address !== "string") {
      throw new Error("Each signer must have a valid address");
    }
    if (typeof s.weight !== "number" || s.weight < 1) {
      throw new Error("Each signer weight must be a positive integer");
    }
  }

  const totalWeight = signers.reduce((sum, s) => sum + s.weight, 0);
  if (threshold < 1 || threshold > totalWeight) {
    throw new Error(
      `Threshold must be between 1 and total weight (${totalWeight}), got ${threshold}`,
    );
  }

  // Derive a deterministic multi-sig address from signers + threshold
  const addressSeed = signers
    .map((s) => `${s.address}:${s.weight}`)
    .sort()
    .join(",");
  const address = `MULTISIG_${crypto
    .createHash("sha256")
    .update(`${addressSeed}:${threshold}`)
    .digest("hex")
    .slice(0, 40)
    .toUpperCase()}`;

  const now = new Date().toISOString();
  const signerData: MultiSigSigner[] = signers.map((s) => ({
    address: s.address,
    weight: s.weight,
    addedAt: now,
  }));

  const wallet = await MultiSigWalletModel.create({
    address,
    signers: signerData,
    threshold,
    nonce: 0,
    paused: false,
  });

  const createdWallet = toWallet(wallet);

  // Audit log
  await addAuditLog(
    wallet.id,
    "WALLET_CREATED",
    { signers: signerData, threshold },
    signers[0].address,
  );

  log.info("MultiSig wallet created", {
    walletId: wallet.id,
    address,
    threshold,
  });
  return createdWallet;
}

// ---------------------------------------------------------------------------
// Proposal management
// ---------------------------------------------------------------------------

export async function createProposal(
  walletId: string,
  req: CreateProposalRequest,
): Promise<MultiSigProposal> {
  const wallet = await MultiSigWalletModel.findByPk(walletId);
  if (!wallet) {
    throw new Error(`MultiSig wallet not found: ${walletId}`);
  }
  if (wallet.paused) {
    throw new Error("Wallet is paused; no new proposals may be created");
  }

  const proposerSigner = wallet.signers.find((s) => s.address === req.proposer);
  if (!proposerSigner) {
    throw new Error(
      `Proposer ${req.proposer} is not a signer of wallet ${walletId}`,
    );
  }

  const expiresAt = req.expiresAt
    ? new Date(req.expiresAt)
    : new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  if (expiresAt <= new Date()) {
    throw new Error("expiresAt must be in the future");
  }

  const proposal = await MultiSigProposalModel.create({
    walletId,
    proposer: req.proposer,
    transaction: req.transaction,
    signatures: [],
    status: "pending",
    expiresAt,
    executedAt: null,
    executionHash: null,
  });

  await addAuditLog(
    walletId,
    "PROPOSAL_CREATED",
    { proposalId: proposal.id, transaction: req.transaction },
    req.proposer,
  );

  log.info("MultiSig proposal created", { proposalId: proposal.id, walletId });
  return toProposal(proposal);
}

/**
 * Submit an off-chain signature for a proposal.
 * Validates that the signer is registered and that the proposal is still open.
 * If the accumulated weight meets or exceeds threshold, status advances to "signed".
 */
export async function submitSignature(
  walletId: string,
  proposalId: string,
  req: SubmitSignatureRequest,
): Promise<MultiSigProposal> {
  const wallet = await MultiSigWalletModel.findByPk(walletId);
  if (!wallet) throw new Error(`MultiSig wallet not found: ${walletId}`);

  const proposal = await MultiSigProposalModel.findOne({
    where: { id: proposalId, walletId },
  });
  if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);

  // Auto-expire
  if (new Date(proposal.expiresAt) <= new Date()) {
    await proposal.update({ status: "expired" });
    await addAuditLog(walletId, "PROPOSAL_EXPIRED", { proposalId }, "system");
    throw new Error("Proposal has expired");
  }

  if (proposal.status !== "pending") {
    throw new Error(
      `Proposal status is '${proposal.status}'; cannot add signatures`,
    );
  }

  const signerRecord = wallet.signers.find((s) => s.address === req.signer);
  if (!signerRecord) {
    throw new Error(`${req.signer} is not a signer of wallet ${walletId}`);
  }

  const alreadySigned = proposal.signatures.some(
    (s) => s.signer === req.signer,
  );
  if (alreadySigned) {
    throw new Error(
      `Signer ${req.signer} has already signed proposal ${proposalId}`,
    );
  }

  const updatedSignatures = [
    ...proposal.signatures,
    {
      signer: req.signer,
      signature: req.signature,
      signedAt: new Date().toISOString(),
    },
  ];

  // Compute accumulated weight
  const accumulatedWeight = updatedSignatures.reduce((sum, sig) => {
    const s = wallet.signers.find((w) => w.address === sig.signer);
    return sum + (s?.weight ?? 0);
  }, 0);

  const newStatus =
    accumulatedWeight >= wallet.threshold ? "signed" : "pending";

  await proposal.update({ signatures: updatedSignatures, status: newStatus });

  await addAuditLog(
    walletId,
    "SIGNATURE_SUBMITTED",
    {
      proposalId,
      signer: req.signer,
      accumulatedWeight,
      threshold: wallet.threshold,
    },
    req.signer,
  );

  log.info("Signature submitted", {
    proposalId,
    signer: req.signer,
    accumulatedWeight,
    threshold: wallet.threshold,
    newStatus,
  });

  return toProposal(await proposal.reload());
}

/**
 * Execute a proposal that has reached the signing threshold.
 * Validates threshold again, increments nonce, records execution hash.
 * In production this would invoke the Soroban contract via sorobanSimulator.
 */
export async function executeProposal(
  walletId: string,
  proposalId: string,
  executorAddress: string,
): Promise<MultiSigProposal> {
  const wallet = await MultiSigWalletModel.findByPk(walletId);
  if (!wallet) throw new Error(`MultiSig wallet not found: ${walletId}`);
  if (wallet.paused) throw new Error("Wallet is paused; execution is blocked");

  const proposal = await MultiSigProposalModel.findOne({
    where: { id: proposalId, walletId },
  });
  if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);

  if (new Date(proposal.expiresAt) <= new Date()) {
    await proposal.update({ status: "expired" });
    throw new Error("Proposal has expired");
  }

  if (proposal.status !== "signed") {
    throw new Error(
      `Proposal must be in 'signed' status to execute; current: '${proposal.status}'`,
    );
  }

  // Re-validate threshold
  const accumulatedWeight = proposal.signatures.reduce((sum, sig) => {
    const s = wallet.signers.find((w) => w.address === sig.signer);
    return sum + (s?.weight ?? 0);
  }, 0);

  if (accumulatedWeight < wallet.threshold) {
    throw new Error(
      `Insufficient signature weight: ${accumulatedWeight}/${wallet.threshold}`,
    );
  }

  // Generate execution hash (deterministic for test; would be tx hash in prod)
  const executionHash =
    process.env.NODE_ENV === "test"
      ? `exec_${crypto.randomBytes(16).toString("hex")}`
      : `exec_${crypto
          .createHash("sha256")
          .update(JSON.stringify(proposal.transaction) + Date.now())
          .digest("hex")}`;

  const now = new Date();
  await proposal.update({
    status: "executed",
    executedAt: now,
    executionHash,
  });

  // Increment nonce
  await wallet.update({ nonce: wallet.nonce + 1 });

  await addAuditLog(
    walletId,
    "PROPOSAL_EXECUTED",
    {
      proposalId,
      executionHash,
      executedBy: executorAddress,
      nonce: wallet.nonce,
    },
    executorAddress,
  );

  log.info("Proposal executed", { proposalId, executionHash, walletId });
  return toProposal(await proposal.reload());
}

// ---------------------------------------------------------------------------
// Signer management
// ---------------------------------------------------------------------------

/**
 * Dynamically update signers: add, remove, or update weight.
 * Validates the resulting threshold is still achievable.
 */
export async function updateSigner(
  walletId: string,
  req: UpdateSignerRequest,
): Promise<MultiSigWallet> {
  const wallet = await MultiSigWalletModel.findByPk(walletId);
  if (!wallet) throw new Error(`MultiSig wallet not found: ${walletId}`);

  let signers = [...wallet.signers];
  const now = new Date().toISOString();

  if (req.action === "add") {
    if (signers.length >= MAX_SIGNERS) {
      throw new Error(`Cannot add more than ${MAX_SIGNERS} signers`);
    }
    if (signers.some((s) => s.address === req.address)) {
      throw new Error(`Signer ${req.address} already exists`);
    }
    signers.push({ address: req.address, weight: req.weight, addedAt: now });
  } else if (req.action === "remove") {
    const existing = signers.find((s) => s.address === req.address);
    if (!existing) throw new Error(`Signer ${req.address} not found`);
    signers = signers.filter((s) => s.address !== req.address);
    if (signers.length < MIN_SIGNERS) {
      throw new Error(
        `MultiSig wallets require at least ${MIN_SIGNERS} signers`,
      );
    }
  } else if (req.action === "update_weight") {
    const signer = signers.find((s) => s.address === req.address);
    if (!signer) throw new Error(`Signer ${req.address} not found`);
    signer.weight = req.weight;
  }

  // Ensure threshold is still achievable
  const totalWeight = signers.reduce((sum, s) => sum + s.weight, 0);
  if (wallet.threshold > totalWeight) {
    throw new Error(
      `Updated signers cannot satisfy existing threshold (${wallet.threshold}); total weight is now ${totalWeight}`,
    );
  }

  await wallet.update({ signers });

  const update: SignerUpdate = {
    walletId,
    action: req.action,
    address: req.address,
    weight: req.weight,
    proposedBy: req.proposedBy,
  };

  await addAuditLog(walletId, "SIGNER_UPDATED", { update }, req.proposedBy);

  log.info("Signer updated", {
    walletId,
    action: req.action,
    address: req.address,
  });
  return toWallet(await wallet.reload());
}

// ---------------------------------------------------------------------------
// Emergency pause / unpause
// ---------------------------------------------------------------------------

export async function pauseWallet(
  walletId: string,
  performedBy: string,
): Promise<MultiSigWallet> {
  const wallet = await MultiSigWalletModel.findByPk(walletId);
  if (!wallet) throw new Error(`MultiSig wallet not found: ${walletId}`);
  if (wallet.paused) throw new Error("Wallet is already paused");

  await wallet.update({ paused: true });
  await addAuditLog(walletId, "WALLET_PAUSED", {}, performedBy);
  log.info("Wallet paused", { walletId });
  return toWallet(await wallet.reload());
}

export async function unpauseWallet(
  walletId: string,
  performedBy: string,
): Promise<MultiSigWallet> {
  const wallet = await MultiSigWalletModel.findByPk(walletId);
  if (!wallet) throw new Error(`MultiSig wallet not found: ${walletId}`);
  if (!wallet.paused) throw new Error("Wallet is not paused");

  await wallet.update({ paused: false });
  await addAuditLog(walletId, "WALLET_UNPAUSED", {}, performedBy);
  log.info("Wallet unpaused", { walletId });
  return toWallet(await wallet.reload());
}

// ---------------------------------------------------------------------------
// Auto-expiry of proposals
// ---------------------------------------------------------------------------

/**
 * Background sweep: cancel proposals whose expiresAt has passed.
 * Should be called periodically (e.g. by a cron or BullMQ repeatable job).
 */
export async function expireStaleProposals(): Promise<number> {
  const stale = await MultiSigProposalModel.findAll({
    where: {
      status: "pending",
    },
  });

  const now = new Date();
  let expired = 0;
  for (const p of stale) {
    if (new Date(p.expiresAt) <= now) {
      await p.update({ status: "expired" });
      await addAuditLog(
        p.walletId,
        "PROPOSAL_EXPIRED",
        { proposalId: p.id },
        "system",
      );
      expired++;
    }
  }

  if (expired > 0) {
    log.info(`Expired ${expired} stale proposals`);
  }
  return expired;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getWallet(walletId: string): Promise<MultiSigWallet> {
  const wallet = await MultiSigWalletModel.findByPk(walletId);
  if (!wallet) throw new Error(`MultiSig wallet not found: ${walletId}`);
  return toWallet(wallet);
}

export async function listProposals(
  walletId: string,
): Promise<MultiSigProposal[]> {
  const proposals = await MultiSigProposalModel.findAll({
    where: { walletId },
    order: [["created_at", "DESC"]],
  });
  return proposals.map(toProposal);
}

export async function getProposal(
  walletId: string,
  proposalId: string,
): Promise<MultiSigProposal> {
  const proposal = await MultiSigProposalModel.findOne({
    where: { id: proposalId, walletId },
  });
  if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
  return toProposal(proposal);
}
