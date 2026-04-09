import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdapterConfig } from "@agent-adapter/contracts";
import { createRuntime } from "../../../core/src/index.js";
import { createProxyEngine } from "../../../core/src/proxy/index.js";
import { createServer } from "../index.js";

const ENC_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let upstream: ReturnType<typeof createHttpServer>;
let upstreamUrl: string;
const requestLog: Array<{ path: string; body: string }> = [];

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
};

const sendJson = (
  res: ServerResponse<IncomingMessage>,
  status: number,
  body: unknown,
) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

beforeAll(async () => {
  upstream = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readBody(req);
    requestLog.push({ path: `${url.pathname}${url.search}`, body });

    if (url.pathname === "/translate") {
      const parsed = body ? JSON.parse(body) : {};
      return sendJson(res, 200, {
        translated: `${parsed.text}-${url.searchParams.get("target")}`,
      });
    }

    sendJson(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => {
    upstream.listen(0, "127.0.0.1", () => resolve());
  });

  const address = upstream.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine upstream address");
  }
  upstreamUrl = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    upstream.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("Management API and capability execution API", () => {
  it("lets a provider price, enable, refresh, and execute a capability", async () => {
    requestLog.length = 0;

    const config: AdapterConfig = {
      name: "server-manage-int",
      mode: "self-hosted",
      database: { driver: "sqlite", path: ":memory:" },
      wallet: { plugin: "wallet-solana" },
      server: { host: "127.0.0.1", port: 0, dashboard: false },
      agent: { enabled: false, maxToolRounds: 10 },
      capabilities: [
        {
          type: "manual",
          definitions: [
            {
              name: "translate",
              description: "Translate text",
              method: "POST",
              url: `${upstreamUrl}/translate`,
              bodyTemplate: { $ref: "input.body" },
            },
          ],
        },
      ],
      payments: [{ type: "free" }],
      plugins: [],
      drivers: [],
      secrets: { encryptionKey: ENC_KEY_HEX },
    };

    const runtime = await createRuntime(config);
    try {
      const proxyEngine = createProxyEngine({
        provider: runtime.provider,
        capabilities: runtime.capabilities,
        payments: runtime.payments,
        jobs: runtime.jobs,
      });
      const { app } = createServer(
        {
          provider: runtime.provider,
          capabilities: runtime.capabilities,
          tools: runtime.tools,
          proxyEngine,
        },
        config.server,
      );

      const statusRes = await app.request("/manage/status");
      expect(statusRes.status).toBe(200);
      await expect(statusRes.json()).resolves.toMatchObject({
        providerId: "default",
        capabilities: { total: 1, enabled: 0, names: [] },
      });

      const prematureToggle = await app.request(
        "/manage/capabilities/translate/toggle",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        },
      );
      expect(prematureToggle.status).toBe(409);
      await expect(prematureToggle.json()).resolves.toMatchObject({
        error: "pricing_required",
      });

      const pricingRes = await app.request(
        "/manage/capabilities/translate/pricing",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "per_call",
            amount: 0.25,
            currency: "USDC",
          }),
        },
      );
      expect(pricingRes.status).toBe(200);
      await expect(pricingRes.json()).resolves.toMatchObject({
        capability: {
          name: "translate",
          enabled: false,
          pricing: {
            model: "per_call",
            amount: 0.25,
            currency: "USDC",
          },
        },
      });

      const listRes = await app.request("/manage/capabilities");
      expect(listRes.status).toBe(200);
      await expect(listRes.json()).resolves.toMatchObject({
        providerId: "default",
        capabilities: [
          {
            name: "translate",
            enabled: false,
            pricing: {
              model: "per_call",
              amount: 0.25,
              currency: "USDC",
            },
          },
        ],
      });

      const toggleRes = await app.request("/manage/capabilities/translate/toggle", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      expect(toggleRes.status).toBe(200);
      await expect(toggleRes.json()).resolves.toMatchObject({
        capability: {
          name: "translate",
          enabled: true,
        },
      });

      const refreshRes = await app.request("/manage/capabilities/refresh", {
        method: "POST",
      });
      expect(refreshRes.status).toBe(200);
      await expect(refreshRes.json()).resolves.toMatchObject({
        providerId: "default",
        result: {
          unchanged: ["translate"],
        },
      });

      const executeRes = await app.request("/api/v1/capabilities/translate/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: "fr",
          body: { text: "hello" },
        }),
      });
      expect(executeRes.status).toBe(200);
      await expect(executeRes.json()).resolves.toEqual({
        translated: "hello-fr",
      });
      expect(requestLog).toContainEqual({
        path: "/translate?target=fr",
        body: JSON.stringify({ text: "hello" }),
      });
    } finally {
      await runtime.close();
    }
  });
});
