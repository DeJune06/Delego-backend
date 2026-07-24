import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  getCircuitBreaker,
  resetAllCircuitBreakers,
  setCircuitBreaker,
} from "./circuitBreaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
  });

  it("opens the circuit after the failure threshold is reached", async () => {
    const breaker = new CircuitBreaker("orchestrator", { failureThreshold: 3, cooldownMs: 1000 });
    const failing = () => Promise.reject(new Error("boom"));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failing)).rejects.toThrow("boom");
    }

    expect(breaker.getState()).toBe("open");
    await expect(breaker.execute(failing)).rejects.toThrow(CircuitBreakerOpenError);
  });

  it("transitions to half-open after the cooldown elapses", async () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker("wallet", { failureThreshold: 1, cooldownMs: 5000 });
      await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
      expect(breaker.getState()).toBe("open");

      vi.advanceTimersByTime(5001);
      expect(breaker.getState()).toBe("half_open");
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes again once enough successful calls land while half-open", async () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker("payments", {
        failureThreshold: 1,
        cooldownMs: 1000,
        halfOpenSuccessThreshold: 2,
      });
      await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
      vi.advanceTimersByTime(1001);
      expect(breaker.getState()).toBe("half_open");

      await breaker.execute(() => Promise.resolve("ok"));
      expect(breaker.getState()).toBe("half_open");

      await breaker.execute(() => Promise.resolve("ok"));
      expect(breaker.getState()).toBe("closed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-opens immediately if the half-open probe fails", async () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker("orchestrator", { failureThreshold: 1, cooldownMs: 1000 });
      await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
      vi.advanceTimersByTime(1001);
      expect(breaker.getState()).toBe("half_open");

      await expect(breaker.execute(() => Promise.reject(new Error("still down")))).rejects.toThrow(
        "still down"
      );
      expect(breaker.getState()).toBe("open");
    } finally {
      vi.useRealTimers();
    }
  });

  it("provides isolated breakers per downstream service via the registry", () => {
    const orchestrator = getCircuitBreaker("orchestrator");
    const wallet = getCircuitBreaker("wallet");
    expect(orchestrator).not.toBe(wallet);
    expect(getCircuitBreaker("orchestrator")).toBe(orchestrator);
  });

  it("allows overriding a registered breaker for testing", () => {
    const custom = new CircuitBreaker("payments", { failureThreshold: 1 });
    setCircuitBreaker("payments", custom);
    expect(getCircuitBreaker("payments")).toBe(custom);
  });

  it("resets to closed state on demand", async () => {
    const breaker = new CircuitBreaker("wallet", { failureThreshold: 1, cooldownMs: 60_000 });
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(breaker.getState()).toBe("open");

    breaker.reset();
    expect(breaker.getState()).toBe("closed");
  });
});
