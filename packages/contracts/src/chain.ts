export type ChainId = number;

export interface ChainConfig {
  id: ChainId;
  name: string;
  rpcUrl: string;
  explorerUrl?: string;
  nativeSymbol?: string;
}
