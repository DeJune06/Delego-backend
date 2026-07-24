import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelScheduledNotification,
  getScheduledNotification,
  processDueNotifications,
  resetScheduledNotificationStore,
  scheduleNotification,
  scheduleRecurringNotification,
} from "./index.js";

describe("notification scheduler", () => {
  beforeEach(() => {
    resetScheduledNotificationStore();
  });

  describe("scheduleNotification", () => {
    it("schedules a one-time notification for a future timestamp", async () => {
      const runAt = new Date(Date.now() + 60_000).toISOString();
      const record = await scheduleNotification({
        userId: "user-1",
        templateName: "payment-reminder",
        payload: { orderId: "order-1" },
        runAt,
      });

      expect(record.status).toBe("pending");
      expect(record.runAt).toBe(runAt);
      expect(record.cronExpression).toBeUndefined();

      const fetched = await getScheduledNotification(record.id);
      expect(fetched).toEqual(record);
    });

    it("rejects a runAt timestamp in the past", async () => {
      await expect(
        scheduleNotification({
          userId: "user-1",
          templateName: "payment-reminder",
          payload: {},
          runAt: new Date(Date.now() - 60_000).toISOString(),
        })
      ).rejects.toThrow("future timestamp");
    });
  });

  describe("scheduleRecurringNotification", () => {
    it("schedules a recurring notification and computes the first cron run", async () => {
      const from = new Date(Date.UTC(2026, 0, 1, 10, 0));
      const record = await scheduleRecurringNotification({
        userId: "user-1",
        templateName: "delegation-expiry-warning",
        payload: {},
        cronExpression: "0 9 * * *",
        from,
      });

      expect(record.cronExpression).toBe("0 9 * * *");
      expect(record.runAt).toBe(new Date(Date.UTC(2026, 0, 2, 9, 0)).toISOString());
    });

    it("rejects an invalid cron expression", async () => {
      await expect(
        scheduleRecurringNotification({
          userId: "user-1",
          templateName: "x",
          payload: {},
          cronExpression: "not-a-cron",
        })
      ).rejects.toThrow("Invalid cron expression");
    });
  });

  describe("cancelScheduledNotification", () => {
    it("cancels a pending notification", async () => {
      const record = await scheduleNotification({
        userId: "user-1",
        templateName: "payment-reminder",
        payload: {},
        runAt: new Date(Date.now() + 60_000).toISOString(),
      });

      const cancelled = await cancelScheduledNotification(record.id);
      expect(cancelled?.status).toBe("cancelled");

      const fetched = await getScheduledNotification(record.id);
      expect(fetched?.status).toBe("cancelled");
    });

    it("returns null for an unknown id", async () => {
      const result = await cancelScheduledNotification("does-not-exist");
      expect(result).toBeNull();
    });
  });

  describe("processDueNotifications", () => {
    it("dispatches due one-time notifications and marks them dispatched", async () => {
      const record = await scheduleNotification({
        userId: "user-1",
        templateName: "payment-reminder",
        payload: { orderId: "order-1" },
        runAt: new Date(Date.now() + 1000).toISOString(),
      });

      const dispatch = vi.fn();
      const asOf = new Date(Date.now() + 2000);
      const result = await processDueNotifications(dispatch, asOf);

      expect(result.dispatched).toBe(1);
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: record.id }));

      const fetched = await getScheduledNotification(record.id);
      expect(fetched?.status).toBe("dispatched");
    });

    it("does not dispatch cancelled notifications", async () => {
      const record = await scheduleNotification({
        userId: "user-1",
        templateName: "payment-reminder",
        payload: {},
        runAt: new Date(Date.now() + 1000).toISOString(),
      });
      await cancelScheduledNotification(record.id);

      const dispatch = vi.fn();
      const result = await processDueNotifications(dispatch, new Date(Date.now() + 2000));

      expect(result.dispatched).toBe(0);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("reschedules recurring notifications to their next cron occurrence", async () => {
      const from = new Date(Date.UTC(2026, 0, 1, 8, 59));
      const record = await scheduleRecurringNotification({
        userId: "user-1",
        templateName: "delegation-expiry-warning",
        payload: {},
        cronExpression: "0 9 * * *",
        from,
      });
      expect(record.runAt).toBe(new Date(Date.UTC(2026, 0, 1, 9, 0)).toISOString());

      const dispatch = vi.fn();
      const asOf = new Date(Date.UTC(2026, 0, 1, 9, 0));
      const result = await processDueNotifications(dispatch, asOf);

      expect(result.dispatched).toBe(1);
      expect(result.rescheduled).toBe(1);

      const fetched = await getScheduledNotification(record.id);
      expect(fetched?.status).toBe("pending");
      expect(fetched?.runAt).toBe(new Date(Date.UTC(2026, 0, 2, 9, 0)).toISOString());
    });

    it("leaves a notification pending and reports a failure when dispatch throws", async () => {
      const record = await scheduleNotification({
        userId: "user-1",
        templateName: "payment-reminder",
        payload: {},
        runAt: new Date(Date.now() + 1000).toISOString(),
      });

      const dispatch = vi.fn().mockRejectedValue(new Error("smtp down"));
      const result = await processDueNotifications(dispatch, new Date(Date.now() + 2000));

      expect(result.dispatched).toBe(0);
      expect(result.failed).toBe(1);

      const fetched = await getScheduledNotification(record.id);
      expect(fetched?.status).toBe("pending");
    });
  });
});
