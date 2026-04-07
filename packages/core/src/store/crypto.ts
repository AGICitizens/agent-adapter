/**
 * AES-256-GCM encrypt/decrypt helpers.
 * Storage format: base64(nonce_12 || ciphertext || tag_16)
 */

import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "@noble/ciphers/utils.js";

const NONCE_LENGTH = 12;

export const encrypt = (key: Uint8Array, plaintext: string) => {
  const nonce = randomBytes(NONCE_LENGTH);
  const aes = gcm(key, nonce);
  const cipgertext = aes.encrypt(new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(NONCE_LENGTH + cipgertext.length);
  combined.set(nonce, 0);
  combined.set(cipgertext, NONCE_LENGTH);
  return Buffer.from(combined).toString("base64");
};

export const decrypt = (key: Uint8Array, encoded: string) => {
  const combined = Buffer.from(encoded, "base64");
  const nonce = combined.subarray(0, NONCE_LENGTH);
  const ciphertext = combined.subarray(NONCE_LENGTH);
  const aes = gcm(key, nonce);
  const plaintext = aes.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
};

export const parseEncryptionKey = (hex: string) => {
  if (hex.length !== 64) {
    throw new Error("Encryption key must be 64 hex characters (32 bytes)");
  }

  return Uint8Array.from(Buffer.from(hex, "hex"));
};
