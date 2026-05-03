

export type EvmAddress = `0x${string}`;

export type Hex = `0x${string}`;

export const NATIVE_ASSET = "native" as const;

export type AssetRef = EvmAddress | typeof NATIVE_ASSET;
