/**
 * Notification Scheduling with Cron Support (Issue #365)
 *
 * Supports scheduling one-time notifications for a specific timestamp and
 * recurring notifications via cron expressions (e.g. payment reminders,
 * delegation expiry warnings). A lightweight in-process poller dispatches
 * due notifications; the store is swappable for a DB-backed implementation.
 */

import { createLogger } from "@delego/utils";
import { getNextCronOccurrence, isValidCronExpression } from "./cron.js";
import {
  InMemoryScheduledNotificationStore,
  type ScheduledNotification,
  type ScheduledNotificationStore,
} from "./store.js";

export {
  isValidCronExpression,
  getNextCronOccurrence,
  parseCronExpression,
} from "./cron.js";
export type { ScheduledNotification, ScheduledNotificationStatus } from "./store.js";

const log = createLogger("notifications:scheduler", process.env.LOG_LEVEL ?? "info");

let store: ScheduledNotificationStore = new InMemoryScheduledNotificationStore();

/** Swap the backing store for a DB-backed implementation in production. */
export function setScheduledNotificationStore(newStore: ScheduledNotificationStore): void {
  store = newStore;
}

export function resetScheduledNotificationStore(): void {
  store = new InMemoryScheduledNotificationStore();
}

export type NotificationDispatchFn = (notification: ScheduledNotification) => Promise<void> | void;

export interface ScheduleOneTimeInput {
  userId: string;
  templateName: string;
  payload: Record<string, unknown>;
  /** ISO-8601 timestamp for delivery. Must be in the future. */
  runAt: string;
}

export interface ScheduleRecurringInput {
  userId: string;
  templateName: string;
  payload: Record<string, unknown>;
  /** Standard 5-field cron expression. */
  cronExpression: string;
  /** Reference time to compute the first occurrence from. Defaults to now. */
  from?: Date;
}

/** Schedules a one-time notification for a specific future timestamp. */
export async function scheduleNotification(
  input: ScheduleOneTimeInput
): Promise<ScheduledNotification> {
  const { userId, templateName, payload, runAt } = input;

  if (!userId || !templateName) {
    throw new Error("userId and templateName are required");
  }

  const runAtDate = new Date(runAt);
  if (Number.isNaN(runAtDate.getTime())) {
    throw new Error(`Invalid runAt timestamp: "${runAt}"`);
  }
  if (runAtDate.getTime() <= Date.now()) {
    throw new Error("runAt must be a future timestamp");
  }

  const record = await store.create({
    userId,
    templateName,
    payload,
    runAt: runAtDate.toISOString(),
  });

  log.info("Scheduled one-time notification", {
    id: record.id,
    userId,
    templateName,
    runAt: record.runAt,
  });

  return record;
}

/** Schedules a recurring notification driven by a cron expression. */
export async function scheduleRecurringNotification(
  input: ScheduleRecurringInput
): Promise<ScheduledNotification> {
  const { userId, templateName, payload, cronExpression, from } = input;

  if (!userId || !templateName) {
    throw new Error("userId and templateName are required");
  }
  if (!isValidCronExpression(cronExpression)) {
    throw new Error(`Invalid cron expression: "${cronExpression}"`);
  }

  const nextRun = getNextCronOccurrence(cronExpression, from ?? new Date());

  const record = await store.create({
    userId,
    templateName,
    payload,
    runAt: nextRun.toISOString(),
    cronExpression,
  });

  log.info("Scheduled recurring notification", {
    id: record.id,
    userId,
    templateName,
    cronExpression,
    nextRun: record.runAt,
  });

  return record;
}

/** Cancels a pending scheduled notification. Returns null if it does not exist. */
export async function cancelScheduledNotification(
  id: string
): Promise<ScheduledNotification | null> {
  const record = await store.cancel(id);
  if (record) {
    log.info("Cancelled scheduled notification", { id, status: record.status });
  }
  return record;
}

export async function getScheduledNotification(id: string): Promise<ScheduledNotification | null> {
  return store.get(id);
}

/**
 * Finds all notifications due at or before `asOf`, dispatches each through
 * `dispatch`, and reschedules recurring ones to their next cron occurrence.
 *
 * A dispatch failure for one notification does not prevent the others from
 * running; it is logged and left `pending` for a future poll to retry.
 */
export async function processDueNotifications(
  dispatch: NotificationDispatchFn,
  asOf: Date = new Date()
): Promise<{ dispatched: number; failed: number; rescheduled: number }> {
  const due = await store.findDue(asOf);
  let dispatched = 0;
  let failed = 0;
  let rescheduled = 0;

  for (const notification of due) {
    try {
      await dispatch(notification);
      dispatched++;

      let nextRunAt: string | null = null;
      if (notification.cronExpression) {
        nextRunAt = getNextCronOccurrence(notification.cronExpression, asOf).toISOString();
        rescheduled++;
      }

      await store.markDispatchedAndReschedule(notification.id, nextRunAt);
    } catch (err) {
      failed++;
      log.error("Failed to dispatch scheduled notification", {
        id: notification.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { dispatched, failed, rescheduled };
}
