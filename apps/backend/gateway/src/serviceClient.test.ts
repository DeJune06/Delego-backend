import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callDownstreamService } from "./serviceClient.js";
import { CircuitBreaker, resetAllCircuitBreakers, setCircuitBreaker } from "./circuitBreaker.js";

describe("callDownstreamService", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetAllCircuitBreakers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns data when the downstream call succeeds", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    }) as unknown as typeof fetch;

    const result = await callDownstreamService("orchestrator", { path: "/health" });

    expect(result.degraded).toBe(false);
    if (!result.degraded) {
      expect(result.data).toEqual({ status: "ok" });
    }
  });

  it("returns a degraded response when the circuit is open", async () => {
    const openBreaker = new CircuitBreaker("wallet", { failureThreshold: 1, cooldownMs: 60_000 });
    await expect(openBreaker.execute(() => Promise.reject(new Error("down")))).rejects.toThrow();
    setCircuitBreaker("wallet", openBreaker);

    global.fetch = vi.fn() as unknown as typeof fetch;

    const result = await callDownstreamService("wallet", { path: "/accounts/abc" });

    expect(result.degraded).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    if (result.degraded) {
      expect(result.data.service).toBe("wallet");
    }
  });

  it("returns a degraded response when the downstream call fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

    const result = await callDownstreamService("payments", { path: "/escrow/health" });

    expect(result.degraded).toBe(true);
    if (result.degraded) {
      expect(result.data.message).toContain("payments");
    }
  });
});
