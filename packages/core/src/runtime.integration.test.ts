import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AdapterConfig, ToolPlugin } from "@agent-adapter/contracts";
import { createRuntime } from "./index.js";
import { schema } from "./db/index.js";

const ENC_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let upstream: ReturnType<typeof createServer>;
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
  upstream = createServer(async (req, res) => {
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

describe("createRuntime", () => {
  it("boots a real self-hosted runtime and wires execution paths end-to-end", async () => {
    requestLog.length = 0;

    const config: AdapterConfig = {
      name: "runtime-int",
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
      expect(runtime.provider.providerId).toBe("default");
      expect(runtime.capabilities.listCapabilities().map((cap) => cap.name)).toEqual([
        "translate",
      ]);
      expect(runtime.payments.list()).toEqual(["free"]);
      expect(runtime.wallets.list()).toHaveLength(1);

      await runtime.api.setState("core:test", "checkpoint", { ok: true });
      expect(await runtime.api.getState("core:test", "checkpoint")).toEqual({
        ok: true,
      });

      await runtime.secrets.set("demo", "api_key", "secret-123");
      expect(await runtime.secrets.get("demo", "api_key")).toBe("secret-123");

      runtime.db.db
        .update(schema.capabilities)
        .set({
          enabled: true,
          pricingModel: "per_call",
          pricingAmount: 0.01,
          pricingCurrency: "USDC",
        })
        .where(eq(schema.capabilities.providerId, runtime.provider.providerId))
        .run();
      await runtime.capabilities.refresh();

      const capResult = await runtime.tools.execute("cap__translate", {
        target: "es",
        body: { text: "hello" },
      });
      expect(capResult.status).toBe(200);
      expect(capResult.body).toEqual({ translated: "hello-es" });
      expect(requestLog).toContainEqual({
        path: "/translate?target=es",
        body: JSON.stringify({ text: "hello" }),
      });

      const payment = await runtime.tools.execute("pay__resolve_challenge", {
        challenge: {
          type: "free",
          network: "",
          payTo: "",
          amount: "0",
          currency: "USDC",
          resource: "/proxy/translate",
          scheme: "free",
        },
      });
      expect(payment.receipt).toMatchObject({
        protocol: "free",
        amount: "0",
        currency: "USDC",
      });

      const inlinePlugin: ToolPlugin = {
        id: "echo",
        name: "Echo",
        description: "Echoes input",
        tools: [
          {
            name: "echo__ping",
            description: "Echo text",
            parameters: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
          },
        ],
        async initialize() {},
        async shutdown() {},
        async execute(_toolName, args) {
          return { echoed: args.text };
        },
      };
      runtime.api.registerTools(inlinePlugin);
      expect(await runtime.tools.execute("echo__ping", { text: "hi" })).toEqual({
        echoed: "hi",
      });
    } finally {
      await runtime.close();
    }
  });

  it("fails fast when no encryption key is provided", async () => {
    const config: AdapterConfig = {
      name: "runtime-no-key",
      mode: "self-hosted",
      database: { driver: "sqlite", path: ":memory:" },
      wallet: { plugin: "wallet-solana" },
      server: { host: "127.0.0.1", port: 0, dashboard: false },
      agent: { enabled: false, maxToolRounds: 10 },
      capabilities: [],
      payments: [],
      plugins: [],
      drivers: [],
    };

    await expect(createRuntime(config)).rejects.toThrow(
      "createRuntime requires secrets.encryptionKey",
    );
  });
});
