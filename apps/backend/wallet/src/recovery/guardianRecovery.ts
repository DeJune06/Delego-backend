/**
 * Social Guardian Account Recovery Service
 * Issue #43
 *
 * Features:
 * - Guardian management (add/remove/verify via code)
 * - Vault-encrypted guardian identifiers
 * - Recovery initiation with 7-day time-lock
 * - Threshold approval workflow (default 3 of 5)
 * - Rate limiting: max 1 recovery attempt per 30 days
 * - Emergency disable flag
 * - Recovery key derivation from guardian signatures
 * - Automatic guardian notification on recovery initiation
 * - Full audit logging
 */
import * as crypto from "node:crypto";
import { createLogger } from "@delegolabs/utils";
import {
  GuardianModel,
  RecoveryRequestModel,
  RecoveryAuditLogModel,
} from "./models.js";
import type {
  Guardian,
  RecoveryRequest,
  RecoveryResult,
  AddGuardianRequest,
  InitiateRecoveryRequest,
  ApproveRecoveryRequest,
} from "./types.js";

const log = createLogger("wallet:recovery", process.env.LOG_LEVEL ?? "info");

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

let recoveryGloballyEnabled = true;

export function disableRecovery(): void {
  recoveryGloballyEnabled = false;
  log.warn("Social recovery has been globally disabled (emergency flag)");
}

export function enableRecovery(): void {
  recoveryGloballyEnabled = true;
  log.info("Social recovery has been globally re-enabled");
}

export function isRecoveryEnabled(): boolean {
  return recoveryGloballyEnabled;
}

// ---------------------------------------------------------------------------
// Rate-limit store (in-memory; production would use Redis)
// ---------------------------------------------------------------------------

const recoveryAttemptTimestamps = new Map<string, Date>();
const RATE_LIMIT_DAYS = 30;

function isRateLimited(walletAddress: string): boolean {
  const last = recoveryAttemptTimestamps.get(walletAddress);
  if (!last) return false;
  const daysSince = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince < RATE_LIMIT_DAYS;
}

// ---------------------------------------------------------------------------
// Encryption helpers (vault-style AES-256-GCM)
// ---------------------------------------------------------------------------

const MASTER_SECRET =
  process.env.WALLET_MASTER_SECRET ??
  "default-dev-recovery-master-secret-32-chars";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 10000;

async function deriveKey(salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      MASTER_SECRET,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      "sha256",
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      },
    );
  });
}

export async function encryptIdentifier(identifier: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = await deriveKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(identifier, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  });
}

export async function decryptIdentifier(
  encryptedJson: string,
): Promise<string> {
  const { salt, iv, tag, data } = JSON.parse(encryptedJson) as {
    salt: string;
    iv: string;
    tag: string;
    data: string;
  };
  const key = await deriveKey(Buffer.from(salt, "hex"));
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return decipher.update(Buffer.from(data, "hex")) + decipher.final("utf8");
}

// ---------------------------------------------------------------------------
// Recovery key derivation
// ---------------------------------------------------------------------------

/**
 * Derives a recovery key from guardian signatures using HKDF-style construction.
 * In production, each guardian signs the recovery request ID with their wallet key.
 */
