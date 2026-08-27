/**
 * Social Guardian Account Recovery — shared types
 * Issue #43
 */

export type GuardianType = "email" | "phone" | "wallet";

export interface Guardian {
  id: string;
  type: GuardianType;
  identifier: string; // email address, phone number, or wallet address
  verified: boolean;
  addedAt: string; // ISO 8601
  verificationCode: string | null;
  verificationExpiresAt: string | null;
}

export type RecoveryStatus =
  "pending" | "approved" | "rejected" | "expired" | "completed";

export interface RecoveryApproval {
  guardianId: string;
  approvedAt: string; // ISO 8601
  signature: string;
}

export interface RecoveryRequest {
  id: string;
  walletAddress: string;
  initiatedBy: string;
  requestedAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  status: RecoveryStatus;
  approvals: RecoveryApproval[];
  requiredApprovals: number;
}

export interface RecoveryResult {
  walletAddress: string;
  newMasterKey: string; // encrypted
  recoveryKey: string;
  completedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

export interface AddGuardianRequest {
  walletAddress: string;
  type: GuardianType;
  identifier: string;
}

export interface VerifyGuardianRequest {
  verificationCode: string;
}

export interface InitiateRecoveryRequest {
  walletAddress: string;
  initiatedBy: string;
  /** Optional override for requiredApprovals; defaults to 3 */
  requiredApprovals?: number;
}

export interface ApproveRecoveryRequest {
  guardianId: string;
  signature: string;
}
