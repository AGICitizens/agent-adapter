import { describe, it, expect, beforeAll } from "vitest";
import { createToolHandlers, ToolNotFoundError } from "../index.js";
import type { ToolHandlers } from "../index.js";
import { createSqlite } from "../../db/sqlite.js";
import type { DatabaseConnection } from "../../db/index.js";
import { createJobEngine } from "../../jobs/index.js";
import { createStateStore } from "../../store/state.js";
import { createSecretsStore } from "../../store/secrets.js";
import { createCapabilityRegistry } from "../../capabilities/registry.js";
import { createPaymentRegistry } from "../../payments/index.js";
import { parseEncryptionKey } from "../../store/crypto.js";
import type {
  WalletPlugin,
  WalletRegistry,
  ToolPlugin,
} from "@agent-adapter/contracts";

let conn: DatabaseConnection;
let handlers: ToolHandlers;

const PROVIDER_ID = "tools-test";
const ENC_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Minimal mock wallet plugin
const mockWalletPlugin: WalletPlugin = {
  id: "mock-wallet",
  chain: "solana",
  async getAddress() {
    return "So1anaAddress123";
  },
  async getBalance() {
    return { SOL: 1.5 };
  },
  async signMessage(msg: Uint8Array) {
    return new Uint8Array([...msg, 0xaa, 0xbb]);
  },
  async signTransaction(tx: Uint8Array) {
    return tx;
  },
};

const mockWalletRegistry: WalletRegistry = {
  get(chain: string) {
    if (chain === "solana") return mockWalletPlugin;
    throw new Error(`No wallet for chain: ${chain}`);
  },
  list() {
    return [mockWalletPlugin];
  },
  primary() {
    return mockWalletPlugin;
  },
  has(chain: string) {
    return chain === "solana";
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

  const encKey = parseEncryptionKey(ENC_KEY_HEX);

  handlers = createToolHandlers({
    provider: { providerId: PROVIDER_ID },
    capabilities: createCapabilityRegistry(conn, PROVIDER_ID, [
      {
        type: "manual",
        definitions: [
          {
            name: "test-api",
            description: "A test capability",
            method: "POST",
            url: "https://httpbin.org/post",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
            },
          },
        ],
      },
    ]),
    wallets: mockWalletRegistry,
    secrets: createSecretsStore(conn, PROVIDER_ID, encKey),
    state: createStateStore(conn, PROVIDER_ID),
    jobs: createJobEngine(conn, PROVIDER_ID),
    payments: createPaymentRegistry(),
  });

  // Capabilities are disabled by default — we just verify listing works
});

