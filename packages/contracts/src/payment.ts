import type { ChainId } from "./chain.js";
import type { AssetRef, EvmAddress, Hex } from "./common.js";

export type PaymentRail = "x402" | "free" | "escrow" | (string & {});

export interface PaymentQuote {
  rail: PaymentRail;
  amount: bigint;
  asset: AssetRef;
  chainId: ChainId;
}

export interface PaymentChallenge {
  rail: PaymentRail;
  capabilityId: string;
  amount: bigint;
  asset: AssetRef;
  chainId: ChainId;
  payTo: EvmAddress;
  expiresAt: number;
  nonce: Hex;
  
  escrowAddress?: EvmAddress;
  metadata?: Record<string, unknown>;
}

export interface PaymentReceipt {
  rail: PaymentRail;
  txHash?: Hex;
  payer?: EvmAddress;
  amount?: bigint;
  asset?: AssetRef;
  chainId?: ChainId;
  
  rawReceipt?: unknown;
}

export interface PaymentAdapter {
  readonly rail: PaymentRail;

  quote(args: { capabilityId: string; params: unknown }): Promise<PaymentQuote>;

  challenge(args: { quote: PaymentQuote; capabilityId: string }): Promise<PaymentChallenge>;

  
  verify(args: { challenge: PaymentChallenge; claim: unknown }): Promise<PaymentReceipt | null>;
}
