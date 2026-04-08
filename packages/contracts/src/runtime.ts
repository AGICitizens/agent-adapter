/**
 * RuntimeAPI — the stable surface plugins interact with.
 * Plugins receive this during initialization. Never exposes core internals.
 */

import type { Capability, Job, ProviderContext } from "./types.js";
import type { WalletRegistry } from "./wallet.js";
import type { SecretsBackend } from "./secrets.js";
import type { ToolPlugin } from "./tool-plugins.js";

export interface RuntimeAPI {
  /** Current provider context. */
  readonly provider: ProviderContext;

  /** Wallet registry for chain-aware signing. */
  readonly wallets: WalletRegistry;

  /** Secrets store for encrypted credentials. */
  readonly secrets: SecretsBackend;

  /** Look up a capability by name. */
  getCapability(name: string): Capability | undefined;

  /** List all registered capabilities. */
  listCapabilities(): Capability[];

  /** Get a job by ID. */
  getJob(id: string): Promise<Job | undefined>;

  /** Get/set arbitrary state (JSON key-value, scoped by providerId). */
  getState(namespace: string, key: string): Promise<unknown>;
  setState(namespace: string, key: string, value: unknown): Promise<void>;

  /** Query state entries with pagination and ordering. */
  stateQuery(
    namespace: string,
    opts?: {
      prefix?: string;
      limit?: number;
      offset?: number;
      orderBy?: "key" | "updatedAt";
      order?: "asc" | "desc";
    },
  ): Promise<Array<{ key: string; data: unknown; updatedAt: string }>>;

  /** Delete a state entry. Returns true if the key existed. */
  stateDelete(namespace: string, key: string): Promise<boolean>;

  /** Set multiple state entries atomically. */
  stateBatchSet(
    namespace: string,
    entries: Array<{ key: string; data: unknown }>,
  ): Promise<void>;

  /** Register a plugin's tools and executor into the runtime dispatch. */
  registerTools(plugin: ToolPlugin): void;
}
