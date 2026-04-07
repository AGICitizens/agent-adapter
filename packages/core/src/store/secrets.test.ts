import { describe, it, expect, beforeAll } from "vitest";
import { createSecretsStore } from "./secrets.js";
import { encrypt, decrypt, parseEncryptionKey } from "./crypto.js";
import { createSqlite } from "../db/sqlite.js";
import type { DatabaseConnection } from "../db/index.js";

const TEST_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const WRONG_KEY_HEX =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

let conn: DatabaseConnection;

beforeAll(async () => {
  conn = createSqlite(":memory:");
  await conn.adapter.initialize();

  // Seed test providers (beyond "default") for isolation tests
  const { db } = conn;
  const { providers } = await import("../db/schema/index.js");
  const now = new Date().toISOString();
  for (const id of [
    "provider-1",
    "provider-2",
    "provider-3",
    "provider-4",
    "provider-5",
    "provider-6",
    "provider-7a",
    "provider-7b",
  ]) {
    db.insert(providers)
      .values({ id, name: id, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
  }
});

describe("crypto", () => {
  const key = parseEncryptionKey(TEST_KEY_HEX);

  it("round-trips encrypt/decrypt", () => {
    const plaintext = "super-secret-api-key";
    const encrypted = encrypt(key, plaintext);
    expect(decrypt(key, encrypted)).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext", () => {
    const plaintext = "same-value";
    const a = encrypt(key, plaintext);
    const b = encrypt(key, plaintext);
    expect(a).not.toBe(b);
  });

  it("fails to decrypt with wrong key", () => {
    const encrypted = encrypt(key, "secret");
    const wrongKey = parseEncryptionKey(WRONG_KEY_HEX);
    expect(() => decrypt(wrongKey, encrypted)).toThrow();
  });

  it("rejects invalid key length", () => {
    expect(() => parseEncryptionKey("abcd")).toThrow(
      "Encryption key must be 64 hex characters",
    );
  });
});

describe("SecretsStore", () => {
  const key = parseEncryptionKey(TEST_KEY_HEX);

  it("set and get round-trip", async () => {
    const store = createSecretsStore(conn, "provider-1", key);
    await store.set("twitter", "api_key", "my-twitter-key");
    const value = await store.get("twitter", "api_key");
    expect(value).toBe("my-twitter-key");
  });

  it("set overwrites existing value", async () => {
    const store = createSecretsStore(conn, "provider-2", key);
    await store.set("openai", "api_key", "old-key");
    await store.set("openai", "api_key", "new-key");
    expect(await store.get("openai", "api_key")).toBe("new-key");
  });

  it("get returns null for missing key", async () => {
    const store = createSecretsStore(conn, "provider-3", key);
    expect(await store.get("github", "token")).toBeNull();
  });

  it("delete returns true when key exists", async () => {
    const store = createSecretsStore(conn, "provider-4", key);
    await store.set("slack", "webhook", "https://hooks.slack.com/xxx");
    expect(await store.delete("slack", "webhook")).toBe(true);
    expect(await store.get("slack", "webhook")).toBeNull();
  });

  it("delete returns false when key does not exist", async () => {
    const store = createSecretsStore(conn, "provider-5", key);
    expect(await store.delete("discord", "token")).toBe(false);
  });

  it("listKeys returns all keys for a platform", async () => {
    const store = createSecretsStore(conn, "provider-6", key);
    await store.set("stripe", "secret_key", "sk_xxx");
    await store.set("stripe", "webhook_secret", "whsec_xxx");
    await store.set("stripe", "publishable_key", "pk_xxx");
    const keys = await store.listKeys("stripe");
    expect(keys.sort()).toEqual([
      "publishable_key",
      "secret_key",
      "webhook_secret",
    ]);
  });

  it("provider isolation — different providers cannot see each other", async () => {
    const storeA = createSecretsStore(conn, "provider-7a", key);
    const storeB = createSecretsStore(conn, "provider-7b", key);
    await storeA.set("platform", "shared_name", "value-a");
    await storeB.set("platform", "shared_name", "value-b");
    expect(await storeA.get("platform", "shared_name")).toBe("value-a");
    expect(await storeB.get("platform", "shared_name")).toBe("value-b");
  });
});
