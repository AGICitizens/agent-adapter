/**
 * Wallet plugin and registry interfaces.
 *
 * WalletPlugin represents a single wallet backend (OWS, raw Solana keypair,
 * raw EVM keypair, hosted server-managed keys, etc.).
 *
 * WalletRegistry holds multiple WalletPlugins keyed by chain family and
 * provides chain-based resolution for payment adapters.
 */

export interface WalletPlugin {
  /** Unique identifier for this wallet plugin instance. */
  readonly id: string;

  /** Chain family this plugin handles (e.g. "solana", "evm", "ows"). */
  readonly chain: string;

  /** Get the public address for this wallet on the given chain. */
  getAddress(chain?: string): Promise<string>;

  /** Get balances keyed by token/currency. */
  getBalance(chain?: string): Promise<Record<string, number>>;

  /** Sign an arbitrary message. */
  signMessage(message: Uint8Array, chain?: string): Promise<Uint8Array>;

  /** Sign a transaction. */
  signTransaction(transaction: Uint8Array, chain?: string): Promise<Uint8Array>;
}

export interface WalletRegistry {
  /** Get the wallet plugin for a specific chain. Throws if not configured. */
  get(chain: string): WalletPlugin;

  /** List all configured wallet plugins. */
  list(): WalletPlugin[];

  /** Get the primary (default / first configured) wallet plugin. */
  primary(): WalletPlugin;

  /** Check if a wallet plugin is configured for the given chain. */
  has(chain: string): boolean;
}

/** Returned by a plugin factory after initialisation. */
export interface WalletPluginInit {
  plugin: WalletPlugin;
  publicKey: string;
  /** Raw secret key bytes for registry-managed persistence. Absent for vault-managed plugins (e.g. OWS). */
  secretKey?: Uint8Array;
  /** Chain families this plugin handles (for multi-chain plugins like OWS). */
  supportedChains?: string[];
}

/** Factory function that wallet plugins export. */
export type WalletPluginFactory = (opts: {
  secretKeyBytes?: Uint8Array;
  importKeyString?: string;
}) => Promise<WalletPluginInit>;
