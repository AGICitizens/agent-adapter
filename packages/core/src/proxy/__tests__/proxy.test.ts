import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import type { DatabaseConnection } from "../../db/index.js";
import { createSqlite } from "../../db/sqlite.js";
import { createJobEngine } from "../../jobs/index.js";
import { createCapabilityRegistry } from "../../capabilities/registry.js";
import { createPaymentRegistry } from "../../payments/index.js";
import type { PaymentAdapter } from "@agent-adapter/contracts";

// Mock httpRequest to avoid real HTTP calls
vi.mock("../../tools/http-client.js", () => ({
  httpRequest: vi.fn(),
}));

import { httpRequest } from "../../tools/http-client.js";
import { createProxyEngine, type ProxyEngine } from "../index.js";

const mockedHttpRequest = vi.mocked(httpRequest);

let conn: DatabaseConnection;
let proxy: ProxyEngine;
let paymentRegistry: ReturnType<typeof createPaymentRegistry>;
let capRegistry: ReturnType<typeof createCapabilityRegistry>;

const PROVIDER_ID = "proxy-test";

beforeAll(async () => {
  conn = createSqlite(":memory:");
  await conn.adapter.initialize();

  const { db } = conn;
  const { providers } = await import("../../db/schema/index.js");
  const now = new Date().toISOString();
  db.insert(providers)
    .values({ id: PROVIDER_ID, name: PROVIDER_ID, createdAt: now, updatedAt: now })
    .run();

  paymentRegistry = createPaymentRegistry();

  capRegistry = createCapabilityRegistry(conn, PROVIDER_ID, [
    {
      type: "manual",
      definitions: [
        {
          name: "translate",
          description: "Translate text",
          method: "POST",
          url: "https://api.example.com/translate",
          inputSchema: { type: "object", properties: { text: { type: "string" } } },
        },
        {
          name: "disabled-cap",
          description: "Disabled capability",
          method: "GET",
          url: "https://api.example.com/disabled",
        },
      ],
    },
  ]);
  await capRegistry.refresh();

  // Enable "translate" and set pricing, keep "disabled-cap" disabled
  const { capabilities } = await import("../../db/schema/index.js");
  db.update(capabilities)
    .set({ enabled: true, pricingModel: "per_call", pricingAmount: 0.01, pricingCurrency: "USDC" })
    .where(
      and(
        eq(capabilities.providerId, PROVIDER_ID),
        eq(capabilities.name, "translate"),
      ),
    )
    .run();
  // Reload capability cache
  await capRegistry.refresh();

  proxy = createProxyEngine({
    provider: { providerId: PROVIDER_ID },
    capabilities: capRegistry,
    payments: paymentRegistry,
    jobs: createJobEngine(conn, PROVIDER_ID),
  });
});

describe("ProxyEngine", () => {
  it("returns 404 for unknown capability", async () => {
    const res = await proxy.handleRequest({
      capabilityName: "nonexistent",
      method: "GET",
      headers: {},
    });
    expect(res.status).toBe(404);
    expect((res.body as Record<string, unknown>).error).toBe("capability_not_found");
  });

  it("returns 404 for disabled capability", async () => {
    const res = await proxy.handleRequest({
      capabilityName: "disabled-cap",
      method: "GET",
      headers: {},
    });
    expect(res.status).toBe(404);
    expect((res.body as Record<string, unknown>).error).toBe("capability_disabled");
  });

  it("returns 503 when pricing is missing", async () => {
    const { db } = conn;
    const { capabilities } = await import("../../db/schema/index.js");
    try {
      db.update(capabilities)
        .set({
          enabled: true,
          pricingModel: null,
          pricingAmount: null,
          pricingCurrency: null,
        })
        .where(
          and(
            eq(capabilities.providerId, PROVIDER_ID),
            eq(capabilities.name, "translate"),
          ),
        )
        .run();
      await capRegistry.refresh();

      const res = await proxy.handleRequest({
        capabilityName: "translate",
        method: "POST",
        headers: {},
        body: { text: "hello" },
      });

      expect(res.status).toBe(503);
      expect((res.body as Record<string, unknown>).error).toBe(
        "pricing_not_configured",
      );
    } finally {
      db.update(capabilities)
        .set({
          enabled: true,
          pricingModel: "per_call",
          pricingAmount: 0.01,
          pricingCurrency: "USDC",
        })
        .where(
          and(
            eq(capabilities.providerId, PROVIDER_ID),
            eq(capabilities.name, "translate"),
          ),
        )
        .run();
      await capRegistry.refresh();
    }
  });

  it("returns 402 with pricing when no payment proof", async () => {
    const res = await proxy.handleRequest({
      capabilityName: "translate",
      method: "POST",
      headers: {},
      body: { text: "hello" },
    });
    expect(res.status).toBe(402);
    const body = res.body as Record<string, unknown>;
    expect(body.error).toBe("payment_required");
    expect(body.pricing).toBeDefined();
    expect(body.accepts).toBeDefined();
  });

  it("returns 402 when payment proof is invalid", async () => {
    // Register an adapter that rejects all proofs
    const rejectAdapter: PaymentAdapter = {
      id: "strict",
      canHandle: () => true,
      pay: async () => ({
        protocol: "strict", network: "", amount: "0", currency: "USDC",
        txHash: null, proof: null, timestamp: new Date().toISOString(),
      }),
      verify: async () => false,
    };
    paymentRegistry.register(rejectAdapter);

    const res = await proxy.handleRequest({
      capabilityName: "translate",
      method: "POST",
      headers: { "x-payment": "bad-proof" },
      body: { text: "hello" },
    });
    expect(res.status).toBe(402);
    expect((res.body as Record<string, unknown>).error).toBe("payment_invalid");
  });

  it("forwards request on valid payment proof", async () => {
    // Register an adapter that accepts all proofs
    const freeAdapter: PaymentAdapter = {
      id: "free",
      canHandle: () => true,
      pay: async () => ({
        protocol: "free", network: "", amount: "0", currency: "USDC",
        txHash: null, proof: null, timestamp: new Date().toISOString(),
      }),
      verify: async () => true,
    };
    paymentRegistry.register(freeAdapter);

    mockedHttpRequest.mockResolvedValueOnce({
      status: 200,
      headers: { "content-type": "application/json" },
      body: { translated: "hola" },
    });

    const res = await proxy.handleRequest({
      capabilityName: "translate",
      method: "POST",
      headers: { "x-payment": "valid-proof" },
      body: { text: "hello" },
    });

    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>).translated).toBe("hola");
    expect(mockedHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://api.example.com/translate",
        responseMode: "proxy",
      }),
    );
  });

  it("returns 502 when target service is unreachable", async () => {
    mockedHttpRequest.mockRejectedValueOnce(new Error("fetch failed"));

    const res = await proxy.handleRequest({
      capabilityName: "translate",
      method: "POST",
      headers: { "x-payment": "valid-proof" },
      body: { text: "hello" },
    });

    expect(res.status).toBe(502);
    expect((res.body as Record<string, unknown>).error).toBe("target_unreachable");
  });
});
