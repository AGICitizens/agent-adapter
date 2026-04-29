import type { ChainId } from "./chain.js";
import type { EvmAddress, Hex } from "./common.js";

export interface TxRequest {
  to?: EvmAddress;
  data?: Hex;
  value?: bigint;
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

export interface SignTypedDataArgs {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * A wallet plugin is the runtime's signing primitive on a specific chain.
 * One adapter instance can register multiple wallets — one per chain it
 * needs to sign on (e.g. one for 0G Galileo, one for Sepolia).
 */
export interface WalletPlugin {
  readonly chainId: ChainId;
  readonly address: EvmAddress;

  signMessage(message: string | Uint8Array): Promise<Hex>;
  signTypedData(args: SignTypedDataArgs): Promise<Hex>;
  sendTransaction(tx: TxRequest): Promise<Hex>;
}
