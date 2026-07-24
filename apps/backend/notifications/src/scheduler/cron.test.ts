import { describe, expect, it } from "vitest";
import { getNextCronOccurrence, isValidCronExpression, parseCronExpression } from "./cron.js";

describe("parseCronExpression", () => {
  it("parses a wildcard-only expression", () => {
    const parsed = parseCronExpression("* * * * *");
    expect(parsed.minute.values.size).toBe(60);
    expect(parsed.hour.values.size).toBe(24);
  });

  it("parses comma lists and ranges", () => {
    const parsed = parseCronExpression("0,30 9-17 * * 1-5");
    expect([...parsed.minute.values].sort((a, b) => a - b)).toEqual([0, 30]);
    expect(parsed.hour.values.has(9)).toBe(true);
    expect(parsed.hour.values.has(17)).toBe(true);
    expect(parsed.hour.values.has(8)).toBe(false);
    expect([...parsed.dayOfWeek.values].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("parses step values", () => {
    const parsed = parseCronExpression("*/15 * * * *");
    expect([...parsed.minute.values].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
  });

  it("rejects malformed expressions", () => {
    expect(() => parseCronExpression("* * * *")).toThrow();
    expect(() => parseCronExpression("61 * * * *")).toThrow();
    expect(() => parseCronExpression("* 24 * * *")).toThrow();
  });

  it("isValidCronExpression reports validity without throwing", () => {
    expect(isValidCronExpression("0 9 * * 1-5")).toBe(true);
    expect(isValidCronExpression("not a cron")).toBe(false);
  });
});

describe("getNextCronOccurrence", () => {
  it("finds the next matching minute for a wildcard expression", () => {
    const from = new Date(Date.UTC(2026, 0, 1, 10, 30));
    const next = getNextCronOccurrence("* * * * *", from);
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 0, 1, 10, 31)).toISOString());
  });

  it("finds the next daily occurrence at a fixed hour/minute", () => {
    const from = new Date(Date.UTC(2026, 0, 1, 10, 0));
    const next = getNextCronOccurrence("0 9 * * *", from);
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 0, 2, 9, 0)).toISOString());
  });

  it("finds the next weekday occurrence, skipping the weekend", () => {
    // 2026-01-02 is a Friday (UTC).
    const from = new Date(Date.UTC(2026, 0, 2, 12, 0));
    const next = getNextCronOccurrence("0 9 * * 1-5", from);
    // Next weekday 9:00 after Friday noon is Monday 2026-01-05.
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 0, 5, 9, 0)).toISOString());
  });

  it("throws for an invalid cron expression", () => {
    expect(() => getNextCronOccurrence("garbage")).toThrow();
  });
});
