import type { ChainId } from "./chain.js";
import type { AssetRef, EvmAddress } from "./common.js";

export interface AdapterPricing {
  amount: string;
  asset: AssetRef;
}

export interface AdapterIdentity {
  /** Fully-qualified ENS name, e.g. `weather.agentadapter.eth`. */
  subname: string;
  walletAddress: EvmAddress;
  /** Reverse-proxy endpoint the buyer agent should call. */
  endpoint: string;
  capabilities: string[];
  pricing: Record<string, AdapterPricing>;
  paymentChainId: ChainId;
  escrowAddress?: EvmAddress;
}

export interface IdentityResolver {
  readonly name: string;
  /** Resolve an adapter's identity by its on-chain name. Returns null if not registered. */
  resolveAdapter(subname: string): Promise<AdapterIdentity | null>;
}