describe("ToolHandlers", () => {
  it("listTools returns all core tool names", () => {
    const names = handlers.listTools().map((t) => t.name);
    expect(names).toContain("status__whoami");
    expect(names).toContain("net__http_request");
    expect(names).toContain("state__get");
    expect(names).toContain("state__set");
    expect(names).toContain("secrets__get");
    expect(names).toContain("secrets__set");
    expect(names).toContain("jobs__create");
    expect(names).toContain("jobs__pending");
    expect(names).toContain("wallet__address");
    expect(names).toContain("wallet__balance");
    expect(names).toContain("pay__resolve_challenge");
  });

  it("execute throws ToolNotFoundError for unknown tool", async () => {
    await expect(handlers.execute("no_such_tool", {})).rejects.toThrow(
      ToolNotFoundError,
    );
  });

  it("status__whoami returns provider info", async () => {
    const result = await handlers.execute("status__whoami", {});
    expect(result.providerId).toBe(PROVIDER_ID);
    expect(result.capabilities).toBeDefined();
    expect(result.wallets).toBeDefined();
  });

  it("state round-trip via tools", async () => {
    await handlers.execute("state__set", {
      namespace: "test",
      key: "k1",
      value: { hello: "world" },
    });
    const result = await handlers.execute("state__get", {
      namespace: "test",
      key: "k1",
    });
    expect(result.value).toEqual({ hello: "world" });
  });

  it("state__query returns entries", async () => {
    await handlers.execute("state__set", {
      namespace: "q",
      key: "a",
      value: 1,
    });
    await handlers.execute("state__set", {
      namespace: "q",
      key: "b",
      value: 2,
    });
    const result = await handlers.execute("state__query", { namespace: "q" });
    const entries = result.results as Array<{ key: string }>;
    expect(entries).toHaveLength(2);
  });

  it("state__delete removes entry", async () => {
    await handlers.execute("state__set", {
      namespace: "del",
      key: "x",
      value: 1,
    });
    const del = await handlers.execute("state__delete", {
      namespace: "del",
      key: "x",
    });
    expect(del.deleted).toBe(true);
    const get = await handlers.execute("state__get", {
      namespace: "del",
      key: "x",
    });
    expect(get.value).toBeNull();
  });

  it("secrets round-trip via tools", async () => {
    await handlers.execute("secrets__set", {
      platform: "openai",
      key: "api_key",
      value: "sk-test-123",
    });
    const result = await handlers.execute("secrets__get", {
      platform: "openai",
      key: "api_key",
    });
    expect(result.value).toBe("sk-test-123");
  });

  it("secrets__list_keys returns stored keys", async () => {
    const result = await handlers.execute("secrets__list_keys", {
      platform: "openai",
    });
    expect(result.keys).toContain("api_key");
  });

  it("jobs lifecycle via tools", async () => {
    const created = await handlers.execute("jobs__create", {
      capabilityName: "test-api",
      platform: "test",
      platformRef: "ref-1",
    });
    const job = created.job as { id: string; status: string };
    expect(job.status).toBe("pending");

    const executed = await handlers.execute("jobs__execute", { id: job.id });
    expect((executed.job as { status: string }).status).toBe("executing");

    const completed = await handlers.execute("jobs__complete", {
      id: job.id,
      outputHash: "hash-abc",
    });
    const final = completed.job as { status: string; outputHash: string };
    expect(final.status).toBe("completed");
    expect(final.outputHash).toBe("hash-abc");
  });

  it("jobs__pending returns active jobs", async () => {
    const created = await handlers.execute("jobs__create", {
      capabilityName: "test-api",
      platform: "test",
      platformRef: "ref-2",
    });
    const job = created.job as { id: string };
    await handlers.execute("jobs__execute", { id: job.id });

    const result = await handlers.execute("jobs__pending", {});
    const active = result.jobs as Array<{ status: string }>;
    expect(active.length).toBeGreaterThan(0);
    expect(
      active.every((j) => j.status === "pending" || j.status === "executing"),
    ).toBe(true);
  });

  it("wallet__address returns address", async () => {
    const result = await handlers.execute("wallet__address", {});
    expect(result.address).toBe("So1anaAddress123");
    expect(result.chain).toBe("solana");
  });

  it("wallet__balance returns balance", async () => {
    const result = await handlers.execute("wallet__balance", {
      chain: "solana",
    });
    expect(result.balance).toEqual({ SOL: 1.5 });
  });

  it("wallet__sign_message returns hex signature", async () => {
    const result = await handlers.execute("wallet__sign_message", {
      message: "hello",
    });
    expect(typeof result.signature).toBe("string");
    // Mock appends 0xaa 0xbb to the input
    expect((result.signature as string).endsWith("aabb")).toBe(true);
  });

  it("pay__resolve_challenge throws when no adapter", async () => {
    await expect(
      handlers.execute("pay__resolve_challenge", {
        challenge: {
          type: "x402",
          network: "eip155:1",
          payTo: "0x123",
          amount: "1",
          currency: "USDC",
          resource: "/api",
          scheme: "exact",
        },
      }),
    ).rejects.toThrow("No payment adapter found");
  });

  it("registerPlugin adds plugin tools to dispatch", async () => {
    const mockPlugin: ToolPlugin = {
      id: "mock-plugin",
      name: "Mock Plugin",
      description: "Test plugin",
      tools: [
        {
          name: "mock__greet",
          description: "Says hello",
          parameters: {
            type: "object",
            properties: { name: { type: "string" } },
          },
        },
      ],
      async initialize() {},
      async shutdown() {},
      async execute(_toolName, args) {
        return { greeting: `Hello, ${args.name}!` };
      },
    };

    handlers.registerPlugin(mockPlugin);

    // Tool appears in listing
    const names = handlers.listTools().map((t) => t.name);
    expect(names).toContain("mock__greet");

    // Tool is callable
    const result = await handlers.execute("mock__greet", { name: "Alice" });
    expect(result.greeting).toBe("Hello, Alice!");
  });
});