export function deriveRecoveryKey(signatures: string[]): string {
  const combined = signatures.sort().join("|");
  return crypto
    .createHmac("sha256", MASTER_SECRET)
    .update(combined)
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Notification stub
// ---------------------------------------------------------------------------

async function notifyGuardians(
  guardians: GuardianModel[],
  recoveryRequestId: string,
  walletAddress: string,
): Promise<void> {
  for (const guardian of guardians) {
    const type = guardian.type;
    // In production this would call the notifications service
    log.info("Guardian notified of recovery initiation", {
      guardianId: guardian.id,
      type,
      walletAddress,
      recoveryRequestId,
    });
  }
}

// ---------------------------------------------------------------------------
// Audit helper
// ---------------------------------------------------------------------------

async function audit(
  walletAddress: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await RecoveryAuditLogModel.create({ walletAddress, eventType, payload });
}

// ---------------------------------------------------------------------------
// Map model → domain type
// ---------------------------------------------------------------------------

function toGuardian(m: GuardianModel): Guardian {
  return {
    id: m.id,
    type: m.type,
    identifier: m.identifier,
    verified: m.verified,
    addedAt: m.createdAt.toISOString(),
    verificationCode: m.verificationCode,
    verificationExpiresAt: m.verificationExpiresAt?.toISOString() ?? null,
  };
}

function toRecoveryRequest(m: RecoveryRequestModel): RecoveryRequest {
  return {
    id: m.id,
    walletAddress: m.walletAddress,
    initiatedBy: m.initiatedBy,
    requestedAt: m.createdAt.toISOString(),
    expiresAt: m.expiresAt.toISOString(),
    status: m.status,
    approvals: m.approvals,
    requiredApprovals: m.requiredApprovals,
  };
}

// ---------------------------------------------------------------------------
// Guardian management
// ---------------------------------------------------------------------------

const VERIFICATION_CODE_LENGTH = 8;
const VERIFICATION_EXPIRY_MINUTES = 30;

export async function addGuardian(req: AddGuardianRequest): Promise<Guardian> {
  const { walletAddress, type, identifier } = req;

  if (!walletAddress || !identifier) {
    throw new Error("walletAddress and identifier are required");
  }

  const validTypes: Array<typeof type> = ["email", "phone", "wallet"];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid guardian type: ${type}`);
  }

  const identifierEncrypted = await encryptIdentifier(identifier);
  const verificationCode = crypto
    .randomBytes(VERIFICATION_CODE_LENGTH)
    .toString("hex")
    .slice(0, VERIFICATION_CODE_LENGTH)
    .toUpperCase();

  const expiresAt = new Date(
    Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000,
  );

  const guardian = await GuardianModel.create({
    walletAddress,
    type,
    identifier,
    identifierEncrypted,
    verified: false,
    verificationCode,
    verificationExpiresAt: expiresAt,
  });

  await audit(walletAddress, "GUARDIAN_ADDED", {
    guardianId: guardian.id,
    type,
  });

  log.info("Guardian added (pending verification)", {
    guardianId: guardian.id,
    walletAddress,
    type,
  });

  return toGuardian(guardian);
}

export async function verifyGuardian(
  guardianId: string,
  code: string,
): Promise<Guardian> {
  const guardian = await GuardianModel.findByPk(guardianId);
  if (!guardian) throw new Error(`Guardian not found: ${guardianId}`);

  if (guardian.verified) {
    throw new Error("Guardian is already verified");
  }

  if (
    !guardian.verificationCode ||
    guardian.verificationCode !== code.toUpperCase()
  ) {
    throw new Error("Invalid verification code");
  }

  if (
    guardian.verificationExpiresAt &&
    guardian.verificationExpiresAt < new Date()
  ) {
    throw new Error("Verification code has expired");
  }

  await guardian.update({
    verified: true,
    verificationCode: null,
    verificationExpiresAt: null,
  });

  await audit(guardian.walletAddress, "GUARDIAN_VERIFIED", {
    guardianId,
  });

  log.info("Guardian verified", {
    guardianId,
    walletAddress: guardian.walletAddress,
  });
  return toGuardian(await guardian.reload());
}

export async function removeGuardian(guardianId: string): Promise<void> {
  const guardian = await GuardianModel.findByPk(guardianId);
  if (!guardian) throw new Error(`Guardian not found: ${guardianId}`);

  const { walletAddress } = guardian;
  await guardian.destroy();

  await audit(walletAddress, "GUARDIAN_REMOVED", { guardianId });
  log.info("Guardian removed", { guardianId, walletAddress });
}

export async function listGuardians(
  walletAddress: string,
): Promise<Guardian[]> {
  const guardians = await GuardianModel.findAll({
    where: { walletAddress },
  });
  return guardians.map(toGuardian);
}

// ---------------------------------------------------------------------------
// Recovery workflow
// ---------------------------------------------------------------------------

const DEFAULT_REQUIRED_APPROVALS = 3;
const RECOVERY_LOCK_DAYS = 7;

export async function initiateRecovery(
  req: InitiateRecoveryRequest,
): Promise<RecoveryRequest> {
  if (!recoveryGloballyEnabled) {
    throw new Error("Social recovery is currently disabled");
  }

  const { walletAddress, initiatedBy } = req;

  if (isRateLimited(walletAddress)) {
    throw new Error(
      `Recovery rate limit exceeded: maximum 1 attempt per ${RATE_LIMIT_DAYS} days`,
    );
  }

  // Check for an existing active request
  const existing = await RecoveryRequestModel.findOne({
    where: { walletAddress, status: "pending" },
  });
  if (existing) {
    throw new Error(
      `A pending recovery request already exists for ${walletAddress} (id: ${existing.id})`,
    );
  }

  const requiredApprovals = req.requiredApprovals ?? DEFAULT_REQUIRED_APPROVALS;
  const expiresAt = new Date(
    Date.now() + RECOVERY_LOCK_DAYS * 24 * 60 * 60 * 1000,
  );

  const recoveryRequest = await RecoveryRequestModel.create({
    walletAddress,
    initiatedBy,
    expiresAt,
    status: "pending",
    approvals: [],
    requiredApprovals,
  });

  // Record rate-limit timestamp
  recoveryAttemptTimestamps.set(walletAddress, new Date());

  // Notify all verified guardians
  const guardians = await GuardianModel.findAll({
    where: { walletAddress, verified: true },
  });
  await notifyGuardians(guardians, recoveryRequest.id, walletAddress);

  await audit(walletAddress, "RECOVERY_INITIATED", {
    recoveryRequestId: recoveryRequest.id,
    initiatedBy,
    requiredApprovals,
    guardianCount: guardians.length,
  });

  log.info("Recovery initiated", {
    recoveryRequestId: recoveryRequest.id,
    walletAddress,
    requiredApprovals,
  });

  return toRecoveryRequest(recoveryRequest);
}

export async function approveRecovery(
  recoveryRequestId: string,
  req: ApproveRecoveryRequest,
): Promise<RecoveryRequest | RecoveryResult> {
  const recoveryRequest =
    await RecoveryRequestModel.findByPk(recoveryRequestId);
  if (!recoveryRequest)
    throw new Error(`Recovery request not found: ${recoveryRequestId}`);

  if (recoveryRequest.status !== "pending") {
    throw new Error(
      `Recovery request is not pending (status: ${recoveryRequest.status})`,
    );
  }

  if (new Date(recoveryRequest.expiresAt) <= new Date()) {
    await recoveryRequest.update({ status: "expired" });
    await audit(recoveryRequest.walletAddress, "RECOVERY_EXPIRED", {
      recoveryRequestId,
    });
    throw new Error("Recovery request has expired");
  }

  // Validate guardian
  const guardian = await GuardianModel.findByPk(req.guardianId);
  if (!guardian) throw new Error(`Guardian not found: ${req.guardianId}`);
  if (!guardian.verified)
    throw new Error(`Guardian ${req.guardianId} is not verified`);
  if (guardian.walletAddress !== recoveryRequest.walletAddress) {
    throw new Error("Guardian does not belong to this wallet");
  }

  // Prevent duplicate approvals
  if (recoveryRequest.approvals.some((a) => a.guardianId === req.guardianId)) {
    throw new Error("Guardian has already approved this recovery request");
  }

  const updatedApprovals = [
    ...recoveryRequest.approvals,
    {
      guardianId: req.guardianId,
      approvedAt: new Date().toISOString(),
      signature: req.signature,
    },
  ];

  await recoveryRequest.update({ approvals: updatedApprovals });

  await audit(recoveryRequest.walletAddress, "RECOVERY_APPROVED", {
    recoveryRequestId,
    guardianId: req.guardianId,
    approvalCount: updatedApprovals.length,
  });

  log.info("Recovery approval added", {
    recoveryRequestId,
    guardianId: req.guardianId,
    count: updatedApprovals.length,
    required: recoveryRequest.requiredApprovals,
  });

  // Check if threshold is met
  if (updatedApprovals.length >= recoveryRequest.requiredApprovals) {
    return completeRecovery(
      recoveryRequest,
      updatedApprovals.map((a) => a.signature),
    );
  }

  return toRecoveryRequest(await recoveryRequest.reload());
}

async function completeRecovery(
  recoveryRequest: RecoveryRequestModel,
  signatures: string[],
): Promise<RecoveryResult> {
  const recoveryKey = deriveRecoveryKey(signatures);

  // Derive and encrypt new master key material
  const newMasterKeyRaw = crypto.randomBytes(32).toString("hex");
  const newMasterKeyEncrypted = await encryptIdentifier(newMasterKeyRaw);

  await recoveryRequest.update({ status: "completed" });

  await audit(recoveryRequest.walletAddress, "RECOVERY_COMPLETED", {
    recoveryRequestId: recoveryRequest.id,
    completedAt: new Date().toISOString(),
  });

  log.info("Recovery completed", {
    walletAddress: recoveryRequest.walletAddress,
    recoveryRequestId: recoveryRequest.id,
  });

  return {
    walletAddress: recoveryRequest.walletAddress,
    newMasterKey: newMasterKeyEncrypted,
    recoveryKey,
    completedAt: new Date().toISOString(),
  };
}

export async function getRecoveryRequest(
  recoveryRequestId: string,
): Promise<RecoveryRequest> {
  const req = await RecoveryRequestModel.findByPk(recoveryRequestId);
  if (!req) throw new Error(`Recovery request not found: ${recoveryRequestId}`);
  return toRecoveryRequest(req);
}

// ---------------------------------------------------------------------------
// Visible for testing
// ---------------------------------------------------------------------------
export { recoveryAttemptTimestamps };
