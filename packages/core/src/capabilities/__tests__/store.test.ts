import { describe, it, expect, beforeAll } from "vitest";
import { createCapabilityStore } from "../store.js";
import { PricingRequiredError } from "../errors.js";
import { createSqlite } from "../../db/sqlite.js";
import type { DatabaseConnection } from "../../db/index.js";
import type { Capability } from "@agent-adapter/contracts";

let conn: DatabaseConnection;

const makeCap = (overrides: Partial<Capability> = {}): Capability => ({
  name: "test-cap",
  description: "A test capability",
  source: "openapi",
  inputSchema: { type: "object", properties: {} },
  outputSchema: {},
  executionPlan: { method: "GET", url: "https://api.example.com/test" },
  enabled: false,
  pricing: null,
  sourceHash: "abc123",
  ...overrides,
});

beforeAll(async () => {
  conn = createSqlite(":memory:");
  await conn.adapter.initialize();

  const { db } = conn;
  const { providers } = await import("../../db/schema/index.js");
  const now = new Date().toISOString();
  for (const id of ["cap-1", "cap-2", "cap-3", "cap-4", "cap-5a", "cap-5b"]) {
    db.insert(providers)
      .values({ id, name: id, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
  }
});

describe("CapabilityStore", () => {
  it("upsert and get round-trip", () => {
    const store = createCapabilityStore(conn, "cap-1");
    const cap = makeCap({ name: "my-cap" });
    store.upsert(cap);
    const result = store.get("my-cap");
    expect(result).toBeDefined();
    expect(result!.name).toBe("my-cap");
    expect(result!.description).toBe("A test capability");
    expect(result!.source).toBe("openapi");
    expect(result!.executionPlan.method).toBe("GET");
    expect(result!.executionPlan.url).toBe("https://api.example.com/test");
    expect(result!.enabled).toBe(false);
    expect(result!.pricing).toBeNull();
    expect(result!.sourceHash).toBe("abc123");
  });

  it("get returns undefined for missing name", () => {
    const store = createCapabilityStore(conn, "cap-1");
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("upsert preserves enabled and pricing on conflict", () => {
    const store = createCapabilityStore(conn, "cap-2");
    store.upsert(
      makeCap({
        name: "priced",
        enabled: true,
        pricing: { model: "per_call", amount: 0.01, currency: "USD" },
      }),
    );

    // Upsert same name with different description — enabled/pricing should be preserved
    store.upsert(
      makeCap({
        name: "priced",
        description: "Updated description",
        sourceHash: "new-hash",
      }),
    );

    const result = store.get("priced")!;
    expect(result.description).toBe("Updated description");
    expect(result.sourceHash).toBe("new-hash");
    expect(result.enabled).toBe(true);
    expect(result.pricing).toEqual({
      model: "per_call",
      amount: 0.01,
      currency: "USD",
      itemField: undefined,
      floor: undefined,
      ceiling: undefined,
    });
  });

  it("list returns all capabilities for provider", () => {
    const store = createCapabilityStore(conn, "cap-3");
    store.upsert(makeCap({ name: "cap-a" }));
    store.upsert(makeCap({ name: "cap-b" }));
    store.upsert(makeCap({ name: "cap-c" }));
    const all = store.list();
    expect(all).toHaveLength(3);
    expect(all.map((c) => c.name).sort()).toEqual(["cap-a", "cap-b", "cap-c"]);
  });

  it("upsertBatch inserts multiple atomically", () => {
    const store = createCapabilityStore(conn, "cap-4");
    store.upsertBatch([
      makeCap({ name: "batch-1" }),
      makeCap({ name: "batch-2" }),
      makeCap({ name: "batch-3" }),
    ]);
    expect(store.list()).toHaveLength(3);
  });

  it("setEnabled throws PricingRequiredError when no pricing", () => {
    const store = createCapabilityStore(conn, "cap-5a");
    store.upsert(makeCap({ name: "no-price", enabled: false, pricing: null }));
    expect(() => store.setEnabled("no-price", true)).toThrow(
      PricingRequiredError,
    );
    expect(store.get("no-price")!.enabled).toBe(false);
  });

  it("setEnabled succeeds when pricing is set", () => {
    const store = createCapabilityStore(conn, "cap-5b");
    store.upsert(
      makeCap({
        name: "priced",
        enabled: false,
        pricing: { model: "per_call", amount: 0.05, currency: "USD" },
      }),
    );
    store.setEnabled("priced", true);
    expect(store.get("priced")!.enabled).toBe(true);
  });

  it("provider isolation", () => {
    const storeA = createCapabilityStore(conn, "cap-5a");
    const storeB = createCapabilityStore(conn, "cap-5b");
    const namesA = storeA.list().map((c) => c.name);
    const namesB = storeB.list().map((c) => c.name);
    expect(namesA).toContain("no-price");
    expect(namesA).not.toContain("priced");
    expect(namesB).toContain("priced");
    expect(namesB).not.toContain("no-price");
  });
});
