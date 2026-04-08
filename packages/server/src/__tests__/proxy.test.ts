import { describe, it, expect } from "vitest";
import { createServer } from "../index.js";
import type { ProxyEngine, ProxyResponse } from "@agent-adapter/core/proxy";

const mockResponse = (overrides: Partial<ProxyResponse> = {}): ProxyResponse => ({
  status: 200,
  headers: { "content-type": "application/json" },
  body: { ok: true },
  ...overrides,
});

const createMockProxyEngine = (
  handler: (req: { capabilityName: string }) => ProxyResponse,
): ProxyEngine => ({
  async handleRequest(req) {
    return handler(req);
  },
});

describe("Server proxy routes", () => {
  it("GET /proxy/unknown returns 404 from engine", async () => {
    const engine = createMockProxyEngine(() =>
      mockResponse({
        status: 404,
        body: { error: "capability_not_found" },
      }),
    );

    const { app } = createServer(
      { proxyEngine: engine },
      { host: "127.0.0.1", port: 0, dashboard: false },
    );

    const res = await app.request("/proxy/unknown");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("capability_not_found");
  });

  it("POST /proxy/translate forwards to engine and returns response", async () => {
    const engine = createMockProxyEngine((req) => {
      expect(req.capabilityName).toBe("translate");
      return mockResponse({ body: { translated: "hola" } });
    });

    const { app } = createServer(
      { proxyEngine: engine },
      { host: "127.0.0.1", port: 0, dashboard: false },
    );

    const res = await app.request("/proxy/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.translated).toBe("hola");
  });

  it("returns 402 from engine as-is", async () => {
    const engine = createMockProxyEngine(() =>
      mockResponse({
        status: 402,
        body: { error: "payment_required", pricing: { amount: 0.01 } },
      }),
    );

    const { app } = createServer(
      { proxyEngine: engine },
      { host: "127.0.0.1", port: 0, dashboard: false },
    );

    const res = await app.request("/proxy/translate");
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("payment_required");
  });
});
