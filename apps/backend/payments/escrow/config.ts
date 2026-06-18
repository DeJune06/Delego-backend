const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;
const CONTRACT_ADDRESS_RE = /^C[A-Z2-7]{55}$/;

export function getWalletUrl(): string {
  return process.env.WALLET_URL ?? "http://localhost:3012";
}

export function getEscrowContractId(): string {
  const contractId = process.env.ESCROW_CONTRACT_ID;
  if (!contractId) {
    throw new Error("ESCROW_CONTRACT_ID environment variable is not configured");
  }
  return contractId;
}

export function isValidStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_RE.test(address);
}

export function isValidContractId(contractId: string): boolean {
  return CONTRACT_ADDRESS_RE.test(contractId);
}
