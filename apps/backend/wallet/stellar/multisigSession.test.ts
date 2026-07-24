/**
 * Tests for the multi-sig transaction signing session (Issue #366).
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair, Networks, TransactionBuilder, Account, Operation, BASE_FEE } from "@stellar/stellar-sdk";

import { VaultService } from "../src/vault.js";
import {
  collectPartialSignature,
  createMultisigSession,
  expireStaleSignatures,
  getMultisigSession,
  MultisigSessionClosedError,
  MultisigSessionNotFoundError,
  resetMultisigSessionStore,
  submitMultisigSession,
  UnauthorizedSignerError,
} from "./multisigSession.js";

function buildEnvelopeXdr(sourceKp: Keypair, networkPassphrase = Networks.TESTNET): string {
  const account = new Account(sourceKp.publicKey(), "0");
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(Operation.manageData({ name: "test", value: Buffer.from("multisig-session") }))
    .setTimeout(30)
    .build();
  return tx.toEnvelope().toXDR("base64");
}

let vaultPath: string;
let vault: VaultService;

beforeEach(async () => {
  vaultPath = path.join(
    os.tmpdir(),
    `delego-multisig-session-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );
  process.env.VAULT_FILE_PATH = vaultPath;
  process.env.STELLAR_NETWORK = "testnet";
  vault = new VaultService();
  resetMultisigSessionStore();
});

afterEach(async () => {
  delete process.env.VAULT_FILE_PATH;
  delete process.env.STELLAR_NETWORK;
  await fs.rm(vaultPath, { force: true });
});

describe("createMultisigSession", () => {
  it("opens a session with a default threshold equal to signer count", async () => {
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();
    const session = await createMultisigSession({
      baseXdr: buildEnvelopeXdr(kp1),
      signers: [kp1.publicKey(), kp2.publicKey()],
    });

    expect(session.status).toBe("collecting");
    expect(session.threshold).toBe(2);
    expect(session.signatures).toHaveLength(0);
  });

  it("rejects a threshold greater than the number of configured signers", async () => {
    const kp1 = Keypair.random();
    await expect(
      createMultisigSession({
        baseXdr: buildEnvelopeXdr(kp1),
        signers: [kp1.publicKey()],
        threshold: 2,
      })
    ).rejects.toThrow("threshold must be between");
  });

  it("rejects an empty signer list", async () => {
    await expect(createMultisigSession({ baseXdr: "AAAA", signers: [] })).rejects.toThrow(
      "At least one signer is required"
    );
  });
});

describe("collectPartialSignature", () => {
  it("collects signatures from multiple signers and does not submit before threshold", async () => {
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();
    const kp3 = Keypair.random();
    await vault.storeKey(kp1.publicKey(), kp1.secret());
    await vault.storeKey(kp2.publicKey(), kp2.secret());
    await vault.storeKey(kp3.publicKey(), kp3.secret());

    const session = await createMultisigSession({
      baseXdr: buildEnvelopeXdr(kp1),
      signers: [kp1.publicKey(), kp2.publicKey(), kp3.publicKey()],
      threshold: 2,
    });

    const submit = vi.fn();
    const afterFirst = await collectPartialSignature(
      { sessionId: session.id, signer: kp1.publicKey() },
      submit
    );

    expect(afterFirst.status).toBe("collecting");
    expect(afterFirst.signatures).toHaveLength(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits automatically once the signature threshold is met", async () => {
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();
    await vault.storeKey(kp1.publicKey(), kp1.secret());
    await vault.storeKey(kp2.publicKey(), kp2.secret());

    const session = await createMultisigSession({
      baseXdr: buildEnvelopeXdr(kp1),
      signers: [kp1.publicKey(), kp2.publicKey()],
      threshold: 2,
    });

    const submit = vi.fn().mockResolvedValue({ hash: "tx-hash-123" });
    await collectPartialSignature({ sessionId: session.id, signer: kp1.publicKey() }, submit);
    const final = await collectPartialSignature(
      { sessionId: session.id, signer: kp2.publicKey() },
      submit
    );

    expect(final.status).toBe("submitted");
    expect(final.submittedXdr).toBeTruthy();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(final.submissionResult).toEqual({ hash: "tx-hash-123" });
  });

  it("rejects submission when the threshold is not met", async () => {
    const kp1 = Keypair.random();
    await vault.storeKey(kp1.publicKey(), kp1.secret());

    const session = await createMultisigSession({
      baseXdr: buildEnvelopeXdr(kp1),
      signers: [kp1.publicKey(), Keypair.random().publicKey()],
      threshold: 2,
    });

    await collectPartialSignature({ sessionId: session.id, signer: kp1.publicKey() });

    await expect(submitMultisigSession(session.id)).rejects.toThrow("Threshold not met");

    const fetched = await getMultisigSession(session.id);
    expect(fetched?.status).toBe("collecting");
  });

  it("rejects signatures from signers not configured on the session", async () => {
    const kp1 = Keypair.random();
    const outsider = Keypair.random();
    await vault.storeKey(kp1.publicKey(), kp1.secret());
    await vault.storeKey(outsider.publicKey(), outsider.secret());

    const session = await createMultisigSession({
      baseXdr: buildEnvelopeXdr(kp1),
      signers: [kp1.publicKey()],
    });

    await expect(
      collectPartialSignature({ sessionId: session.id, signer: outsider.publicKey() })
    ).rejects.toThrow(UnauthorizedSignerError);
  });

  it("rejects collection on an unknown session", async () => {
    await expect(
      collectPartialSignature({ sessionId: "does-not-exist", signer: "GABC" })
    ).rejects.toThrow(MultisigSessionNotFoundError);
  });

  it("rejects collection once a session is already submitted", async () => {
    const kp1 = Keypair.random();
    await vault.storeKey(kp1.publicKey(), kp1.secret());

    const session = await createMultisigSession({
      baseXdr: buildEnvelopeXdr(kp1),
      signers: [kp1.publicKey()],
      threshold: 1,
    });

    await collectPartialSignature({ sessionId: session.id, signer: kp1.publicKey() }, vi.fn());

    await expect(
      collectPartialSignature({ sessionId: session.id, signer: kp1.publicKey() })
    ).rejects.toThrow(MultisigSessionClosedError);
  });

  it("expires partial signatures after their configured timeout", async () => {
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();
    await vault.storeKey(kp1.publicKey(), kp1.secret());
    await vault.storeKey(kp2.publicKey(), kp2.secret());

    const session = await createMultisigSession({
      baseXdr: buildEnvelopeXdr(kp1),
      signers: [kp1.publicKey(), kp2.publicKey()],
      threshold: 2,
    });

    const t0 = Date.now();
    await collectPartialSignature({ sessionId: session.id, signer: kp1.publicKey(), ttlMs: 1000, now: t0 });

    // Well past expiry — signature should be pruned before the second joins.
    const expired = await expireStaleSignatures(session.id, t0 + 5000);
    expect(expired.signatures).toHaveLength(0);
    expect(expired.status).toBe("collecting");

    // Collecting the second signer alone should not meet threshold yet.
    const afterSecond = await collectPartialSignature({
      sessionId: session.id,
      signer: kp2.publicKey(),
      now: t0 + 5000,
    });
    expect(afterSecond.status).toBe("collecting");
    expect(afterSecond.signatures).toHaveLength(1);
  });
});
