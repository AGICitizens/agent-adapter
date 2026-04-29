/**
 * Branded primitive types reused across plugin contracts.
 */

export type EvmAddress = `0x${string}`;

export type Hex = `0x${string}`;

/** Native asset placeholder (used when an asset reference is not an ERC-20). */
export const NATIVE_ASSET = "native" as const;

export type AssetRef = EvmAddress | typeof NATIVE_ASSET;
