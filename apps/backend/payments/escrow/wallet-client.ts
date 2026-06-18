import type { ApiResponse, TransactionRequest, TransactionResult } from "@delego/types";
import { createLogger } from "@delego/utils";
import { getWalletUrl } from "./config.js";

const log = createLogger("payments:wallet-client", process.env.LOG_LEVEL ?? "info");

export async function submitContractCall(
  request: TransactionRequest
): Promise<TransactionResult> {
  const walletUrl = getWalletUrl();
  const url = `${walletUrl}/transactions/submit`;

  log.info("Submitting escrow contract call via wallet service", {
    method: request.method,
    contractId: request.contractId,
    sourceAddress: request.sourceAddress,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceAddress: request.sourceAddress,
        contractId: request.contractId,
        method: request.method,
        args: request.args,
        memo: request.memo,
      }),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach wallet service";
    log.error("Wallet service request failed", { error: message, method: request.method });
    throw new Error(`Wallet service unavailable: ${message}`);
  }

  const rawBody = await response.text();
  let body: ApiResponse<TransactionResult>;
  try {
    body = JSON.parse(rawBody) as ApiResponse<TransactionResult>;
  } catch {
    log.error("Wallet service returned non-JSON response", {
      status: response.status,
      method: request.method,
    });
    throw new Error(`Wallet service returned invalid response (status ${response.status})`);
  }

  if (!response.ok || body.error) {
    const message = body.error?.message ?? `Wallet service returned status ${response.status}`;
    log.error("Wallet service submission failed", { error: message, method: request.method });
    throw new Error(message);
  }

  if (!body.data) {
    throw new Error("Wallet service returned empty transaction result");
  }

  log.info("Escrow contract transaction submitted", {
    txHash: body.data.hash,
    ledger: body.data.ledger,
    method: request.method,
  });

  return body.data;
}
