import { describe, it, expect, beforeAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCapabilityRegistry } from "../registry.js";
import { createSqlite } from "../../db/sqlite.js";
import type { DatabaseConnection } from "../../db/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

let conn: DatabaseConnection;

beforeAll(async () => {
  conn = createSqlite(":memory:");
  await conn.adapter.initialize();

  const { db } = conn;
  const { providers } = await import("../../db/schema/index.js");
  const now = new Date().toISOString();
  for (const id of ["reg-1", "reg-2", "reg-3", "reg-4", "reg-5"]) {
    db.insert(providers)
      .values({ id, name: id, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
  }
});

describe("CapabilityRegistry", () => {
  it("refresh with OpenAPI file source discovers capabilities", async () => {
    const registry = createCapabilityRegistry(conn, "reg-1", [
      { type: "openapi", path: resolve(fixturesDir, "petstore.json") },
    ]);
    const result = await registry.refresh();
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.added).toContain("listPets");
    expect(result.added).toContain("createPet");
    expect(result.stale).toEqual([]);
  });

  it("refresh with manual source discovers capabilities", async () => {
    const registry = createCapabilityRegistry(conn, "reg-2", [
      {
        type: "manual",
        definitions: [
          {
            name: "translate",
            description: "Translate text",
            method: "POST",
            url: "https://api.example.com/translate",
          },
        ],
      },
    ]);
    const result = await registry.refresh();
    expect(result.added).toEqual(["translate"]);
  });

  it("getCapability and listCapabilities work after refresh", async () => {
    const registry = createCapabilityRegistry(conn, "reg-3", [
      {
        type: "manual",
        definitions: [
          {
            name: "summarize",
            description: "Summarize text",
            method: "POST",
            url: "https://api.example.com/summarize",
          },
        ],
      },
    ]);
    await registry.refresh();

    const cap = registry.getCapability("summarize");
    expect(cap).toBeDefined();
    expect(cap!.name).toBe("summarize");
    expect(cap!.enabled).toBe(false);
    expect(cap!.pricing).toBeNull();

    const all = registry.listCapabilities();
    expect(all).toHaveLength(1);
  });

  it("detects unchanged capabilities on re-refresh", async () => {
    const registry = createCapabilityRegistry(conn, "reg-4", [
      { type: "openapi", path: resolve(fixturesDir, "petstore.json") },
    ]);

    const first = await registry.refresh();
    expect(first.added.length).toBeGreaterThan(0);

    const second = await registry.refresh();
    expect(second.added).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.unchanged.length).toBe(first.added.length);
    expect(second.stale).toEqual([]);
  });

  it("detects updated capabilities when spec changes", async () => {
    // First refresh with original spec
    const registry = createCapabilityRegistry(conn, "reg-5", [
      { type: "openapi", path: resolve(fixturesDir, "petstore.json") },
    ]);
    const first = await registry.refresh();
    expect(first.added.length).toBeGreaterThan(0);

    // Second refresh with changed spec (different file = different hash)
    const registry2 = createCapabilityRegistry(conn, "reg-5", [
      {
        type: "openapi",
        path: resolve(fixturesDir, "petstore-changed.json"),
      },
    ]);
    const second = await registry2.refresh();
    expect(second.updated.length).toBeGreaterThan(0);
    expect(second.updated).toContain("listPets");
    expect(second.added).toEqual([]);
  });

  it("detects stale capabilities when source removes an operation", async () => {
    // reg-1 already has petstore caps from first test
    const registry = createCapabilityRegistry(conn, "reg-1", [
      {
        type: "manual",
        definitions: [
          {
            name: "new-only",
            description: "Brand new",
            method: "GET",
            url: "https://example.com/new",
          },
        ],
      },
    ]);
    const result = await registry.refresh();
    expect(result.added).toContain("new-only");
    expect(result.stale).toContain("listPets");
    expect(result.stale).toContain("createPet");
  });

  it("inferred source throws not implemented", async () => {
    const registry = createCapabilityRegistry(conn, "reg-2", [
      { type: "inferred" },
    ]);
    await expect(registry.refresh()).rejects.toThrow("not yet implemented");
  });
});
