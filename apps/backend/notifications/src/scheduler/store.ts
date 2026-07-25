/** Notification scheduling store contracts (Issue #365) */

export type ScheduledNotificationStatus = "pending" | "cancelled" | "dispatched";

export interface ScheduledNotification {
  id: string;
  userId: string;
  templateName: string;
  payload: Record<string, unknown>;
  /** ISO-8601 timestamp of the next (or only) run. */
  runAt: string;
  /** Cron expression for recurring notifications; undefined for one-time. */
  cronExpression?: string;
  status: ScheduledNotificationStatus;
  createdAt: string;
  updatedAt: string;
  lastDispatchedAt?: string;
}

export interface CreateScheduledNotificationInput {
  userId: string;
  templateName: string;
  payload: Record<string, unknown>;
  runAt: string;
  cronExpression?: string;
}

export interface ScheduledNotificationStore {
  create(input: CreateScheduledNotificationInput): Promise<ScheduledNotification>;
  get(id: string): Promise<ScheduledNotification | null>;
  cancel(id: string): Promise<ScheduledNotification | null>;
  /** Returns all pending notifications whose runAt <= asOf. */
  findDue(asOf: Date): Promise<ScheduledNotification[]>;
  /** Reschedules a recurring notification's next run and marks it dispatched. */
  markDispatchedAndReschedule(
    id: string,
    nextRunAt: string | null
  ): Promise<ScheduledNotification | null>;
}

let idCounter = 0;
function generateId(): string {
  idCounter += 1;
  return `sched-${Date.now()}-${idCounter}`;
}

export class InMemoryScheduledNotificationStore implements ScheduledNotificationStore {
  private readonly notifications = new Map<string, ScheduledNotification>();

  async create(input: CreateScheduledNotificationInput): Promise<ScheduledNotification> {
    const now = new Date().toISOString();
    const record: ScheduledNotification = {
      id: generateId(),
      userId: input.userId,
      templateName: input.templateName,
      payload: input.payload,
      runAt: input.runAt,
      cronExpression: input.cronExpression,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.notifications.set(record.id, record);
    return record;
  }

  async get(id: string): Promise<ScheduledNotification | null> {
    return this.notifications.get(id) ?? null;
  }

  async cancel(id: string): Promise<ScheduledNotification | null> {
    const record = this.notifications.get(id);
    if (!record) return null;
    if (record.status === "pending") {
      record.status = "cancelled";
      record.updatedAt = new Date().toISOString();
    }
    return record;
  }

  async findDue(asOf: Date): Promise<ScheduledNotification[]> {
    const asOfMs = asOf.getTime();
    return [...this.notifications.values()].filter(
      (n) => n.status === "pending" && new Date(n.runAt).getTime() <= asOfMs
    );
  }

  async markDispatchedAndReschedule(
    id: string,
    nextRunAt: string | null
  ): Promise<ScheduledNotification | null> {
    const record = this.notifications.get(id);
    if (!record) return null;

    const now = new Date().toISOString();
    record.lastDispatchedAt = now;
    record.updatedAt = now;

    if (nextRunAt) {
      record.runAt = nextRunAt;
      record.status = "pending";
    } else {
      record.status = "dispatched";
    }

    return record;
  }
}
