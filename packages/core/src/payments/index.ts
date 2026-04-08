/**
 * Payment registry — resolves the correct PaymentAdapter for a given challenge.
 * Does not implement payment protocols — plugins do.
 */

import type { PaymentAdapter, PaymentChallenge } from "@agent-adapter/contracts";

export interface PaymentRegistry {
  /** Register an adapter. Later registrations take priority (last-wins on overlap). */
  register(adapter: PaymentAdapter): void;

  /** Find the first adapter that can handle this challenge (checked in reverse-registration order). */
  resolve(challenge: PaymentChallenge): PaymentAdapter | undefined;

  /** List all registered adapter IDs. */
  list(): string[];
}

export const createPaymentRegistry = (): PaymentRegistry => {
  const adapters: PaymentAdapter[] = [];

  return {
    register(adapter) {
      adapters.push(adapter);
    },

    resolve(challenge) {
      // Walk backwards so the most recently registered adapter wins on overlap
      for (let i = adapters.length - 1; i >= 0; i--) {
        if (adapters[i]!.canHandle(challenge)) return adapters[i];
      }
      return undefined;
    },

    list() {
      return adapters.map((a) => a.id);
    },
  };
};
