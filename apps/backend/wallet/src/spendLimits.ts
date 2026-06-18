import { getRedisConnection } from "./queue/txQueue.js";
import { SpendLimit } from "./models/SpendLimit.js";
import { createLogger } from "@delego/utils";

const log = createLogger("wallet:spendLimits", process.env.LOG_LEVEL ?? "info");

export interface SpendCheckResult {
  allowed: boolean;
  reason?: string;
  limit?: string;
  currentSpend?: string;
  requestedAmount?: string;
}

export interface SpendSummary {
  daily: string;
  weekly: string;
  lifetime: string;
}

export function getDailyKey(userId: string, walletId: string, date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `spend:daily:${userId}:${walletId}:${yyyy}-${mm}-${dd}`;
}

export function getWeeklyKey(userId: string, walletId: string, date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const ww = String(weekNo).padStart(2, "0");
  return `spend:weekly:${userId}:${walletId}:${d.getUTCFullYear()}-W${ww}`;
}

export function getLifetimeKey(userId: string, walletId: string): string {
  return `spend:lifetime:${userId}:${walletId}`;
}

/**
 * Reads the SpendLimit config from PostgreSQL, reads cumulative spend counters from Redis,
 * and returns whether the transaction is allowed.
 */
export async function checkSpendLimit(
  userId: string,
  walletId: string,
  delegationId: string | null,
  amountStroops: bigint
): Promise<SpendCheckResult> {
  log.info("Checking spend limit", { userId, walletId, delegationId, amountStroops: amountStroops.toString() });

  // 1. Query PostgreSQL for SpendLimit config
  let config = await SpendLimit.findOne({
    where: {
      userId,
      delegationId: delegationId || null,
      walletId: walletId || null,
    },
  });

  // Fallbacks if config is not found
  if (!config && delegationId) {
    config = await SpendLimit.findOne({ where: { delegationId } });
  }
  if (!config && walletId) {
    config = await SpendLimit.findOne({ where: { walletId, delegationId: null } });
  }
  if (!config) {
    config = await SpendLimit.findOne({ where: { userId, delegationId: null, walletId: null } });
  }

  // If no SpendLimit record exists for the user, all transactions are allowed
  if (!config) {
    log.info("No spend limit configured for user, allowing transaction", { userId });
    return { allowed: true };
  }

  // 2. Per-transaction limit check
  if (config.limitPerTransaction !== null && config.limitPerTransaction !== undefined) {
    const limit = BigInt(config.limitPerTransaction);
    if (amountStroops > limit) {
      log.warn("Per-transaction limit exceeded", { userId, limit: limit.toString(), requested: amountStroops.toString() });
      return {
        allowed: false,
        reason: "Per-transaction limit exceeded",
        limit: limit.toString(),
        requestedAmount: amountStroops.toString(),
      };
    }
  }

  // 3. Retrieve daily, weekly, and lifetime cumulative spend from Redis
  const redis = getRedisConnection();
  const dailyKey = getDailyKey(userId, walletId);
  const weeklyKey = getWeeklyKey(userId, walletId);
  const lifetimeKey = getLifetimeKey(userId, walletId);

  const [dailySpendStr, weeklySpendStr, lifetimeSpendStr] = await redis.mget(dailyKey, weeklyKey, lifetimeKey);
  const dailySpend = BigInt(dailySpendStr || "0");
  const weeklySpend = BigInt(weeklySpendStr || "0");
  const lifetimeSpend = BigInt(lifetimeSpendStr || "0");

  // Daily limit check
  if (config.limitDaily !== null && config.limitDaily !== undefined) {
    const limit = BigInt(config.limitDaily);
    if (dailySpend + amountStroops > limit) {
      log.warn("Daily limit exceeded", { userId, limit: limit.toString(), current: dailySpend.toString(), requested: amountStroops.toString() });
      return {
        allowed: false,
        reason: "Daily limit exceeded",
        limit: limit.toString(),
        currentSpend: dailySpend.toString(),
        requestedAmount: amountStroops.toString(),
      };
    }
  }

  // Weekly limit check
  if (config.limitWeekly !== null && config.limitWeekly !== undefined) {
    const limit = BigInt(config.limitWeekly);
    if (weeklySpend + amountStroops > limit) {
      log.warn("Weekly limit exceeded", { userId, limit: limit.toString(), current: weeklySpend.toString(), requested: amountStroops.toString() });
      return {
        allowed: false,
        reason: "Weekly limit exceeded",
        limit: limit.toString(),
        currentSpend: weeklySpend.toString(),
        requestedAmount: amountStroops.toString(),
      };
    }
  }

  // Lifetime limit check
  if (config.limitLifetime !== null && config.limitLifetime !== undefined) {
    const limit = BigInt(config.limitLifetime);
    if (lifetimeSpend + amountStroops > limit) {
      log.warn("Lifetime limit exceeded", { userId, limit: limit.toString(), current: lifetimeSpend.toString(), requested: amountStroops.toString() });
      return {
        allowed: false,
        reason: "Lifetime limit exceeded",
        limit: limit.toString(),
        currentSpend: lifetimeSpend.toString(),
        requestedAmount: amountStroops.toString(),
      };
    }
  }

  log.info("Spend limit check passed", { userId, walletId });
  return { allowed: true };
}

/**
 * Atomically increments daily, weekly, and lifetime counters in Redis using INCRBY.
 * Sets TTL on daily and weekly keys if they are new.
 */
export async function recordSpend(userId: string, walletId: string, amountStroops: bigint): Promise<void> {
  log.info("Recording spend", { userId, walletId, amountStroops: amountStroops.toString() });
  const redis = getRedisConnection();

  const dailyKey = getDailyKey(userId, walletId);
  const weeklyKey = getWeeklyKey(userId, walletId);
  const lifetimeKey = getLifetimeKey(userId, walletId);

  // Daily TTL: 48h (172800s); Weekly TTL: 8d (691200s)
  const dailyTtl = 172800;
  const weeklyTtl = 691200;

  // Lua script to atomically increment the counters and set TTL if they are newly created
  const luaScript = `
    local dailyVal = redis.call('INCRBY', KEYS[1], ARGV[1])
    if tonumber(dailyVal) == tonumber(ARGV[1]) then
      redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
    end
    local weeklyVal = redis.call('INCRBY', KEYS[2], ARGV[1])
    if tonumber(weeklyVal) == tonumber(ARGV[1]) then
      redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]))
    end
    redis.call('INCRBY', KEYS[3], ARGV[1])
    return {tostring(dailyVal), tostring(weeklyVal)}
  `;

  await redis.eval(
    luaScript,
    3,
    dailyKey,
    weeklyKey,
    lifetimeKey,
    amountStroops.toString(),
    dailyTtl.toString(),
    weeklyTtl.toString()
  );
  log.info("Spend recorded successfully", { userId, walletId });
}

/**
 * Returns current daily, weekly, and lifetime cumulative spend for display purposes.
 */
export async function getSpendSummary(userId: string, walletId: string): Promise<SpendSummary> {
  const redis = getRedisConnection();
  const dailyKey = getDailyKey(userId, walletId);
  const weeklyKey = getWeeklyKey(userId, walletId);
  const lifetimeKey = getLifetimeKey(userId, walletId);

  const [dailySpend, weeklySpend, lifetimeSpend] = await redis.mget(dailyKey, weeklyKey, lifetimeKey);

  return {
    daily: dailySpend || "0",
    weekly: weeklySpend || "0",
    lifetime: lifetimeSpend || "0",
  };
}
