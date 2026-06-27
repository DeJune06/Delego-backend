/**
 * #55 Checkout Cancellation Grace Period Timers
 * Uses BullMQ to schedule 30-minute checkout expiry and cancel incomplete orders.
 */
import { createLogger } from "@delego/utils";
import { Queue, Worker, type Job } from "bullmq";
import { transitionWorkflow } from "../purchase/index.js";

const log = createLogger("orchestrator:checkout", process.env.LOG_LEVEL ?? "info");

export interface CheckoutTimeoutJob {
  orderId: string;
  expiresAt: string;
  reason: "approval_timeout" | "funding_timeout" | "fulfillment_timeout";
}

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const QUEUE_NAME = "checkout-timeouts";

function redisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return { url };
}

const timeoutQueue = new Queue<CheckoutTimeoutJob, void, string>(QUEUE_NAME, {
  connection: redisConnection() as any,
});

// Worker processes timeout jobs
const _worker = new Worker<CheckoutTimeoutJob, void, string>(
  QUEUE_NAME,
  async (job: Job<CheckoutTimeoutJob>) => {
    await handleTimeout(job.data.orderId);
  },
  { connection: redisConnection() as any }
);

_worker.on("failed", (job, err) => {
  log.error("Timeout job failed", { jobId: job?.id, error: err.message });
});

/**
 * Schedules a 30-minute cancellation timer for the given order.
 */
export async function scheduleTimeout(
  orderId: string,
  reason: CheckoutTimeoutJob["reason"] = "approval_timeout"
): Promise<void> {
  const expiresAt = new Date(Date.now() + TIMEOUT_MS).toISOString();

  await timeoutQueue.add(
    orderId,
    { orderId, expiresAt, reason },
    {
      delay: TIMEOUT_MS,
      jobId: `timeout:${orderId}`,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  log.info("Checkout timeout scheduled", { orderId, expiresAt, reason });
}

/**
 * Checks order status; triggers cancellation if still incomplete.
 */
export async function handleTimeout(orderId: string): Promise<void> {
  try {
    await transitionWorkflow(orderId, {
      type: "CANCEL",
      reason: "checkout_timeout",
    });
    log.info("Order cancelled due to timeout", { orderId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Invalid transition")) {
      log.info("Order already in terminal state, skipping cancellation", { orderId });
    } else {
      throw err;
    }
  }
}

/**
 * Removes a pending timeout job for a completed/cancelled order.
 */
export async function cancelTimeout(orderId: string): Promise<void> {
  const job = await timeoutQueue.getJob(`timeout:${orderId}`);
  if (job) {
    await job.remove();
    log.info("Checkout timeout cancelled", { orderId });
  }
}
