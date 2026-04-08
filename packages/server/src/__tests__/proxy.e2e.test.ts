import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index.js";
import { createSqlite } from "../../../core/src/db/sqlite.js";
import type { DatabaseConnection } from "../../../core/src/db/index.js";
import { createCapabilityRegistry } from "../../../core/src/capabilities/registry.js";
import { createPaymentRegistry } from "../../../core/src/payments/index.js";
import { createJobEngine } from "../../../core/src/jobs/index.js";
import { createProxyEngine } from "../../../core/src/proxy/index.js";
import type { PaymentAdapter } from "@agent-adapter/contracts";

const PROVIDER_ID = "server-e2e";

let conn: DatabaseConnection;
let upstream: ReturnType<typeof createHttpServer>;
let upstreamUrl: string;
let registry: ReturnType<typeof createCapabilityRegistry>;
let requestBodies: Uint8Array[] = [];

const readRawBody = async (req: IncomingMessage): Promise<Uint8Array> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Uint8Array.from(Buffer.concat(chunks));
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
  conn = createSqlite(":memory:");
  await conn.adapter.initialize();

  const { db } = conn;
  const { providers, capabilities } = await import("../../../core/src/db/schema/index.js");
  const now = new Date().toISOString();
  db.insert(providers)
    .values({ id: PROVIDER_ID, name: PROVIDER_ID, createdAt: now, updatedAt: now })
    .run();

  upstream = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readRawBody(req);
    requestBodies.push(body);

    if (url.pathname === "/translate") {
      const parsed = JSON.parse(Buffer.from(body).toString("utf-8"));
      return sendJson(res, 200, {
        translated: `${parsed.text}-${url.searchParams.get("target")}`,
      });
    }

    if (url.pathname === "/text") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/plain");
      res.end("plain pong");
      return;
    }

    if (url.pathname === "/blob") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/octet-stream");
      res.end(Buffer.from([1, 2, 3, 4]));
      return;
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

  registry = createCapabilityRegistry(conn, PROVIDER_ID, [
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
        {
          name: "text-ping",
          description: "Plain text response",
          method: "GET",
          url: `${upstreamUrl}/text`,
        },
        {
          name: "download-blob",
          description: "Binary response",
          method: "GET",
          url: `${upstreamUrl}/blob`,
        },
      ],
    },
  ]);
  await registry.refresh();
  db.update(capabilities)
    .set({
      enabled: true,
      pricingModel: "per_call",
      pricingAmount: 0.01,
      pricingCurrency: "USDC",
    })
    .run();
  await registry.refresh();
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    upstream.close((err) => (err ? reject(err) : resolve()));
  });
  await conn.adapter.close();
});

describe("Proxy sub-path E2E", () => {
  it("runs the real server -> proxy -> upstream JSON flow", async () => {
    requestBodies = [];

    const payments = createPaymentRegistry();
    const adapter: PaymentAdapter = {
      id: "free",
      canHandle: (challenge) => challenge.type === "free",
      async pay(challenge) {
        return {
          protocol: "free",
          network: challenge.network,
          amount: "0",
          currency: challenge.currency,
          txHash: null,
          proof: null,
          timestamp: new Date().toISOString(),
        };
      },
      async verify(proof) {
        return proof === "ok-proof";
      },
    };
    payments.register(adapter);

    const proxyEngine = createProxyEngine({
      provider: { providerId: PROVIDER_ID },
      capabilities: registry,
      payments,
      jobs: createJobEngine(conn, PROVIDER_ID),
    });

    const { app } = createServer(
      { proxyEngine },
      { host: "127.0.0.1", port: 0, dashboard: false },
    );

    const response = await app.request("/proxy/translate?target=es", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment": "ok-proof",
      },
      body: JSON.stringify({
        text: "hello",
        body: { text: "hello" },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ translated: "hello-es" });
    expect(requestBodies).toHaveLength(1);
    expect(Buffer.from(requestBodies[0]!).toString("utf-8")).toBe(
      JSON.stringify({ text: "hello" }),
    );
  });

  it("preserves plain-text and binary responses through the server proxy", async () => {
    const payments = createPaymentRegistry();
    payments.register({
      id: "free",
      canHandle: (challenge) => challenge.type === "free",
      async pay(challenge) {
        return {
          protocol: "free",
          network: challenge.network,
          amount: "0",
          currency: challenge.currency,
          txHash: null,
          proof: null,
          timestamp: new Date().toISOString(),
        };
      },
      async verify() {
        return true;
      },
    });

    const proxyEngine = createProxyEngine({
      provider: { providerId: PROVIDER_ID },
      capabilities: registry,
      payments,
      jobs: createJobEngine(conn, PROVIDER_ID),
    });

    const { app } = createServer(
      { proxyEngine },
      { host: "127.0.0.1", port: 0, dashboard: false },
    );

    const textRes = await app.request("/proxy/text-ping", {
      headers: { "x-payment": "ok" },
    });
    expect(textRes.status).toBe(200);
    expect(textRes.headers.get("content-type")).toContain("text/plain");
    expect(await textRes.text()).toBe("plain pong");

    const blobRes = await app.request("/proxy/download-blob", {
      headers: { "x-payment": "ok" },
    });
    expect(blobRes.status).toBe(200);
    expect(blobRes.headers.get("content-type")).toContain(
      "application/octet-stream",
    );
    expect(new Uint8Array(await blobRes.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
  });
});
