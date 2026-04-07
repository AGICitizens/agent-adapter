import { describe, it, expect, beforeAll } from "vitest";
import { createStateStore } from "./state.js";
import { createSqlite } from "../db/sqlite.js";
import type { DatabaseConnection } from "../db/index.js";

let conn: DatabaseConnection;

beforeAll(async () => {
  conn = createSqlite(":memory:");
  await conn.adapter.initialize();

  const { db } = conn;
  const { providers } = await import("../db/schema/index.js");
  const now = new Date().toISOString();
  for (const id of [
    "state-1",
    "state-2",
    "state-3",
    "state-4",
    "state-5",
    "state-6",
    "state-7a",
    "state-7b",
    "state-8a",
    "state-8b",
    "state-9",
    "state-10",
  ]) {
    db.insert(providers)
      .values({ id, name: id, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
  }
});

describe("StateStore", () => {
  it("set and get round-trip", async () => {
    const store = createStateStore(conn, "state-1");
    await store.set("cache", "user:1", { name: "Alice", age: 30 });
    const value = await store.get("cache", "user:1");
    expect(value).toEqual({ name: "Alice", age: 30 });
  });

  it("set overwrites existing value", async () => {
    const store = createStateStore(conn, "state-2");
    await store.set("cache", "counter", 1);
    await store.set("cache", "counter", 2);
    expect(await store.get("cache", "counter")).toBe(2);
  });

  it("get returns null for missing key", async () => {
    const store = createStateStore(conn, "state-3");
    expect(await store.get("cache", "nonexistent")).toBeNull();
  });

  it("delete returns true when key exists", async () => {
    const store = createStateStore(conn, "state-4");
    await store.set("cache", "temp", "value");
    expect(await store.delete("cache", "temp")).toBe(true);
    expect(await store.get("cache", "temp")).toBeNull();
  });

  it("delete returns false when key does not exist", async () => {
    const store = createStateStore(conn, "state-5");
    expect(await store.delete("cache", "nope")).toBe(false);
  });

  it("query returns all entries in namespace", async () => {
    const store = createStateStore(conn, "state-6");
    await store.set("tasks", "a", { done: false });
    await store.set("tasks", "b", { done: true });
    await store.set("tasks", "c", { done: false });
    const results = await store.query("tasks");
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.key).sort()).toEqual(["a", "b", "c"]);
  });

  it("query with prefix filtering", async () => {
    const store = createStateStore(conn, "state-7a");
    await store.set("ns", "user:1", "alice");
    await store.set("ns", "user:2", "bob");
    await store.set("ns", "task:1", "clean");
    const results = await store.query("ns", { prefix: "user:" });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.key).sort()).toEqual(["user:1", "user:2"]);
  });

  it("query with limit and offset", async () => {
    const store = createStateStore(conn, "state-7b");
    await store.set("ns", "a", 1);
    await store.set("ns", "b", 2);
    await store.set("ns", "c", 3);
    await store.set("ns", "d", 4);

    const page1 = await store.query("ns", { limit: 2, orderBy: "key", order: "asc" });
    expect(page1.map((r) => r.key)).toEqual(["a", "b"]);

    const page2 = await store.query("ns", { limit: 2, offset: 2, orderBy: "key", order: "asc" });
    expect(page2.map((r) => r.key)).toEqual(["c", "d"]);
  });

  it("query with desc ordering", async () => {
    const store = createStateStore(conn, "state-8a");
    await store.set("ns", "a", 1);
    await store.set("ns", "b", 2);
    await store.set("ns", "c", 3);
    const results = await store.query("ns", { orderBy: "key", order: "desc" });
    expect(results.map((r) => r.key)).toEqual(["c", "b", "a"]);
  });

  it("query orders by updatedAt", async () => {
    const store = createStateStore(conn, "state-8b");
    // Insert directly with known timestamps to avoid timing issues
    const { db } = conn;
    const { state } = await import("../db/schema/state.js");
    db.insert(state)
      .values({ providerId: "state-8b", namespace: "ns", key: "older", data: "1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" })
      .run();
    db.insert(state)
      .values({ providerId: "state-8b", namespace: "ns", key: "newer", data: "2", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" })
      .run();
    const results = await store.query("ns", { orderBy: "updatedAt", order: "desc" });
    expect(results.map((r) => r.key)).toEqual(["newer", "older"]);
  });

  it("batchSet inserts multiple entries", async () => {
    const store = createStateStore(conn, "state-9");
    await store.batchSet("batch", [
      { key: "x", data: 10 },
      { key: "y", data: 20 },
      { key: "z", data: 30 },
    ]);
    expect(await store.get("batch", "x")).toBe(10);
    expect(await store.get("batch", "y")).toBe(20);
    expect(await store.get("batch", "z")).toBe(30);
  });

  it("batchSet upserts existing entries", async () => {
    const store = createStateStore(conn, "state-10");
    await store.set("batch", "key1", "old");
    await store.batchSet("batch", [
      { key: "key1", data: "new" },
      { key: "key2", data: "fresh" },
    ]);
    expect(await store.get("batch", "key1")).toBe("new");
    expect(await store.get("batch", "key2")).toBe("fresh");
  });

  it("provider isolation", async () => {
    const storeA = createStateStore(conn, "state-7a");
    const storeB = createStateStore(conn, "state-7b");
    // state-7a already has data from prefix test; state-7b from pagination test
    // Set the same namespace+key on both
    await storeA.set("shared", "key", "value-a");
    await storeB.set("shared", "key", "value-b");
    expect(await storeA.get("shared", "key")).toBe("value-a");
    expect(await storeB.get("shared", "key")).toBe("value-b");
  });

  it("namespace isolation", async () => {
    const store = createStateStore(conn, "state-1");
    // state-1 already has "cache" namespace data from round-trip test
    await store.set("other", "user:1", "different");
    expect(await store.get("cache", "user:1")).toEqual({ name: "Alice", age: 30 });
    expect(await store.get("other", "user:1")).toBe("different");
  });
});
