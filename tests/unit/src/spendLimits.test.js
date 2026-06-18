import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { 
  checkSpendLimit, 
  recordSpend, 
  getSpendSummary,
  getDailyKey,
  getWeeklyKey,
  getLifetimeKey
} from "../../../apps/backend/wallet/dist/src/spendLimits.js";
import { SpendLimit } from "../../../apps/backend/wallet/dist/src/models/SpendLimit.js";
import { Wallet } from "../../../apps/backend/wallet/dist/src/models/Wallet.js";
import { getRedisConnection } from "../../../apps/backend/wallet/dist/src/queue/txQueue.js";
import { addTransactionToQueue } from "../../../apps/backend/wallet/dist/src/queue/txQueue.js";

describe("Wallet Spend Limits Middleware", () => {
  let originalSpendLimitFindOne;
  let originalWalletFindOne;

  let mockSpendLimitConfig = null;
  let mockWalletRecord = null;

  before(() => {
    process.env.MOCK_REDIS = "true";
    process.env.NODE_ENV = "test";

    // Back up original model methods
    originalSpendLimitFindOne = SpendLimit.findOne;
    originalWalletFindOne = Wallet.findOne;

    // Hijack model static methods
    SpendLimit.findOne = async () => {
      return mockSpendLimitConfig;
    };

    Wallet.findOne = async () => {
      return mockWalletRecord;
    };
  });

  after(() => {
    SpendLimit.findOne = originalSpendLimitFindOne;
    Wallet.findOne = originalWalletFindOne;
  });

  beforeEach(async () => {
    mockSpendLimitConfig = null;
    mockWalletRecord = null;
    const redis = getRedisConnection();
    await redis.flushall();
  });

  it("should allow transaction if no SpendLimit record exists", async () => {
    mockSpendLimitConfig = null;
    const res = await checkSpendLimit("user-1", "wallet-1", null, 100n);
    assert.ok(res.allowed);
  });

  it("should reject if limitPerTransaction is exceeded", async () => {
    mockSpendLimitConfig = {
      userId: "user-1",
      walletId: "wallet-1",
      delegationId: null,
      limitPerTransaction: "1000",
      limitDaily: null,
      limitWeekly: null,
      limitLifetime: null
    };

    const res = await checkSpendLimit("user-1", "wallet-1", null, 1500n);
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "Per-transaction limit exceeded");
    assert.equal(res.limit, "1000");
    assert.equal(res.requestedAmount, "1500");
  });

  it("should allow if limitPerTransaction is not exceeded", async () => {
    mockSpendLimitConfig = {
      userId: "user-1",
      walletId: "wallet-1",
      delegationId: null,
      limitPerTransaction: "1000",
      limitDaily: null,
      limitWeekly: null,
      limitLifetime: null
    };

    const res = await checkSpendLimit("user-1", "wallet-1", null, 500n);
    assert.ok(res.allowed);
  });

  it("should reject if daily limit is exceeded", async () => {
    mockSpendLimitConfig = {
      userId: "user-1",
      walletId: "wallet-1",
      delegationId: null,
      limitPerTransaction: null,
      limitDaily: "5000",
      limitWeekly: null,
      limitLifetime: null
    };

    // Pre-record some spend
    await recordSpend("user-1", "wallet-1", 4000n);

    // Try a new transaction of 1500n (total 5500n > 5000n)
    const res = await checkSpendLimit("user-1", "wallet-1", null, 1500n);
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "Daily limit exceeded");
    assert.equal(res.currentSpend, "4000");
  });

  it("should reject if weekly limit is exceeded", async () => {
    mockSpendLimitConfig = {
      userId: "user-1",
      walletId: "wallet-1",
      delegationId: null,
      limitPerTransaction: null,
      limitDaily: null,
      limitWeekly: "10000",
      limitLifetime: null
    };

    await recordSpend("user-1", "wallet-1", 9000n);

    const res = await checkSpendLimit("user-1", "wallet-1", null, 2000n);
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "Weekly limit exceeded");
  });

  it("should reject if lifetime limit is exceeded", async () => {
    mockSpendLimitConfig = {
      userId: "user-1",
      walletId: "wallet-1",
      delegationId: null,
      limitPerTransaction: null,
      limitDaily: null,
      limitWeekly: null,
      limitLifetime: "20000"
    };

    await recordSpend("user-1", "wallet-1", 19000n);

    const res = await checkSpendLimit("user-1", "wallet-1", null, 2000n);
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "Lifetime limit exceeded");
  });

  it("should correctly increment spend counters and set TTL", async () => {
    const userId = "user-1";
    const walletId = "wallet-1";
    await recordSpend(userId, walletId, 100n);

    const summary = await getSpendSummary(userId, walletId);
    assert.equal(summary.daily, "100");
    assert.equal(summary.weekly, "100");
    assert.equal(summary.lifetime, "100");

    const redis = getRedisConnection();
    const dailyVal = await redis.get(getDailyKey(userId, walletId));
    const dailyTtl = await redis.ttl(getDailyKey(userId, walletId));
    const weeklyTtl = await redis.ttl(getWeeklyKey(userId, walletId));
    const lifetimeTtl = await redis.ttl(getLifetimeKey(userId, walletId));

    console.log("DEBUG ioredis-mock:", { dailyVal, dailyTtl, weeklyTtl, lifetimeTtl });

    // Daily key should have TTL set
    assert.ok(dailyTtl > 0);
    // Weekly key should have TTL set
    assert.ok(weeklyTtl > 0);
    // Lifetime key should not have TTL (-1)
    assert.equal(lifetimeTtl, -1);
  });

  it("should intercept and throw in addTransactionToQueue when limit exceeded", async () => {
    // Setup a mock Wallet record to map sourceAddress to userId and walletId
    mockWalletRecord = {
      id: "wallet-1",
      userId: "user-1",
      stellarAddress: "GBTESTADDRESS123456"
    };

    mockSpendLimitConfig = {
      userId: "user-1",
      walletId: "wallet-1",
      delegationId: null,
      limitPerTransaction: "500",
      limitDaily: null,
      limitWeekly: null,
      limitLifetime: null
    };

    const request = {
      sourceAddress: "GBTESTADDRESS123456",
      contractId: "C123",
      method: "transfer",
      args: [],
      memo: "Test transfer",
      amountStroops: "600" // Exceeds limitPerTransaction of 500
    };

    await assert.rejects(
      async () => {
        await addTransactionToQueue(request);
      },
      /Spending limit exceeded: Per-transaction limit exceeded/
    );
  });
});
