/**
 * Full testnet integration test for payments escrow APIs.
 * Deploys escrow contract, starts wallet + payments services, exercises lifecycle.
 *
 * Run: node --test tests/integration/src/payments-escrow.testnet.test.js
 * Requires: built wallet/payments services and escrow WASM artifact.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createFundedKeypair,
  deployEscrowContract,
  fundTestnetAccount,
} from "./helpers/stellar-testnet.js";
import { startService, stopService, waitForHealth } from "./helpers/service-runner.js";

const WALLET_PORT = 13012;
const PAYMENTS_PORT = 13014;
const WALLET_URL = `http://localhost:${WALLET_PORT}`;
const PAYMENTS_URL = `http://localhost:${PAYMENTS_PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let walletProc;
let paymentsProc;
let contractId;
let adminKeypair;
let buyerAddress;
let sellerAddress;

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json };
}

describe("payments escrow testnet integration", { timeout: 600000 }, () => {
  before(async () => {
    adminKeypair = createFundedKeypair();
    await fundTestnetAccount(adminKeypair.publicKey());

  const buyer = createFundedKeypair();
  const seller = createFundedKeypair();
  await fundTestnetAccount(buyer.publicKey());
  await fundTestnetAccount(seller.publicKey());
  buyerAddress = buyer.publicKey();
  sellerAddress = seller.publicKey();

  const deployed = await deployEscrowContract(adminKeypair);
  contractId = process.env.ESCROW_CONTRACT_ID ?? deployed.contractId;
  console.log(`Deployed escrow contract: ${contractId}`);

  const walletDir = path.join(ROOT, "services/wallet");
  const previousCwd = process.cwd();
  process.chdir(walletDir);
  const { vaultService } = await import(
    pathToFileURL(path.join(walletDir, "dist/src/vault.js")).href
  );
  await vaultService.storeKey(adminKeypair.publicKey(), adminKeypair.secret());
  process.chdir(previousCwd);

  walletProc = startService("wallet", "services/wallet", {
    NODE_ENV: "development",
    WALLET_PORT: String(WALLET_PORT),
    STELLAR_NETWORK: "testnet",
    LOG_LEVEL: "info",
  });
  await waitForHealth(`${WALLET_URL}/health`);

  paymentsProc = startService("payments", "services/payments", {
    NODE_ENV: "development",
    PAYMENTS_PORT: String(PAYMENTS_PORT),
    WALLET_URL,
    ESCROW_CONTRACT_ID: contractId,
    LOG_LEVEL: "info",
  });
  await waitForHealth(`${PAYMENTS_URL}/health`);
  });

  after(() => {
    stopService(walletProc);
    stopService(paymentsProc);
  });

  it("initializes escrow contract on-chain", async () => {
    const { status, json } = await postJson(`${PAYMENTS_URL}/escrow/initialize`, {
      sourceAddress: adminKeypair.publicKey(),
      adminAddress: adminKeypair.publicKey(),
    });

    assert.equal(status, 200);
    assert.equal(json.error, null);
    assert.ok(json.data?.txHash);
    assert.equal(json.data.success, true);
    assert.ok(json.data.ledger > 0);
    console.log(`initialize txHash: ${json.data.txHash}`);
  });

  it("deposits funds into escrow on-chain", async () => {
    const { status, json } = await postJson(`${PAYMENTS_URL}/escrow/deposit`, {
      sourceAddress: adminKeypair.publicKey(),
      buyerAddress,
      sellerAddress,
      orderId: "integration-test-order-1",
    });

    assert.equal(status, 200);
    assert.equal(json.error, null);
    assert.ok(json.data?.txHash);
    assert.equal(json.data.success, true);
    console.log(`deposit txHash: ${json.data.txHash}`);
  });

  it("releases escrow funds on-chain", async () => {
    const escrowId = "0";
    const { status, json } = await postJson(
      `${PAYMENTS_URL}/escrow/${escrowId}/release`,
      { sourceAddress: adminKeypair.publicKey() }
    );

    assert.equal(status, 200);
    assert.equal(json.error, null);
    assert.ok(json.data?.txHash);
    assert.equal(json.data.success, true);
    assert.equal(json.data.escrowId, escrowId);
    console.log(`release txHash: ${json.data.txHash}`);
  });

  it("refunds escrow funds on-chain", async () => {
    const { status: depositStatus, json: depositJson } = await postJson(
      `${PAYMENTS_URL}/escrow/deposit`,
      {
        sourceAddress: adminKeypair.publicKey(),
        buyerAddress,
        sellerAddress,
        orderId: "integration-test-order-2",
      }
    );
    assert.equal(depositStatus, 200);
    assert.ok(depositJson.data?.txHash);

    const escrowId = "0";
    const { status, json } = await postJson(
      `${PAYMENTS_URL}/escrow/${escrowId}/refund`,
      { sourceAddress: adminKeypair.publicKey() }
    );

    assert.equal(status, 200);
    assert.equal(json.error, null);
    assert.ok(json.data?.txHash);
    assert.equal(json.data.success, true);
    assert.equal(json.data.escrowId, escrowId);
    console.log(`refund txHash: ${json.data.txHash}`);
  });
});
