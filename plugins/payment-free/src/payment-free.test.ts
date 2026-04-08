import { describe, it, expect } from "vitest";
import { createFreeAdapter } from "./index.js";
import type { PaymentChallenge } from "@agent-adapter/contracts";

const adapter = createFreeAdapter();

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

describe("payment-free adapter", () => {
  it("canHandle returns true for type=free", () => {
    expect(adapter.canHandle(freeChallenge)).toBe(true);
  });

  it("canHandle returns true for scheme=free", () => {
    const challenge: PaymentChallenge = { ...x402Challenge, scheme: "free" };
    expect(adapter.canHandle(challenge)).toBe(true);
  });

  it("canHandle returns false for non-free challenges", () => {
    expect(adapter.canHandle(x402Challenge)).toBe(false);
  });

  it("pay returns a receipt with zero amount", async () => {
    const receipt = await adapter.pay(freeChallenge);
    expect(receipt.protocol).toBe("free");
    expect(receipt.amount).toBe("0");
    expect(receipt.txHash).toBeNull();
    expect(receipt.proof).toBeNull();
    expect(receipt.timestamp).toBeTruthy();
  });

  it("verify always returns true", async () => {
    expect(await adapter.verify("any-proof", freeChallenge)).toBe(true);
  });
});
