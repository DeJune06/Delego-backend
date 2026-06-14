import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Address,
  Horizon,
  Keypair,
  Networks,
  Operation,
  rpc,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

export const TESTNET_RPC = "https://soroban-testnet.stellar.org";
export const TESTNET_HORIZON = "https://horizon-testnet.stellar.org";
export const TESTNET_PASSPHRASE = Networks.TESTNET;

const WASM_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../contracts/target/wasm32-unknown-unknown/release/delego_escrow.wasm"
);

export async function fundTestnetAccount(publicKey) {
  const response = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
  );
  if (!response.ok) {
    throw new Error(`Friendbot failed: ${await response.text()}`);
  }
}

export async function waitForTx(rpcServer, hash, label = "transaction") {
  for (let i = 0; i < 25; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const status = await rpcServer.getTransaction(hash);
    if (status.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return status;
    }
    if (status.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`${label} failed on-chain: ${hash}`);
    }
  }
  throw new Error(`${label} timed out: ${hash}`);
}

export async function submitSorobanTx(rpcServer, tx, signer, label) {
  tx.sign(signer);
  const send = await rpcServer.sendTransaction(tx);
  if (send.status === "ERROR") {
    throw new Error(`${label} submission error: ${JSON.stringify(send)}`);
  }
  return waitForTx(rpcServer, send.hash, label);
}

export async function deployEscrowContract(sourceKeypair) {
  const wasm = fs.readFileSync(WASM_PATH);
  const horizon = new Horizon.Server(TESTNET_HORIZON);
  const rpcServer = new rpc.Server(TESTNET_RPC);

  let account = await horizon.loadAccount(sourceKeypair.publicKey());

  let tx = new TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(Operation.uploadContractWasm({ wasm }))
    .setTimeout(300)
    .build();

  let sim = await rpcServer.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`WASM upload simulation failed: ${JSON.stringify(sim)}`);
  }
  tx = rpc.assembleTransaction(tx, sim).build();
  await submitSorobanTx(rpcServer, tx, sourceKeypair, "WASM upload");

  const wasmHash = crypto.createHash("sha256").update(wasm).digest();
  account = await horizon.loadAccount(sourceKeypair.publicKey());

  tx = new TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(
      Operation.createCustomContract({
        address: Address.fromString(sourceKeypair.publicKey()),
        wasmHash,
        salt: crypto.randomBytes(32),
        constructorArgs: [],
      })
    )
    .setTimeout(300)
    .build();

  sim = await rpcServer.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`Contract deploy simulation failed: ${JSON.stringify(sim)}`);
  }
  tx = rpc.assembleTransaction(tx, sim).build();
  const deployResult = await submitSorobanTx(rpcServer, tx, sourceKeypair, "Contract deploy");

  const contractId = Address.fromScAddress(deployResult.returnValue.address()).toString();
  return { contractId, wasmHash: wasmHash.toString("hex") };
}

export function createFundedKeypair() {
  const keypair = Keypair.random();
  return keypair;
}
