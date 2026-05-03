import type { ChainId } from "./chain.js";
import type { AssetRef, EvmAddress } from "./common.js";

export interface AdapterPricing {
  amount: string;
  asset: AssetRef;
}

export interface AdapterIdentity {
  
  subname: string;
  walletAddress: EvmAddress;
  
  endpoint: string;
  capabilities: string[];
  pricing: Record<string, AdapterPricing>;
  paymentChainId: ChainId;
  escrowAddress?: EvmAddress;
}

export interface IdentityResolver {
  readonly name: string;
  
  resolveAdapter(subname: string): Promise<AdapterIdentity | null>;
}
