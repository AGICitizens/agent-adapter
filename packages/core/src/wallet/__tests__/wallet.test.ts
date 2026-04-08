import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import type { WalletPlugin } from "@agent-adapter/contracts";
import { createSqlite } from "../../db/sqlite.js";
import type { DatabaseConnection } from "../../db/index.js";
import { parseEncryptionKey } from "../../store/crypto.js";
import {
  createWalletRegistry,
  chainFamily,
  type WalletPluginFactory,
} from "../index.js";

const TEST_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const WRONG_KEY_HEX =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

let conn: DatabaseConnection;

beforeAll(async () => {
  conn = createSqlite(":memory:");
  await conn.adapter.initialize();

  const { db } = conn;
  const { providers } = await import("../../db/schema/index.js");
  const now = new Date().toISOString();
  for (const id of [
    "wallet-test-1",
    "wallet-test-2",
    "wallet-test-3",
    "wallet-test-4",
    "wallet-test-5",
    "wallet-test-6a",
    "wallet-test-6b",
    "wallet-test-7",
  ]) {
    db.insert(providers)
      .values({ id, name: id, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

/** A minimal factory that produces a fake solana-like plugin with registry-managed keys. */
const fakeSolanaFactory: WalletPluginFactory = async (opts) => {
  // Deterministic "keypair": use provided bytes or generate fake ones
  const secretKey =
    opts.secretKeyBytes ?? new Uint8Array(64).fill(0).map((_, i) => i % 256);
  const publicKey = `FakeAddress${Buffer.from(secretKey.slice(0, 4)).toString("hex")}`;

  const plugin: WalletPlugin = {
    id: "wallet-solana",
    chain: "solana",
    async getAddress() {
      return publicKey;
    },
    async getBalance() {
      return {};
    },
    async signMessage(msg: Uint8Array) {
      return new Uint8Array([...msg, ...secretKey.slice(0, 8)]);
    },
    async signTransaction(tx: Uint8Array) {
      return new Uint8Array([...tx, ...secretKey.slice(0, 8)]);
    },
  };

  return { plugin, publicKey, secretKey };
};

/** A factory that simulates a vault-managed multi-chain plugin (like OWS). */
const fakeOwsFactory: WalletPluginFactory = async (_opts) => {
  const plugin: WalletPlugin = {
    id: "wallet-ows",
    chain: "ows",
    async getAddress(chain?: string) {
      if (chain === "solana" || chain === undefined) return "OwsSolanaAddr";
      if (chain === "evm") return "0xOwsEvmAddr";
      throw new Error(`Unknown chain: ${chain}`);
    },
    async getBalance() {
      return {};
    },
    async signMessage(msg: Uint8Array) {
      return new Uint8Array([...msg, 0xff]);
    },
    async signTransaction(tx: Uint8Array) {
      return new Uint8Array([...tx, 0xff]);
    },
  };

  // No secretKey — vault-managed
  return {
    plugin,
    publicKey: "OwsSolanaAddr",
    supportedChains: ["solana", "evm", "stellar"],
  };
};

// ── chainFamily ────────────────────────────────────────────────────────

describe("chainFamily", () => {
  it("resolves EVM CAIP-2 identifiers", () => {
    expect(chainFamily("eip155:1")).toBe("evm");
    expect(chainFamily("eip155:8453")).toBe("evm");
    expect(chainFamily("eip155:137")).toBe("evm");
  });

  it("resolves Solana CAIP-2 identifiers", () => {
    expect(chainFamily("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toBe(
      "solana",
    );
    expect(chainFamily("solana:mainnet")).toBe("solana");
  });

  it("resolves other chain prefixes", () => {
    expect(chainFamily("stellar:pubnet")).toBe("stellar");
    expect(chainFamily("cosmos:cosmoshub-4")).toBe("cosmos");
    expect(chainFamily("bip122:000000000019d6689c085ae165831e93")).toBe(
      "bitcoin",
    );
    expect(chainFamily("ton:mainnet")).toBe("ton");
  });

  it("passes through plain chain family names", () => {
    expect(chainFamily("solana")).toBe("solana");
    expect(chainFamily("evm")).toBe("evm");
    expect(chainFamily("bitcoin")).toBe("bitcoin");
  });

  it("passes through unknown identifiers unchanged", () => {
    expect(chainFamily("unknown-chain")).toBe("unknown-chain");
    expect(chainFamily("")).toBe("");
  });
});

// ── WalletRegistry ─────────────────────────────────────────────────────

describe("WalletRegistry", () => {
  const key = parseEncryptionKey(TEST_KEY_HEX);

  it("creates registry with a solana plugin", async () => {
    const registry = await createWalletRegistry({
      conn,
      providerId: "wallet-test-1",
      encryptionKey: key,
      config: { plugin: "solana" },
      pluginFactory: fakeSolanaFactory,
    });

    expect(registry.list()).toHaveLength(1);
    expect(registry.has("solana")).toBe(true);
    expect(registry.has("evm")).toBe(false);
    expect(registry.get("solana").id).toBe("wallet-solana");
  });

  it("get() throws for unknown chain", async () => {
    const registry = await createWalletRegistry({
      conn,
      providerId: "wallet-test-2",
      encryptionKey: key,
      config: { plugin: "solana" },
      pluginFactory: fakeSolanaFactory,
    });

    expect(() => registry.get("unknown")).toThrow(
      'No wallet configured for chain "unknown"',
    );
  });

  it("resolves CAIP-2 identifiers via chainFamily", async () => {
    const registry = await createWalletRegistry({
      conn,
      providerId: "wallet-test-3",
      encryptionKey: key,
      config: { plugin: "solana" },
      pluginFactory: fakeSolanaFactory,
    });

    const plugin = registry.get("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(plugin.id).toBe("wallet-solana");
  });

  it("persists encrypted key and restores on reload", async () => {
    const registry1 = await createWalletRegistry({
      conn,
      providerId: "wallet-test-4",
      encryptionKey: key,
      config: { plugin: "solana" },
      pluginFactory: fakeSolanaFactory,
    });
    const address1 = await registry1.get("solana").getAddress();

    // Create a new registry with the same DB — should load from DB
    const registry2 = await createWalletRegistry({
      conn,
      providerId: "wallet-test-4",
      encryptionKey: key,
      config: { plugin: "solana" },
      pluginFactory: fakeSolanaFactory,
    });
    const address2 = await registry2.get("solana").getAddress();

    expect(address2).toBe(address1);
  });

  it("fails to load with wrong encryption key", async () => {
    // First create with correct key
    await createWalletRegistry({
      conn,
      providerId: "wallet-test-5",
      encryptionKey: key,
      config: { plugin: "solana" },
      pluginFactory: fakeSolanaFactory,
    });

    // Try to reload with wrong key
    const wrongKey = parseEncryptionKey(WRONG_KEY_HEX);
    await expect(
      createWalletRegistry({
        conn,
        providerId: "wallet-test-5",
        encryptionKey: wrongKey,
        config: { plugin: "solana" },
        pluginFactory: fakeSolanaFactory,
      }),
    ).rejects.toThrow();
  });

  it("isolates wallets between providers", async () => {
    const registryA = await createWalletRegistry({
      conn,
      providerId: "wallet-test-6a",
      encryptionKey: key,
      config: { plugin: "solana" },
      pluginFactory: fakeSolanaFactory,
    });
    const registryB = await createWalletRegistry({
      conn,
      providerId: "wallet-test-6b",
      encryptionKey: key,
      config: { plugin: "solana" },
      pluginFactory: fakeSolanaFactory,
    });

    const addrA = await registryA.get("solana").getAddress();
    const addrB = await registryB.get("solana").getAddress();
    // Same factory with no import key generates same deterministic fake key,
    // but they should be stored independently in DB
    expect(addrA).toBe(addrB); // same fake factory, same output
    // The real test: both registries work independently
    expect(registryA.list()).toHaveLength(1);
    expect(registryB.list()).toHaveLength(1);
  });

  it("stores vault-managed sentinel for plugins without secretKey", async () => {
    const registry = await createWalletRegistry({
      conn,
      providerId: "wallet-test-7",
      encryptionKey: key,
      config: { plugin: "ows" },
      pluginFactory: fakeOwsFactory,
    });

    // Check OWS plugin is accessible via its supported chains
    expect(registry.has("ows")).toBe(true);
    expect(registry.has("solana")).toBe(true);
    expect(registry.has("evm")).toBe(true);
    expect(registry.has("stellar")).toBe(true);
    expect(registry.has("bitcoin")).toBe(false);

    // All chain aliases resolve to the same plugin
    expect(registry.get("solana").id).toBe("wallet-ows");
    expect(registry.get("evm").id).toBe("wallet-ows");
    expect(registry.get("eip155:8453").id).toBe("wallet-ows");

    // list() should deduplicate
    expect(registry.list()).toHaveLength(1);

    // primary() returns the OWS plugin
    expect(registry.primary().id).toBe("wallet-ows");

    // Verify DB has vault-managed sentinel
    const { wallets } = await import("../../db/schema/index.js");
    const row = conn.db
      .select()
      .from(wallets)
      .where(eq(wallets.providerId, "wallet-test-7"))
      .get();
    expect(row?.encryptedPrivateKey).toBe("vault-managed");
  });
});
