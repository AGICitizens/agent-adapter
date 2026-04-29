import { randomBytes } from "node:crypto";
import type { AssetRef, EvmAddress, Hex } from "@agent-adapter/contracts";

export interface ChallengeInput {
  capabilityId: string;
  amount: bigint;
  asset: AssetRef;
  chainId: number;
  payTo: EvmAddress;
  /** Time-to-live in seconds; defaults to 300 (5 min). */
  ttlSeconds?: number;
}

export interface IssuedChallenge {
  rail: "x402";
  capabilityId: string;
  amount: bigint;
  asset: AssetRef;
  chainId: number;
  payTo: EvmAddress;
  expiresAt: number;
  nonce: Hex;
}

/** Generate a fresh challenge with a cryptographic nonce + expiration. */
export function issueChallenge(input: ChallengeInput): IssuedChallenge {
  const ttl = (input.ttlSeconds ?? 300) * 1000;
  const nonce = `0x${randomBytes(16).toString("hex")}` as Hex;
  return {
    rail: "x402",
    capabilityId: input.capabilityId,
    amount: input.amount,
    asset: input.asset,
    chainId: input.chainId,
    payTo: input.payTo,
    expiresAt: Date.now() + ttl,
    nonce,
  };
}

export interface PaymentClaim {
  txHash: Hex;
  chainId: number;
  nonce: Hex;
}

/** Parse the X-PAYMENT header value into a typed claim, or throw. */
export function parsePaymentHeader(value: string): PaymentClaim {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("X-PAYMENT header is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("X-PAYMENT must decode to an object");
  }
  const obj = parsed as Record<string, unknown>;
  const txHash = obj.txHash;
  const chainId = obj.chainId;
  const nonce = obj.nonce;
  if (typeof txHash !== "string" || !txHash.startsWith("0x")) {
    throw new Error("X-PAYMENT.txHash must be a 0x-prefixed string");
  }
  if (typeof chainId !== "number") {
    throw new Error("X-PAYMENT.chainId must be a number");
  }
  if (typeof nonce !== "string" || !nonce.startsWith("0x")) {
    throw new Error("X-PAYMENT.nonce must be a 0x-prefixed string");
  }
  return { txHash: txHash as Hex, chainId, nonce: nonce as Hex };
}
