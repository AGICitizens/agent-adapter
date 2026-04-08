import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createOwsWallet } from "../index.js";

// OWS is a NAPI-RS native addon — skip tests if not available
let owsAvailable = true;
try {
  await import("@open-wallet-standard/core");
} catch {
  owsAvailable = false;
}

const TEST_KEY = new Uint8Array(32).fill(0).map((_, i) => i + 1);
let vaultPath: string;

beforeAll(() => {
  vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), "ows-test-"));
});

afterAll(() => {
  fs.rmSync(vaultPath, { recursive: true, force: true });
});

describe.skipIf(!owsAvailable)("createOwsWallet", () => {
  it("creates a fresh wallet with multi-chain accounts", async () => {
    const result = await createOwsWallet({
      encryptionKey: TEST_KEY,
      vaultPath,
      providerId: "test-fresh",
    });

    expect(result.plugin.id).toBe("wallet-ows");
    expect(result.plugin.chain).toBe("ows");
    expect(result.publicKey).toBeTruthy();
    expect(result.secretKey).toBeUndefined();
    expect(result.supportedChains).toBeDefined();
    expect(result.supportedChains!.length).toBeGreaterThan(0);
    expect(result.supportedChains).toContain("solana");
    expect(result.supportedChains).toContain("evm");
  });

  it("getAddress('solana') returns a valid base58 address", async () => {
    const { plugin } = await createOwsWallet({
      encryptionKey: TEST_KEY,
      vaultPath,
      providerId: "test-addr-sol",
    });

    const address = await plugin.getAddress("solana");
    expect(address).toBeTruthy();
    expect(typeof address).toBe("string");
    // Solana addresses are base58 encoded, 32-44 chars
    expect(address.length).toBeGreaterThanOrEqual(32);
    expect(address.length).toBeLessThanOrEqual(44);
  });

  it("getAddress('evm') returns a valid hex address", async () => {
    const { plugin } = await createOwsWallet({
      encryptionKey: TEST_KEY,
      vaultPath,
      providerId: "test-addr-evm",
    });

    const address = await plugin.getAddress("evm");
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("getAddress throws for unsupported chain", async () => {
    const { plugin } = await createOwsWallet({
      encryptionKey: TEST_KEY,
      vaultPath,
      providerId: "test-addr-unknown",
    });

    await expect(plugin.getAddress("unknown-chain")).rejects.toThrow(
      "no account for chain",
    );
  });

  it("getBalance returns empty object (stub)", async () => {
    const { plugin } = await createOwsWallet({
      encryptionKey: TEST_KEY,
      vaultPath,
      providerId: "test-balance",
    });

    expect(await plugin.getBalance()).toEqual({});
  });

  it("signMessage returns a Uint8Array signature", async () => {
    const { plugin } = await createOwsWallet({
      encryptionKey: TEST_KEY,
      vaultPath,
      providerId: "test-sign-msg",
    });

    const message = new TextEncoder().encode("hello world");
    const signature = await plugin.signMessage(message, "solana");

    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBeGreaterThan(0);
  });

  it("signTransaction rejects invalid transaction bytes", async () => {
    const { plugin } = await createOwsWallet({
      encryptionKey: TEST_KEY,
      vaultPath,
      providerId: "test-sign-tx",
    });

    // OWS validates transaction structure — arbitrary bytes should fail
    const badTx = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(plugin.signTransaction(badTx, "solana")).rejects.toThrow();
  });

  it("is idempotent on restart (same vaultPath + providerId)", async () => {
    const restartVault = fs.mkdtempSync(
      path.join(os.tmpdir(), "ows-restart-"),
    );

    try {
      const first = await createOwsWallet({
        encryptionKey: TEST_KEY,
        vaultPath: restartVault,
        providerId: "test-restart",
      });
      const addr1 = await first.plugin.getAddress("solana");

      // Create again — should load from vault, not generate new
      const second = await createOwsWallet({
        encryptionKey: TEST_KEY,
        vaultPath: restartVault,
        providerId: "test-restart",
      });
      const addr2 = await second.plugin.getAddress("solana");

      expect(addr2).toBe(addr1);
    } finally {
      fs.rmSync(restartVault, { recursive: true, force: true });
    }
  });

  it("resolves CAIP-2 chain identifiers in getAddress", async () => {
    const { plugin } = await createOwsWallet({
      encryptionKey: TEST_KEY,
      vaultPath,
      providerId: "test-caip2",
    });

    // eip155:8453 should resolve to the EVM address
    const evmAddr = await plugin.getAddress("evm");
    const caipAddr = await plugin.getAddress("eip155:8453");
    expect(caipAddr).toBe(evmAddr);
  });
});
