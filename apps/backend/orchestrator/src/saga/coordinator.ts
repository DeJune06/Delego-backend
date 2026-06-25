import { createLogger, type Logger } from "@delego/utils";
import { SagaConcurrencyError, type SagaRecord, type SagaStep, type SagaStore } from "./types.js";

export interface SagaCoordinatorOptions<TContext> {
  /** Saga steps in the order they should execute. Compensations run in reverse order. */
  steps: Array<SagaStep<TContext>>;
  store: SagaStore;
  log?: Logger;
}

/**
 * Runs an ordered set of saga steps against a durable store, compensating completed
 * steps in reverse order if any step fails. Safe to call run()/resume() repeatedly for
 * the same sagaId — already-completed steps are skipped, which makes retries idempotent
 * and lets execution resume cleanly after an orchestrator crash.
 */
export class SagaCoordinator<TContext extends Record<string, unknown>> {
  private readonly steps: Map<string, SagaStep<TContext>>;
  private readonly stepOrder: string[];
  private readonly store: SagaStore;
  private readonly log: Logger;

  constructor(options: SagaCoordinatorOptions<TContext>) {
    if (options.steps.length === 0) {
      throw new Error("SagaCoordinator requires at least one step");
    }
    const seen = new Set<string>();
    for (const step of options.steps) {
      if (seen.has(step.name)) {
        throw new Error(`Duplicate saga step name: ${step.name}`);
      }
      seen.add(step.name);
    }
    this.steps = new Map(options.steps.map((step) => [step.name, step]));
    this.stepOrder = options.steps.map((step) => step.name);
    this.store = options.store;
    this.log = options.log ?? createLogger("orchestrator:saga");
  }

  /** Starts a new saga, or resumes it if sagaId was already started (idempotent). */
  async run(sagaId: string, orderId: string, initialContext: TContext): Promise<SagaRecord<TContext>> {
    const now = new Date();
    const record = await this.store.createIfNotExists({
      sagaId,
      orderId,
      status: "running",
      completedSteps: [],
      context: initialContext,
      currentStep: this.stepOrder[0] ?? null,
      error: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
    // createIfNotExists() can return a previously completed/failed record — treat both as
    // terminal so a retried run() never restarts a saga that already finished.
    if (record.status === "completed" || record.status === "failed") {
      return record as SagaRecord<TContext>;
    }
    return this.advance(record as SagaRecord<TContext>);
  }

  /** Continues a previously started saga from its persisted state — used for crash recovery and manual retries. */
  async resume(sagaId: string): Promise<SagaRecord<TContext>> {
    const record = await this.store.get(sagaId);
    if (!record) {
      throw new Error(`Saga not found: ${sagaId}`);
    }
    if (record.status === "completed" || record.status === "failed") {
      return record as SagaRecord<TContext>;
    }
    return this.advance(record as SagaRecord<TContext>);
  }

  /** Resumes every saga left in "running" or "compensating" — call once at startup. */
  async recoverAll(): Promise<void> {
    const incomplete = await this.store.listIncomplete();
    for (const record of incomplete) {
      this.log.warn("Recovering incomplete saga after restart", {
        sagaId: record.sagaId,
        status: record.status,
      });
      try {
        await this.resume(record.sagaId);
      } catch (err) {
        this.log.error("Saga recovery failed", {
          sagaId: record.sagaId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async advance(record: SagaRecord<TContext>): Promise<SagaRecord<TContext>> {
    if (record.status === "compensating") {
      return this.compensate(record, new Error(record.error ?? "Saga failed"));
    }

    let current = record;
    const remaining = this.stepOrder.filter((name) => !current.completedSteps.includes(name));

    for (const stepName of remaining) {
      const step = this.steps.get(stepName);
      if (!step) {
        throw new Error(`Unknown saga step: ${stepName}`);
      }

      const claimed = await this.claimStep(current, stepName);
      if (!claimed) return current;
      current = claimed;

      try {
        const context = await step.action(current.context);
        current = await this.save({
          ...current,
          context,
          completedSteps: [...current.completedSteps, stepName],
          updatedAt: new Date(),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.log.error("Saga step failed, starting compensation", {
          sagaId: current.sagaId,
          step: stepName,
          error: error.message,
        });
        current = await this.save({
          ...current,
          status: "compensating",
          error: error.message,
          updatedAt: new Date(),
        });
        return this.compensate(current, error);
      }
    }

    return this.save({ ...current, status: "completed", currentStep: null, updatedAt: new Date() });
  }

  private async compensate(record: SagaRecord<TContext>, error: Error): Promise<SagaRecord<TContext>> {
    let current = record;
    const toCompensate = [...current.completedSteps].reverse();

    for (const stepName of toCompensate) {
      const step = this.steps.get(stepName);
      if (!step) continue;

      const claimed = await this.claimStep(current, stepName);
      if (!claimed) return current;
      current = claimed;

      try {
        const context = await step.compensation(current.context, error);
        current = await this.save({
          ...current,
          context,
          completedSteps: current.completedSteps.filter((name) => name !== stepName),
          updatedAt: new Date(),
        });
      } catch (compErr) {
        const compensationError = compErr instanceof Error ? compErr : new Error(String(compErr));
        this.log.error("Compensation step failed — saga left in compensating state for retry", {
          sagaId: current.sagaId,
          step: stepName,
          error: compensationError.message,
        });
        throw compensationError;
      }
    }

    return this.save({ ...current, status: "failed", currentStep: null, updatedAt: new Date() });
  }

  /**
   * Durably claims a step before its action/compensation runs, so the persisted record always
   * reflects in-progress work before any side effect fires. If another runner (e.g. startup
   * recovery racing a manual resume()) already claimed this saga, the version check in
   * store.save() fails and we back off instead of re-running the step.
   */
  private async claimStep(record: SagaRecord<TContext>, stepName: string): Promise<SagaRecord<TContext> | null> {
    try {
      return await this.save({ ...record, currentStep: stepName, updatedAt: new Date() });
    } catch (err) {
      if (err instanceof SagaConcurrencyError) {
        this.log.warn("Saga step already claimed by another runner, backing off", {
          sagaId: record.sagaId,
          step: stepName,
        });
        return null;
      }
      throw err;
    }
  }

  /** Saves a record of this coordinator's TContext — store.save() is typed generically. */
  private save(record: SagaRecord<TContext>): Promise<SagaRecord<TContext>> {
    return this.store.save(record) as Promise<SagaRecord<TContext>>;
  }
}
