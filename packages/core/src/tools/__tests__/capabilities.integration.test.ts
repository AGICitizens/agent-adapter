import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DatabaseConnection } from "../../db/index.js";
import { createSqlite } from "../../db/sqlite.js";
import { createCapabilityRegistry } from "../../capabilities/registry.js";
import { createToolHandlers } from "../index.js";
import { createStateStore } from "../../store/state.js";
import { createSecretsStore } from "../../store/secrets.js";
import { parseEncryptionKey } from "../../store/crypto.js";
import { createJobEngine } from "../../jobs/index.js";
import { createPaymentRegistry } from "../../payments/index.js";
import type { WalletPlugin, WalletRegistry } from "@agent-adapter/contracts";

const PROVIDER_ID = "cap-int-test";
const ENC_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let conn: DatabaseConnection;
let upstream: ReturnType<typeof createServer>;
let baseUrl: string;

const requestLog: Array<{
  method: string;
  pathname: string;
  search: string;
  bodyText: string;
}> = [];

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
};

const json = (
  res: ServerResponse<IncomingMessage>,
  status: number,
  body: unknown,
) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

const mockWalletPlugin: WalletPlugin = {
  id: "mock-wallet",
  chain: "solana",
  async getAddress() {
    return "So11111111111111111111111111111111111111112";
  },
  async getBalance() {
    return { SOL: 1 };
  },
  async signMessage(message: Uint8Array) {
    return message;
  },
  async signTransaction(transaction: Uint8Array) {
    return transaction;
  },
};

const mockWalletRegistry: WalletRegistry = {
  get() {
    return mockWalletPlugin;
  },
  list() {
    return [mockWalletPlugin];
  },
  primary() {
    return mockWalletPlugin;
  },
  has() {
    return true;
  },
};

beforeAll(async () => {
  conn = createSqlite(":memory:");
  await conn.adapter.initialize();

  const { db } = conn;
  const { providers } = await import("../../db/schema/index.js");
  const now = new Date().toISOString();
  db.insert(providers)
    .values({ id: PROVIDER_ID, name: PROVIDER_ID, createdAt: now, updatedAt: now })
    .run();

  upstream = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const bodyText = await readBody(req);

    requestLog.push({
      method: req.method ?? "GET",
      pathname: url.pathname,
      search: url.search,
      bodyText,
    });

    if (url.pathname === "/openapi.json") {
      return json(res, 200, {
        openapi: "3.0.3",
        info: { title: "Local API", version: "1.0.0" },
        servers: [{ url: baseUrl }],
        paths: {
          "/pets": {
            post: {
              operationId: "createPet",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                      },
                      required: ["name"],
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Created",
                  content: {
                    "application/json": {
                      schema: { type: "object" },
                    },
                  },
                },
              },
            },
          },
          "/pets/{petId}": {
            get: {
              parameters: [
                {
                  name: "petId",
                  in: "path",
                  required: true,
                  schema: { type: "integer" },
                },
                {
                  name: "verbose",
                  in: "query",
                  required: false,
                  schema: { type: "boolean" },
                },
              ],
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    if (req.method === "POST" && url.pathname === "/pets") {
      return json(res, 200, {
        ok: true,
        query: Object.fromEntries(url.searchParams.entries()),
        body: bodyText ? JSON.parse(bodyText) : null,
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/pets/")) {
      return json(res, 200, {
        petId: url.pathname.split("/").pop(),
        query: Object.fromEntries(url.searchParams.entries()),
      });
    }

    json(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => {
    upstream.listen(0, "127.0.0.1", () => resolve());
  });
  const address = upstream.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine upstream address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    upstream.close((err) => (err ? reject(err) : resolve()));
  });
  await conn.adapter.close();
});

describe("Capability execution integration", () => {
  it("discovers OpenAPI capabilities over HTTP and executes them against a real upstream", async () => {
    const registry = createCapabilityRegistry(conn, PROVIDER_ID, [
      {
        type: "openapi",
        url: `${baseUrl}/openapi.json`,
      },
    ]);
    await registry.refresh();

    const { db } = conn;
    const { capabilities } = await import("../../db/schema/index.js");
    db.update(capabilities)
      .set({ enabled: true, pricingModel: "per_call", pricingAmount: 1, pricingCurrency: "USDC" })
      .where(eq(capabilities.providerId, PROVIDER_ID))
      .run();
    await registry.refresh();

    const handlers = createToolHandlers({
      provider: { providerId: PROVIDER_ID },
      capabilities: registry,
      wallets: mockWalletRegistry,
      secrets: createSecretsStore(
        conn,
        PROVIDER_ID,
        parseEncryptionKey(ENC_KEY_HEX),
      ),
      state: createStateStore(conn, PROVIDER_ID),
      jobs: createJobEngine(conn, PROVIDER_ID),
      payments: createPaymentRegistry(),
    });

    const getResult = await handlers.execute("cap__get_pets_petId", {
      petId: 42,
      verbose: true,
    });
    const createResult = await handlers.execute("cap__createPet", {
      traceId: "abc-123",
      body: { name: "Milo" },
    });

    expect(getResult.status).toBe(200);
    expect(getResult.body).toEqual({
      petId: "42",
      query: { verbose: "true" },
    });

    expect(createResult.status).toBe(200);
    expect(createResult.body).toEqual({
      ok: true,
      query: { traceId: "abc-123" },
      body: { name: "Milo" },
    });

    expect(
      requestLog.some(
        (entry) => entry.method === "GET" && entry.pathname === "/pets/42",
      ),
    ).toBe(true);
    expect(
      requestLog.some(
        (entry) =>
          entry.method === "POST" &&
          entry.pathname === "/pets" &&
          entry.search === "?traceId=abc-123" &&
          entry.bodyText === JSON.stringify({ name: "Milo" }),
      ),
    ).toBe(true);
  });
});
