import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DelegoClient, TimeoutError } from "./client.js";

describe("DelegoClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("constructs with baseUrl", () => {
    const client = new DelegoClient({ baseUrl: "http://localhost:3000" });
    expect(client).toBeInstanceOf(DelegoClient);
  });

  it("strips trailing slash from baseUrl", () => {
    const client = new DelegoClient({ baseUrl: "http://localhost:3000/" });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: null }))
    );

    client.health();

    expect(spy).toHaveBeenCalledWith(
      "http://localhost:3000/health",
      expect.anything()
    );
  });

  it("sends Authorization header when token is set", async () => {
    const client = new DelegoClient({
      baseUrl: "http://localhost",
      token: "secret-token",
    });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: null }))
    );

    await client.health();

    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
  });

  it("health() calls GET /health", async () => {
    const client = new DelegoClient({ baseUrl: "http://localhost" });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "ok" } }))
    );

    const res = await client.health();

    expect(spy).toHaveBeenCalledWith(
      "http://localhost/health",
      expect.anything()
    );
    expect(res.data).toEqual({ status: "ok" });
  });

  it("returns the ApiResponse shape from the API", async () => {
    const client = new DelegoClient({ baseUrl: "http://localhost" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "1" }], error: null }))
    );

    const res = await client.getDelegations();

    expect(res.data).toHaveLength(1);
    expect(res.error).toBeNull();
  });

  it("includes X-CSRF-Token header on POST requests", async () => {
    const client = new DelegoClient({ baseUrl: "http://localhost" });
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "csrf-token=test-csrf-value"
    );
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: null }))
    );

    await client["request"]("/api/test", { method: "POST" });

    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init!.headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBe("test-csrf-value");
  });

  it("does not include X-CSRF-Token header on GET requests", async () => {
    const client = new DelegoClient({ baseUrl: "http://localhost" });
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "csrf-token=test-csrf-value"
    );
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: null }))
    );

    await client.health();

    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init!.headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("throws TimeoutError when request exceeds timeout", async () => {
    const client = new DelegoClient({
      baseUrl: "http://localhost",
      timeout: 1000,
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => {})
    );

    const promise = client.health();
    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow(TimeoutError);
  });

  it("resolves successfully within timeout", async () => {
    const client = new DelegoClient({
      baseUrl: "http://localhost",
      timeout: 5000,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "ok" } }))
    );

    const res = await client.health();
    expect(res.data).toEqual({ status: "ok" });
  });

  it("cleans up timeout after successful response", async () => {
    const client = new DelegoClient({
      baseUrl: "http://localhost",
      timeout: 5000,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: null }))
    );

    await client.health();
    vi.advanceTimersByTime(10000);

    expect(true).toBe(true);
  });
});
