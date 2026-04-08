/**
 * Free payment adapter — no-op, always succeeds.
 * Used for testing and capabilities that don't require payment.
 */

import type {
  PaymentAdapter,
  PaymentChallenge,
  PaymentReceipt,
} from "@agent-adapter/contracts";

export const createFreeAdapter = (): PaymentAdapter => ({
  id: "free",

  canHandle(challenge: PaymentChallenge): boolean {
    return challenge.type === "free" || challenge.scheme === "free";
  },

  async pay(challenge: PaymentChallenge): Promise<PaymentReceipt> {
    return {
      protocol: "free",
      network: challenge.network,
      amount: "0",
      currency: challenge.currency,
      txHash: null,
      proof: null,
      timestamp: new Date().toISOString(),
    };
  },

  async verify(): Promise<boolean> {
    // Free adapter always considers payment valid
    return true;
  },
});
