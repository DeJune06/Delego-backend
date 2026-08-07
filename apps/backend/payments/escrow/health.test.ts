import { describe, expect, it } from "vitest";
import {
  getPaymentsHealth,
  checkDatabaseConnectivity,
  checkWalletServiceReadiness,
  checkSorobanRpcReadiness,
} from "./health.js";

describe("getPaymentsHealth", () => {
  it("aggregates dependency statuses and timestamps the result", async () => {
    const before = Date.now();

    const health = await getPaymentsHealth({
      checkDatabase: async () => "ok",
      checkWallet: async () => "ok",
      checkSorobanRpc: async () => "ok",
    });

    const checkedAt = new Date(health.checkedAt).getTime();
    expect(checkedAt).toBeGreaterThan(0);
    expect(Number.isNaN(checkedAt)).toBe(false);
    expect(checkedAt).toBeGreaterThanOrEqual(before);

    expect(health).toMatchObject({
      database: "ok",
      walletService: "ok",
      sorobanRpc: "ok",
    });
    expect(health.circuitBreaker).toBeDefined();
  });
});

describe("checkDatabaseConnectivity", () => {
  it("returns degraded when the database is unreachable", async () => {
    const status = await checkDatabaseConnectivity(
      "postgresql://invalid:invalid@localhost:1/delego",
      200,
    );
    expect(status).toBe("degraded");
  });
});

describe("checkWalletServiceReadiness", () => {
  it("reports ok when the wallet service health endpoint responds", async () => {
    const status = await checkWalletServiceReadiness(
      "http://wallet.test",
      200,
      async () =>
        new Response(JSON.stringify({ data: { status: "ok" } }), { status: 200 }),
    );
    expect(status).toBe("ok");
  });

  it("reports degraded when the wallet service responds with a non-ok status", async () => {
    const status = await checkWalletServiceReadiness(
      "http://wallet.test",
      200,
      async () =>
        new Response(JSON.stringify({ data: { status: "degraded" } }), {
          status: 200,
        }),
    );
    expect(status).toBe("degraded");
  });

  it("reports degraded on network errors", async () => {
    const status = await checkWalletServiceReadiness(
      "http://wallet.test",
      200,
      async () => {
        throw new Error("connection refused");
      },
    );
    expect(status).toBe("degraded");
  });
});

describe("checkSorobanRpcReadiness", () => {
  it("reports degraded when the RPC endpoint is unreachable", async () => {
    const status = await checkSorobanRpcReadiness(
      "https://127.0.0.1:1",
      200,
    );
    expect(status).toBe("degraded");
  });
});
