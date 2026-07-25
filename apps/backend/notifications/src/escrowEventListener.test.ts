// Tests for escrow event listener — Issue #56
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapEscrowTopicToEventType,
  deriveEscrowEventId,
  normalizeEscrowEvent,
  type RawEscrowRpcEvent,
  type EscrowContractEvent,
} from "./escrowEventListener.js";
import {
  deriveContractEventId,
  InMemoryProcessedContractEventStore,
} from "./dedup-store.js";

// ---------------------------------------------------------------------------
// mapEscrowTopicToEventType
// ---------------------------------------------------------------------------

describe("mapEscrowTopicToEventType", () => {
  it("maps 'created' to escrow_created", () => {
    expect(mapEscrowTopicToEventType("created")).toBe("escrow_created");
  });

  it("maps 'released' to escrow_released", () => {
    expect(mapEscrowTopicToEventType("released")).toBe("escrow_released");
  });

  it("maps 'refunded' to escrow_refunded", () => {
    expect(mapEscrowTopicToEventType("refunded")).toBe("escrow_refunded");
  });

  it("maps 'disputed' to escrow_disputed", () => {
    expect(mapEscrowTopicToEventType("disputed")).toBe("escrow_disputed");
  });

  it("returns null for unknown topic names", () => {
    expect(mapEscrowTopicToEventType("spent")).toBeNull();
    expect(mapEscrowTopicToEventType("")).toBeNull();
    expect(mapEscrowTopicToEventType("CREATED")).toBeNull(); // case-sensitive
  });
});

// ---------------------------------------------------------------------------
// deriveEscrowEventId
// ---------------------------------------------------------------------------

describe("deriveEscrowEventId", () => {
  it("produces a txHash:eventIndex string", () => {
    const id = deriveEscrowEventId("abc123", 3);
    expect(id).toBe("abc123:3");
  });

  it("is identical to deriveContractEventId for the same inputs", () => {
    const a = deriveEscrowEventId("txhash", 7);
    const b = deriveContractEventId("txhash", 7);
    expect(a).toBe(b);
  });

  it("produces different ids for different event indices", () => {
    const id0 = deriveEscrowEventId("txhash", 0);
    const id1 = deriveEscrowEventId("txhash", 1);
    expect(id0).not.toBe(id1);
  });

  it("produces different ids for different tx hashes", () => {
    const a = deriveEscrowEventId("hash-a", 0);
    const b = deriveEscrowEventId("hash-b", 0);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// normalizeEscrowEvent
// ---------------------------------------------------------------------------

function makeTopic(str: string): { toString(): string } {
  return { toString: () => str };
}

/** Build a minimal raw event with a plaintext body (not real XDR). */
function makeRaw(
  override: Partial<RawEscrowRpcEvent> = {}
): RawEscrowRpcEvent {
  return {
    id: "100-0-0-2",
    ledger: 100,
    contractId: "CESCROW1234567890",
    txHash: "txhash-abc",
    topic: [makeTopic("escrow"), makeTopic("released")],
    bodyXdr: "", // empty XDR — decodeEscrowEventBody will return null gracefully
    ...override,
  };
}

describe("normalizeEscrowEvent", () => {
  it("returns null when fewer than 2 topics are present", () => {
    const raw = makeRaw({ topic: [makeTopic("escrow")] });
    expect(normalizeEscrowEvent(raw)).toBeNull();
  });

  it("returns null when the prefix topic is not 'escrow'", () => {
    const raw = makeRaw({ topic: [makeTopic("perm"), makeTopic("released")] });
    expect(normalizeEscrowEvent(raw)).toBeNull();
  });

  it("returns null for an unknown escrow topic name", () => {
    const raw = makeRaw({ topic: [makeTopic("escrow"), makeTopic("unknown")] });
    expect(normalizeEscrowEvent(raw)).toBeNull();
  });

  it("normalises a 'released' event with empty body (graceful defaults)", () => {
    const raw = makeRaw({
      id: "200-1-0-5",
      txHash: "tx-release",
      topic: [makeTopic("escrow"), makeTopic("released")],
    });
    const event = normalizeEscrowEvent(raw);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("escrow_released");
    expect(event!.txHash).toBe("tx-release");
    expect(event!.contractId).toBe("CESCROW1234567890");
    expect(event!.eventIndex).toBe(5);
    // Graceful defaults when XDR decode fails
    expect(event!.buyer).toBe("");
    expect(event!.seller).toBe("");
    expect(event!.amountStroops).toBe("0");
  });

  it("normalises a 'created' event", () => {
    const raw = makeRaw({ topic: [makeTopic("escrow"), makeTopic("created")] });
    const event = normalizeEscrowEvent(raw);
    expect(event!.eventType).toBe("escrow_created");
  });

  it("normalises a 'refunded' event", () => {
    const raw = makeRaw({ topic: [makeTopic("escrow"), makeTopic("refunded")] });
    const event = normalizeEscrowEvent(raw);
    expect(event!.eventType).toBe("escrow_refunded");
  });

  it("normalises a 'disputed' event", () => {
    const raw = makeRaw({ topic: [makeTopic("escrow"), makeTopic("disputed")] });
    const event = normalizeEscrowEvent(raw);
    expect(event!.eventType).toBe("escrow_disputed");
  });

  it("extracts the eventIndex from the last part of the composite id", () => {
    const raw = makeRaw({ id: "500-2-1-9" });
    const event = normalizeEscrowEvent(raw);
    expect(event!.eventIndex).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// InMemoryProcessedContractEventStore (deduplication)
// ---------------------------------------------------------------------------

describe("InMemoryProcessedContractEventStore (escrow dedup)", () => {
  it("returns false for an event that has not been processed", async () => {
    const store = new InMemoryProcessedContractEventStore();
    expect(await store.has("tx123:0")).toBe(false);
  });

  it("returns true after markProcessed is called", async () => {
    const store = new InMemoryProcessedContractEventStore();
    await store.markProcessed("tx123:0", "CCONTRACT1");
    expect(await store.has("tx123:0")).toBe(true);
  });

  it("does not return true for a different event id", async () => {
    const store = new InMemoryProcessedContractEventStore();
    await store.markProcessed("tx123:0", "CCONTRACT1");
    expect(await store.has("tx123:1")).toBe(false);
    expect(await store.has("tx456:0")).toBe(false);
  });

  it("prevents duplicate processing in a simulated listener loop", async () => {
    const store = new InMemoryProcessedContractEventStore();
    const eventId = deriveEscrowEventId("txduplicate", 0);

    let processedCount = 0;
    async function processEvent(id: string): Promise<void> {
      if (await store.has(id)) return; // already processed
      processedCount++;
      await store.markProcessed(id, "CESCROW");
    }

    // Simulate receiving the same event twice (e.g. after reconnect).
    await processEvent(eventId);
    await processEvent(eventId);

    expect(processedCount).toBe(1);
  });

  it("processes distinct events independently", async () => {
    const store = new InMemoryProcessedContractEventStore();

    const ids = [
      deriveEscrowEventId("tx-a", 0),
      deriveEscrowEventId("tx-b", 0),
      deriveEscrowEventId("tx-a", 1),
    ];

    for (const id of ids) {
      await store.markProcessed(id, "CESCROW");
    }

    for (const id of ids) {
      expect(await store.has(id)).toBe(true);
    }

    expect(await store.has(deriveEscrowEventId("tx-c", 0))).toBe(false);
  });
});
