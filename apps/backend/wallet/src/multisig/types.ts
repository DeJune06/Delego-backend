/**
 * Multi-Signature Wallet — shared types
 * Issue #44
 */

export interface MultiSigSigner {
  address: string;
  weight: number;
  addedAt: string; // ISO 8601
}

export interface MultiSigWallet {
  id: string;
  address: string;
  signers: MultiSigSigner[];
  threshold: number;
  nonce: number;
  createdAt: string;
  paused: boolean;
}

export interface ProposalTransaction {
  contractId: string;
  method: string;
  args: unknown[];
  memo: string;
}

export interface ProposalSignature {
  signer: string;
  signature: string;
  signedAt: string; // ISO 8601
}

export type ProposalStatus =
  "pending" | "signed" | "executed" | "expired" | "cancelled";

export interface MultiSigProposal {
  id: string;
  walletId: string;
  proposer: string;
  transaction: ProposalTransaction;
  signatures: ProposalSignature[];
  status: ProposalStatus;
  createdAt: string;
  expiresAt: string;
  executedAt: string | null;
  executionHash: string | null;
}

export type SignerUpdateAction = "add" | "remove" | "update_weight";

export interface SignerUpdate {
  walletId: string;
  action: SignerUpdateAction;
  address: string;
  weight: number;
  proposedBy: string;
}

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

export interface CreateMultiSigWalletRequest {
  /** 2-10 signers */
  signers: Array<{ address: string; weight: number }>;
  /** 1 – sum of all weights */
  threshold: number;
}

export interface CreateProposalRequest {
  proposer: string;
  transaction: ProposalTransaction;
  /** ISO 8601; defaults to 7 days from now */
  expiresAt?: string;
}

export interface SubmitSignatureRequest {
  signer: string;
  signature: string;
}

export interface UpdateSignerRequest {
  action: SignerUpdateAction;
  address: string;
  weight: number;
  proposedBy: string;
}
