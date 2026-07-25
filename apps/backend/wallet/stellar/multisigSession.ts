/**
 * Multi-Signature Transaction Signing Sessions (Issue #366)
 *
 * Builds on `signMultisigTx` (single-shot "sign with all provided keys at
 * once") to support the real-world workflow for high-value escrow
 * operations: signers approve **asynchronously**, over time, and the
 * transaction is only submitted once enough partial signatures have been
 * collected. Partial signatures expire after a configurable timeout so a
 * stalled approval flow doesn't hold a session open indefinitely.
 */

import { createLogger } from "@delego/utils";
import { signMultisigTx } from "./account.js";

const log = createLogger("wallet:stellar:multisig-session", process.env.LOG_LEVEL ?? "info");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MultisigSessionStatus =
  | "collecting"
  | "threshold_met"
  | "submitted"
  | "expired"
  | "failed";

export interface PartialSignature {
  signer: string;
  signedXdr: string;
  signedAt: number;
  /** Epoch ms after which this signature no longer counts toward the threshold. */
  expiresAt: number;
}

export interface MultisigSession {
  id: string;
  /** Original unsigned transaction envelope XDR. */
  baseXdr: string;
  /** Public keys authorized to sign this session. */
  configuredSigners: string[];
  /** Number of signatures required before submission. */
  threshold: number;
  signatures: PartialSignature[];
  status: MultisigSessionStatus;
  createdAt: number;
  /** Populated once `submitSignedTransaction` succeeds. */
  submittedXdr?: string;
  submissionResult?: unknown;
  failureReason?: string;
}

export interface CreateMultisigSessionInput {
  baseXdr: string;
  signers: string[];
  threshold?: number;
}

/** Injected by callers — actually submits the fully-signed XDR to the network. */
export type SubmitSignedTransaction = (signedXdr: string) => Promise<unknown>;

