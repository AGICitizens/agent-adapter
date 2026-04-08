import { describe, it, expect } from "vitest";
import { createPaymentRegistry } from "./index.js";
import type {
  PaymentAdapter,
  PaymentChallenge,
} from "@agent-adapter/contracts";

const freeChallenge: PaymentChallenge = {
  type: "free",
  network: "local",
  payTo: "none",
  amount: "0",
  currency: "USD",
  resource: "/api/test",
  scheme: "free",
};

const x402Challenge: PaymentChallenge = {
  type: "x402",
  network: "eip155:8453",
  payTo: "0xabc",
  amount: "0.01",
  currency: "USDC",
  resource: "/api/paid",
  scheme: "exact",
};

const freeAdapter: PaymentAdapter = {
  id: "free",
  canHandle: (c) => c.type === "free",
  pay: async (c) => ({
    protocol: "free",
    network: c.network,
    amount: "0",
    currency: c.currency,
    txHash: null,
    proof: null,
    timestamp: new Date().toISOString(),
  }),
  verify: async () => true,
};

const x402Adapter: PaymentAdapter = {
  id: "x402",
  canHandle: (c) => c.type === "x402",
  pay: async (c) => ({
    protocol: "x402",
    network: c.network,
    amount: c.amount,
    currency: c.currency,
    txHash: "0xdef",
    proof: "proof-data",
    timestamp: new Date().toISOString(),
  }),
  verify: async () => true,
};

describe("PaymentRegistry", () => {
  it("resolve returns undefined when no adapters registered", () => {
    const registry = createPaymentRegistry();
    expect(registry.resolve(freeChallenge)).toBeUndefined();
  });

  it("resolve finds the matching adapter", () => {
    const registry = createPaymentRegistry();
    registry.register(freeAdapter);
    registry.register(x402Adapter);

    expect(registry.resolve(freeChallenge)?.id).toBe("free");
    expect(registry.resolve(x402Challenge)?.id).toBe("x402");
  });

  it("resolve returns undefined for unhandled challenge type", () => {
    const registry = createPaymentRegistry();
    registry.register(freeAdapter);

    expect(registry.resolve(x402Challenge)).toBeUndefined();
  });

  it("last-registered adapter wins on overlap", () => {
    const registry = createPaymentRegistry();
    const freeV1: PaymentAdapter = { ...freeAdapter, id: "free-v1" };
    const freeV2: PaymentAdapter = { ...freeAdapter, id: "free-v2" };
    registry.register(freeV1);
    registry.register(freeV2);

    expect(registry.resolve(freeChallenge)?.id).toBe("free-v2");
  });

  it("list returns all registered adapter IDs", () => {
    const registry = createPaymentRegistry();
    registry.register(freeAdapter);
    registry.register(x402Adapter);

    expect(registry.list()).toEqual(["free", "x402"]);
  });

  it("list returns empty array when no adapters registered", () => {
    const registry = createPaymentRegistry();
    expect(registry.list()).toEqual([]);
  });
});
