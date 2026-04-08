import { describe, it, expect, beforeAll } from "vitest";
import { createJobEngine, InvalidJobTransitionError } from "./index.js";
import { createSqlite } from "../db/sqlite.js";
import type { DatabaseConnection } from "../db/index.js";

let conn: DatabaseConnection;

const PROVIDER_IDS = Array.from({ length: 20 }, (_, i) => `job-${i + 1}`);

beforeAll(async () => {
  conn = createSqlite(":memory:");
  await conn.adapter.initialize();

  const { db } = conn;
  const { providers } = await import("../db/schema/index.js");
  const now = new Date().toISOString();
  for (const id of PROVIDER_IDS) {
    db.insert(providers)
      .values({ id, name: id, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
  }
});

describe("JobEngine", () => {
  it("create returns a job with pending status and generated id", async () => {
    const engine = createJobEngine(conn, "job-1");
    const job = await engine.create({
      capabilityName: "text-to-image",
      platform: "openai",
      platformRef: "req-001",
    });

    expect(job.id).toBeTruthy();
    expect(job.status).toBe("pending");
    expect(job.providerId).toBe("job-1");
    expect(job.capabilityName).toBe("text-to-image");
    expect(job.platform).toBe("openai");
    expect(job.platformRef).toBe("req-001");
    expect(job.createdAt).toBeTruthy();
    expect(job.completedAt).toBeNull();
    expect(job.inputHash).toBeNull();
  });

  it("create stores inputHash when provided", async () => {
    const engine = createJobEngine(conn, "job-2");
    const job = await engine.create({
      capabilityName: "translate",
      platform: "deepl",
      platformRef: "req-002",
      inputHash: "abc123",
    });

    expect(job.inputHash).toBe("abc123");
  });

  it("get returns the created job", async () => {
    const engine = createJobEngine(conn, "job-3");
    const created = await engine.create({
      capabilityName: "summarize",
      platform: "anthropic",
      platformRef: "req-003",
    });

    const fetched = await engine.get(created.id);
    expect(fetched).toEqual(created);
  });

  it("get returns undefined for nonexistent id", async () => {
    const engine = createJobEngine(conn, "job-4");
    expect(await engine.get("nonexistent")).toBeUndefined();
  });

  it("get is provider-scoped", async () => {
    const engineA = createJobEngine(conn, "job-5");
    const engineB = createJobEngine(conn, "job-6");
    const job = await engineA.create({
      capabilityName: "cap",
      platform: "plat",
      platformRef: "ref",
    });

    expect(await engineA.get(job.id)).toBeDefined();
    expect(await engineB.get(job.id)).toBeUndefined();
  });

  it("transition pending → executing", async () => {
    const engine = createJobEngine(conn, "job-7");
    const job = await engine.create({
      capabilityName: "cap",
      platform: "plat",
      platformRef: "ref",
    });

    const updated = await engine.transition(job.id, "executing");
    expect(updated.status).toBe("executing");
    expect(updated.completedAt).toBeNull();
  });

  it("transition executing → completed sets completedAt", async () => {
    const engine = createJobEngine(conn, "job-8");
    const job = await engine.create({
      capabilityName: "cap",
      platform: "plat",
      platformRef: "ref",
    });
    await engine.transition(job.id, "executing");
    const completed = await engine.transition(job.id, "completed");

    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeTruthy();
  });

  it("transition executing → failed sets completedAt", async () => {
    const engine = createJobEngine(conn, "job-9");
    const job = await engine.create({
      capabilityName: "cap",
      platform: "plat",
      platformRef: "ref",
    });
    await engine.transition(job.id, "executing");
    const failed = await engine.transition(job.id, "failed");

    expect(failed.status).toBe("failed");
    expect(failed.completedAt).toBeTruthy();
  });

  it("transition pending → completed throws InvalidJobTransitionError", async () => {
    const engine = createJobEngine(conn, "job-10");
    const job = await engine.create({
      capabilityName: "cap",
      platform: "plat",
      platformRef: "ref",
    });

    await expect(engine.transition(job.id, "completed")).rejects.toThrow(
      InvalidJobTransitionError,
    );
  });

  it("transition pending → failed throws InvalidJobTransitionError", async () => {
    const engine = createJobEngine(conn, "job-11");
    const job = await engine.create({
      capabilityName: "cap",
      platform: "plat",
      platformRef: "ref",
    });

    await expect(engine.transition(job.id, "failed")).rejects.toThrow(
      InvalidJobTransitionError,
    );
  });

  it("transition from terminal state throws", async () => {
    const engine = createJobEngine(conn, "job-12");
    const job = await engine.create({
      capabilityName: "cap",
      platform: "plat",
      platformRef: "ref",
    });
    await engine.transition(job.id, "executing");
    await engine.transition(job.id, "completed");

    await expect(engine.transition(job.id, "executing")).rejects.toThrow(
      InvalidJobTransitionError,
    );
  });

  it("transition nonexistent job throws", async () => {
    const engine = createJobEngine(conn, "job-13");

    await expect(engine.transition("no-such-id", "executing")).rejects.toThrow(
      "Job not found",
    );
  });

  it("transition with outputHash", async () => {
    const engine = createJobEngine(conn, "job-14");
    const job = await engine.create({
      capabilityName: "cap",
      platform: "plat",
      platformRef: "ref",
    });
    await engine.transition(job.id, "executing");
    const completed = await engine.transition(job.id, "completed", {
      outputHash: "out-hash-xyz",
    });

    expect(completed.outputHash).toBe("out-hash-xyz");
  });

  it("list returns jobs for provider", async () => {
    const engine = createJobEngine(conn, "job-15");
    await engine.create({ capabilityName: "a", platform: "p", platformRef: "r1" });
    await engine.create({ capabilityName: "b", platform: "p", platformRef: "r2" });
    await engine.create({ capabilityName: "c", platform: "p", platformRef: "r3" });

    const all = await engine.list();
    expect(all).toHaveLength(3);
  });

  it("list filters by status", async () => {
    const engine = createJobEngine(conn, "job-16");
    const j1 = await engine.create({ capabilityName: "a", platform: "p", platformRef: "r1" });
    await engine.create({ capabilityName: "b", platform: "p", platformRef: "r2" });
    await engine.transition(j1.id, "executing");

    const executing = await engine.list({ status: "executing" });
    expect(executing).toHaveLength(1);
    expect(executing[0]!.id).toBe(j1.id);
  });

  it("list filters by capabilityName", async () => {
    const engine = createJobEngine(conn, "job-17");
    await engine.create({ capabilityName: "translate", platform: "p", platformRef: "r1" });
    await engine.create({ capabilityName: "summarize", platform: "p", platformRef: "r2" });
    await engine.create({ capabilityName: "translate", platform: "p", platformRef: "r3" });

    const results = await engine.list({ capabilityName: "translate" });
    expect(results).toHaveLength(2);
    expect(results.every((j) => j.capabilityName === "translate")).toBe(true);
  });

  it("list default order is createdAt desc", async () => {
    // Insert directly with known timestamps to avoid same-millisecond collisions
    const { db } = conn;
    const { jobs } = await import("../db/schema/index.js");
    const ids = ["order-a", "order-b", "order-c"];
    for (const [i, id] of ids.entries()) {
      db.insert(jobs)
        .values({
          id,
          providerId: "job-18",
          capabilityName: "cap",
          platform: "p",
          platformRef: `r${i}`,
          status: "pending",
          createdAt: `2026-01-0${i + 1}T00:00:00.000Z`,
        })
        .run();
    }

    const engine = createJobEngine(conn, "job-18");
    const all = await engine.list();
    // Most recent first
    const orderIds = all.filter((j) => ids.includes(j.id)).map((j) => j.id);
    expect(orderIds).toEqual(["order-c", "order-b", "order-a"]);
  });

  it("list pagination with limit and offset", async () => {
    // Reuse job-18 which has 3 jobs
    const engine = createJobEngine(conn, "job-18");
    const page = await engine.list({ limit: 1, offset: 1 });
    expect(page).toHaveLength(1);
  });

  it("updatePayment sets payment fields", async () => {
    const engine = createJobEngine(conn, "job-19");
    const job = await engine.create({
      capabilityName: "cap",
      platform: "plat",
      platformRef: "ref",
    });

    await engine.updatePayment(job.id, {
      paymentProtocol: "x402",
      paymentStatus: "pending",
      paymentAmount: 0.005,
      paymentCurrency: "USDC",
    });

    const updated = await engine.get(job.id);
    expect(updated!.paymentProtocol).toBe("x402");
    expect(updated!.paymentStatus).toBe("pending");
    expect(updated!.paymentAmount).toBe(0.005);
    expect(updated!.paymentCurrency).toBe("USDC");
  });

  it("updatePayment throws for nonexistent job", async () => {
    const engine = createJobEngine(conn, "job-19");

    await expect(
      engine.updatePayment("no-such-id", {
        paymentProtocol: "x402",
        paymentStatus: "pending",
        paymentAmount: 1,
        paymentCurrency: "USDC",
      }),
    ).rejects.toThrow("Job not found");
  });

  it("updateLlmUsage accumulates tokens across calls", async () => {
    const engine = createJobEngine(conn, "job-20");
    const job = await engine.create({
      capabilityName: "cap",
      platform: "plat",
      platformRef: "ref",
    });

    await engine.updateLlmUsage(job.id, {
      llmInputTokens: 100,
      llmOutputTokens: 50,
      llmEstimatedCost: 0.002,
    });
    await engine.updateLlmUsage(job.id, {
      llmInputTokens: 200,
      llmOutputTokens: 100,
      llmEstimatedCost: 0.004,
    });

    const updated = await engine.get(job.id);
    expect(updated!.llmInputTokens).toBe(300);
    expect(updated!.llmOutputTokens).toBe(150);
    expect(updated!.llmEstimatedCost).toBeCloseTo(0.006);
  });

  it("count returns total and filtered counts", async () => {
    // Reuse job-16 which has 1 executing + 1 pending
    const engine = createJobEngine(conn, "job-16");

    const total = await engine.count();
    expect(total).toBe(2);

    const executingCount = await engine.count({ status: "executing" });
    expect(executingCount).toBe(1);
  });

  it("listActive returns only pending and executing jobs", async () => {
    const engine = createJobEngine(conn, "job-16");
    // job-16 has 1 executing + 1 pending from earlier test
    const active = await engine.listActive();
    expect(active).toHaveLength(2);
    expect(active.every((j) => j.status === "pending" || j.status === "executing")).toBe(true);
  });

  it("provider isolation on list and count", async () => {
    const engineA = createJobEngine(conn, "job-5");
    const engineB = createJobEngine(conn, "job-6");

    // job-5 has 1 job from the provider-scoped get test
    const listA = await engineA.list();
    const listB = await engineB.list();

    expect(listA.length).toBeGreaterThan(0);
    expect(listB).toHaveLength(0);

    expect(await engineA.count()).toBe(listA.length);
    expect(await engineB.count()).toBe(0);
  });
});
