import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createSolanaWallet } from "../index.js";

describe("createSolanaWallet", () => {
  it("generates a fresh keypair when no opts provided", async () => {
    const result = await createSolanaWallet({});
    expect(result.publicKey).toBeTruthy();
    expect(result.secretKey).toBeInstanceOf(Uint8Array);
    expect(result.secretKey!.length).toBe(64);
    expect(result.plugin.id).toBe("wallet-solana");
    expect(result.plugin.chain).toBe("solana");
  });

  it("getAddress returns valid base58 address", async () => {
    const result = await createSolanaWallet({});
    const address = await result.plugin.getAddress();

    // Valid base58 should decode without error
    const decoded = bs58.decode(address);
    expect(decoded.length).toBe(32); // Solana public keys are 32 bytes
  });

  it("imports from base58 secret key string", async () => {
    // Generate a known keypair and encode as base58
    const known = Keypair.generate();
    const importKeyString = bs58.encode(known.secretKey);

    const result = await createSolanaWallet({ importKeyString });
    const address = await result.plugin.getAddress();
    expect(address).toBe(known.publicKey.toBase58());
  });

  it("restores from secretKeyBytes (DB round-trip)", async () => {
    const first = await createSolanaWallet({});
    const firstAddress = await first.plugin.getAddress();

    // Simulate registry loading from DB
    const second = await createSolanaWallet({
      secretKeyBytes: first.secretKey!,
    });
    const secondAddress = await second.plugin.getAddress();

    expect(secondAddress).toBe(firstAddress);
  });

  it("same secretKeyBytes always produces same address", async () => {
    const original = await createSolanaWallet({});
    const bytes = original.secretKey!;

    const a = await createSolanaWallet({ secretKeyBytes: bytes });
    const b = await createSolanaWallet({ secretKeyBytes: bytes });

    expect(await a.plugin.getAddress()).toBe(await b.plugin.getAddress());
  });

  it("getBalance returns empty object (stub)", async () => {
    const { plugin } = await createSolanaWallet({});
    expect(await plugin.getBalance()).toEqual({});
  });

  it("signMessage returns valid Ed25519 signature", async () => {
    const { plugin, secretKey } = await createSolanaWallet({});
    const message = new TextEncoder().encode("hello world");
    const signature = await plugin.signMessage(message);

    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(64); // Ed25519 signature

    // Verify with tweetnacl
    const keypair = Keypair.fromSecretKey(secretKey!);
    const valid = nacl.sign.detached.verify(
      message,
      signature,
      keypair.publicKey.toBytes(),
    );
    expect(valid).toBe(true);
  });

  it("signTransaction returns valid Ed25519 signature", async () => {
    const { plugin, secretKey } = await createSolanaWallet({});
    const tx = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = await plugin.signTransaction(tx);

    expect(signature.length).toBe(64);

    const keypair = Keypair.fromSecretKey(secretKey!);
    const valid = nacl.sign.detached.verify(
      tx,
      signature,
      keypair.publicKey.toBytes(),
    );
    expect(valid).toBe(true);
  });

  it("two fresh wallets produce different addresses", async () => {
    const a = await createSolanaWallet({});
    const b = await createSolanaWallet({});
    expect(await a.plugin.getAddress()).not.toBe(await b.plugin.getAddress());
  });
});