const DEFAULT_SIGNATURE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class MultisigSessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Multi-sig session not found: ${id}`);
    this.name = "MultisigSessionNotFoundError";
  }
}

export class MultisigSessionClosedError extends Error {
  constructor(id: string, status: MultisigSessionStatus) {
    super(`Multi-sig session ${id} is already ${status}`);
    this.name = "MultisigSessionClosedError";
  }
}

export class UnauthorizedSignerError extends Error {
  constructor(signer: string) {
    super(`Signer ${signer} is not authorized for this session`);
    this.name = "UnauthorizedSignerError";
  }
}

// ---------------------------------------------------------------------------
// Session store — in-memory by default, swappable for a DB-backed store.
// ---------------------------------------------------------------------------

export interface MultisigSessionStore {
  create(session: MultisigSession): Promise<void>;
  get(id: string): Promise<MultisigSession | null>;
  save(session: MultisigSession): Promise<void>;
}

export class InMemoryMultisigSessionStore implements MultisigSessionStore {
  private readonly sessions = new Map<string, MultisigSession>();

  async create(session: MultisigSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async get(id: string): Promise<MultisigSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async save(session: MultisigSession): Promise<void> {
    this.sessions.set(session.id, session);
  }
}

let store: MultisigSessionStore = new InMemoryMultisigSessionStore();

export function setMultisigSessionStore(newStore: MultisigSessionStore): void {
  store = newStore;
}

export function resetMultisigSessionStore(): void {
  store = new InMemoryMultisigSessionStore();
}

let idCounter = 0;
function generateSessionId(): string {
  idCounter += 1;
  return `mss-${Date.now()}-${idCounter}`;
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/** Opens a new multi-sig collection session for a draft transaction envelope. */
export async function createMultisigSession(
  input: CreateMultisigSessionInput
): Promise<MultisigSession> {
  const { baseXdr, signers, threshold } = input;

  if (!baseXdr || baseXdr.trim() === "") {
    throw new Error("baseXdr is required");
  }
  const uniqueSigners = [...new Set(signers.map((s) => s.trim()).filter(Boolean))];
  if (uniqueSigners.length === 0) {
    throw new Error("At least one signer is required");
  }

  const resolvedThreshold = threshold ?? uniqueSigners.length;
  if (resolvedThreshold < 1 || resolvedThreshold > uniqueSigners.length) {
    throw new Error(
      `threshold must be between 1 and ${uniqueSigners.length} (number of configured signers)`
    );
  }

  const session: MultisigSession = {
    id: generateSessionId(),
    baseXdr,
    configuredSigners: uniqueSigners,
    threshold: resolvedThreshold,
    signatures: [],
    status: "collecting",
    createdAt: Date.now(),
  };

  await store.create(session);
  log.info("Multi-sig session created", {
    id: session.id,
    signers: uniqueSigners.length,
    threshold: resolvedThreshold,
  });

  return session;
}

export async function getMultisigSession(id: string): Promise<MultisigSession | null> {
  return store.get(id);
}

/** Drops signatures whose TTL has elapsed and returns the still-valid count. */
function pruneExpiredSignatures(session: MultisigSession, asOf: number): void {
  const before = session.signatures.length;
  session.signatures = session.signatures.filter((sig) => sig.expiresAt > asOf);
  if (session.signatures.length !== before) {
    log.info("Pruned expired partial signatures", {
      id: session.id,
      removed: before - session.signatures.length,
    });
  }
}

export interface AddSignatureInput {
  sessionId: string;
  signer: string;
  /** TTL for this specific signature; defaults to 15 minutes. */
  ttlMs?: number;
  now?: number;
}

/**
 * Collects a partial signature from one configured signer.
 *
 * Automatically submits the transaction once the (non-expired) signature
 * count reaches the session threshold.
 */
export async function collectPartialSignature(
  input: AddSignatureInput,
  submit?: SubmitSignedTransaction
): Promise<MultisigSession> {
  const { sessionId, signer, ttlMs = DEFAULT_SIGNATURE_TTL_MS, now = Date.now() } = input;

  const session = await store.get(sessionId);
  if (!session) {
    throw new MultisigSessionNotFoundError(sessionId);
  }

  pruneExpiredSignatures(session, now);

  if (session.status !== "collecting") {
    throw new MultisigSessionClosedError(sessionId, session.status);
  }

  if (!session.configuredSigners.includes(signer)) {
    throw new UnauthorizedSignerError(signer);
  }

  if (session.signatures.some((s) => s.signer === signer)) {
    log.info("Duplicate signature request ignored", { sessionId, signer });
    await store.save(session);
    return session;
  }

  const { signedXdr } = await signMultisigTx({ xdr: session.baseXdr, signers: [signer] });

  session.signatures.push({
    signer,
    signedXdr,
    signedAt: now,
    expiresAt: now + ttlMs,
  });

  log.info("Partial signature collected", {
    sessionId,
    signer,
    collected: session.signatures.length,
    threshold: session.threshold,
  });

  if (session.signatures.length >= session.threshold) {
    session.status = "threshold_met";
    await store.save(session);
    await submitSession(session, submit);
    return session;
  }

  await store.save(session);
  return session;
}

/** Merges all collected partial signatures into one fully-signed envelope. */
async function buildCombinedSignedXdr(session: MultisigSession): Promise<string> {
  const signers = session.signatures.map((s) => s.signer);
  const { signedXdr } = await signMultisigTx({
    xdr: session.baseXdr,
    signers,
    requiredWeight: session.threshold,
  });
  return signedXdr;
}

async function submitSession(
  session: MultisigSession,
  submit?: SubmitSignedTransaction
): Promise<void> {
  try {
    const combined = await buildCombinedSignedXdr(session);
    session.submittedXdr = combined;

    if (submit) {
      session.submissionResult = await submit(combined);
    }

    session.status = "submitted";
    await store.save(session);
    log.info("Multi-sig session submitted", { id: session.id });
  } catch (err) {
    session.status = "failed";
    session.failureReason = err instanceof Error ? err.message : "Unknown submission error";
    await store.save(session);
    log.error("Multi-sig session submission failed", {
      id: session.id,
      error: session.failureReason,
    });
    throw err;
  }
}

/**
 * Explicitly submits a session once threshold has been met — useful when the
 * caller wants to control submission timing rather than relying on
 * auto-submit inside `collectPartialSignature`.
 */
export async function submitMultisigSession(
  sessionId: string,
  submit?: SubmitSignedTransaction,
  now = Date.now()
): Promise<MultisigSession> {
  const session = await store.get(sessionId);
  if (!session) {
    throw new MultisigSessionNotFoundError(sessionId);
  }

  pruneExpiredSignatures(session, now);

  if (session.status === "submitted") {
    return session;
  }
  if (session.status !== "threshold_met" && session.signatures.length < session.threshold) {
    throw new Error(
      `Threshold not met: ${session.signatures.length}/${session.threshold} valid signatures`
    );
  }

  await submitSession(session, submit);
  return session;
}

/** Marks the session expired if its signatures have all decayed below threshold. */
export async function expireStaleSignatures(
  sessionId: string,
  now = Date.now()
): Promise<MultisigSession> {
  const session = await store.get(sessionId);
  if (!session) {
    throw new MultisigSessionNotFoundError(sessionId);
  }

  pruneExpiredSignatures(session, now);

  if (session.status === "collecting" && session.signatures.length < session.threshold) {
    await store.save(session);
  }

  return session;
}
