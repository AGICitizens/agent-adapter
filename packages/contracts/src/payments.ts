/**
 * Payment adapter interfaces for x402, escrow, MPP, and free rails.
 */

export interface PaymentChallenge {
  readonly type: string;
  readonly network: string;
  readonly payTo: string;
  readonly amount: string;
  readonly currency: string;
  readonly resource: string;
  readonly scheme: string;
  readonly extra?: Record<string, unknown>;
}

export interface PaymentReceipt {
  readonly protocol: string;
  readonly network: string;
  readonly amount: string;
  readonly currency: string;
  readonly txHash: string | null;
  readonly proof: string | null;
  readonly timestamp: string;
}

export interface PaymentSession {
  readonly id: string;
  readonly protocol: string;
  readonly status: "pending" | "active" | "settled" | "failed";
  readonly totalPaid: string;
  readonly currency: string;
}

export interface PaymentAdapter {
  /** Unique identifier for this adapter (e.g. "x402", "escrow", "mpp", "free"). */
  readonly id: string;

  /** Whether this adapter can handle the given challenge type. */
  canHandle(challenge: PaymentChallenge): boolean;

  /** Resolve a payment challenge — sign and pay. */
  pay(challenge: PaymentChallenge): Promise<PaymentReceipt>;

  /** Verify an inbound payment proof (for reverse proxy mode). */
  verify(proof: string, challenge: PaymentChallenge): Promise<boolean>;

  /**
   * Optional protocol-specific 402 response builder.
   * Adapters like x402 can use this to return structured payment requirements
   * instead of the generic `{ error, pricing, accepts }` shape.
   */
  buildPaymentRequired?(
    challenge: PaymentChallenge,
  ): Promise<{
    headers?: Record<string, string>;
    body: unknown;
  }>;
}
