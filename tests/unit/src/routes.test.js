import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Horizon, Networks, TransactionBuilder, Transaction, Keypair } from "@stellar/stellar-sdk";
import { registerRoutes } from "../../../services/wallet/dist/src/routes.js";
import { getRedisConnection } from "../../../services/wallet/dist/src/queue/txQueue.js";

describe("Wallet REST API Routes", () => {
  let originalLoadAccount;
  let originalTransactions;

  let mockLoadAccount = null;
  let mockTransactionsBuilder = null;

  const routes = registerRoutes();
  const balanceRoute = routes.find(
    (r) => r.method === "GET" && r.pattern.test("/api/v1/wallet/GBTEST/balance")
  );
  const txHistoryRoute = routes.find(
    (r) => r.method === "GET" && r.pattern.test("/api/v1/wallet/GBTEST/transactions")
  );

  const keypair = Keypair.random();
  const validAddress = keypair.publicKey();

  before(() => {
    process.env.MOCK_REDIS = "true";
    process.env.NODE_ENV = "test";
    process.env.STELLAR_NETWORK = "testnet";

    originalLoadAccount = Horizon.Server.prototype.loadAccount;
    originalTransactions = Horizon.Server.prototype.transactions;

    Horizon.Server.prototype.loadAccount = async function (address) {
      if (mockLoadAccount) return mockLoadAccount(address);
      throw { response: { status: 404 } };
    };

    Horizon.Server.prototype.transactions = function () {
      return mockTransactionsBuilder;
    };
  });

  after(() => {
    Horizon.Server.prototype.loadAccount = originalLoadAccount;
    Horizon.Server.prototype.transactions = originalTransactions;
  });

  beforeEach(async () => {
    mockLoadAccount = null;
    mockTransactionsBuilder = null;
    const redis = getRedisConnection();
    await redis.flushall();
  });

  async function runRoute(routeObj, url, params) {
    const req = {
      url,
      headers: { host: "localhost" }
    };
    let responseStatus = 200;
    let responseHeaders = {};
    let responseBody = "";

    const res = {
      writeHead(status, headers) {
        responseStatus = status;
        responseHeaders = { ...responseHeaders, ...headers };
      },
      end(body) {
        responseBody = body;
      }
    };

    await routeObj.handler(req, res, params);

    return {
      status: responseStatus,
      headers: responseHeaders,
      body: responseBody ? JSON.parse(responseBody) : null
    };
  }

  describe("GET /api/v1/wallet/:address/balance", () => {
    const invalidAddress = "invalid-address";

    it("should return 400 for malformed address", async () => {
      const result = await runRoute(balanceRoute, `/api/v1/wallet/${invalidAddress}/balance`, {
        address: invalidAddress
      });
      assert.equal(result.status, 400);
      assert.equal(result.body.error.code, "BAD_REQUEST");
    });

    it("should return 404 if account does not exist on network", async () => {
      mockLoadAccount = async () => {
        const err = new Error("Not Found");
        err.response = { status: 404 };
        throw err;
      };

      const result = await runRoute(balanceRoute, `/api/v1/wallet/${validAddress}/balance`, {
        address: validAddress
      });
      assert.equal(result.status, 404);
      assert.equal(result.body.error.code, "NOT_FOUND");
    });

    it("should return 503 if Horizon rate limits request", async () => {
      mockLoadAccount = async () => {
        const err = new Error("Rate Limit");
        err.response = { status: 429, headers: { "retry-after": "45" } };
        throw err;
      };

      const result = await runRoute(balanceRoute, `/api/v1/wallet/${validAddress}/balance`, {
        address: validAddress
      });
      assert.equal(result.status, 503);
      assert.equal(result.headers["Retry-After"], "45");
      assert.equal(result.body.error.code, "SERVICE_UNAVAILABLE");
    });

    it("should return XLM and token balances and cache them in Redis", async () => {
      mockLoadAccount = async (address) => {
        return {
          id: address,
          balances: [
            { asset_type: "native", balance: "100.5000000" },
            { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: validAddress, balance: "25.0000000" }
          ]
        };
      };

      // First call (hits Horizon)
      const res1 = await runRoute(balanceRoute, `/api/v1/wallet/${validAddress}/balance`, {
        address: validAddress
      });
      assert.equal(res1.status, 200);
      assert.equal(res1.body.data.nativeBalance, "1005000000"); // in stroops
      assert.equal(res1.body.data.nativeBalanceFormatted, "100.5000000");
      assert.equal(res1.body.data.tokenBalances.length, 1);
      assert.equal(res1.body.data.tokenBalances[0].assetCode, "USDC");
      assert.equal(res1.body.data.tokenBalances[0].balance, "250000000");
      assert.ok(res1.body.data.tokenBalances[0].contractId);

      // Mutate mockLoadAccount to prove cache hits
      mockLoadAccount = async () => {
        throw new Error("Should hit cache!");
      };

      // Second call (hits Redis Cache)
      const res2 = await runRoute(balanceRoute, `/api/v1/wallet/${validAddress}/balance`, {
        address: validAddress
      });
      assert.equal(res2.status, 200);
      assert.equal(res2.body.data.nativeBalance, "1005000000");
    });
  });

  describe("GET /api/v1/wallet/:address/transactions", () => {

    it("should return transaction history formatted correctly", async () => {
      mockLoadAccount = async () => {
        return { id: validAddress };
      };

      // Mock envelope_xdr for a payment
      // Create a mock envelope_xdr containing a payment operation
      // Since we mock TransactionBuilder.fromXDR in the tests or pass standard dummy strings,
      // let's pass a dummy envelope XDR or mock parsing if needed.
      // Wait, TransactionBuilder.fromXDR parses real XDR or throws.
      // Let's mock the parsing or generate a valid simple transaction XDR.
      // Actually, let's hijack TransactionBuilder.fromXDR just for our test,
      // so we don't have to construct full binary XDR strings!
      const originalFromXDRMethod = TransactionBuilder.fromXDR;

      let parsedTxMock = {
        operations: [
          {
            type: "payment",
            amount: "10.0000000",
            asset: {
              isNative: () => true
            },
            destination: validAddress,
            source: "GCOUNTERPARTY"
          }
        ]
      };
      Object.setPrototypeOf(parsedTxMock, Transaction.prototype);

      TransactionBuilder.fromXDR = () => {
        return parsedTxMock;
      };

      mockTransactionsBuilder = {
        forAccount: () => mockTransactionsBuilder,
        limit: () => mockTransactionsBuilder,
        order: () => mockTransactionsBuilder,
        cursor: () => mockTransactionsBuilder,
        call: async () => {
          return {
            records: [
              {
                id: "tx-1",
                hash: "hash-1",
                ledger: 100,
                ledger_attr: 100,
                envelope_xdr: "dummy-xdr",
                source_account: "GCOUNTERPARTY",
                memo: "Test Memo",
                created_at: "2026-06-14T00:00:00Z",
                successful: true,
                paging_token: "token-1"
              }
            ]
          };
        }
      };

      try {
        const result = await runRoute(txHistoryRoute, `/api/v1/wallet/${validAddress}/transactions`, {
          address: validAddress
        });

        assert.equal(result.status, 200);
        assert.equal(result.body.data.transactions.length, 1);
        const tx = result.body.data.transactions[0];
        assert.equal(tx.id, "tx-1");
        assert.equal(tx.type, "payment");
        assert.equal(tx.direction, "incoming");
        assert.equal(tx.amount, "100000000"); // 10.0 XLM in stroops
        assert.equal(tx.assetCode, "XLM");
        assert.equal(tx.counterparty, "GCOUNTERPARTY");
        assert.equal(tx.memo, "Test Memo");
        assert.equal(result.body.data.cursor, "token-1");
      } finally {
        TransactionBuilder.fromXDR = originalFromXDRMethod;
      }
    });
  });
});
