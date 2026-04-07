/**
 * RuntimeAPI — the stable surface plugins interact with.
 * Plugins receive this during initialization. Never exposes core internals.
 */

import type { Capability, Job, ProviderContext, ToolDefinition } from "./types.js";
import type { WalletRegistry } from "./wallet.js";
import type { SecretsBackend } from "./secrets.js";

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

  /** Get/set arbitrary state (JSON key-value). */
  getState(namespace: string, key: string): Promise<unknown>;
  setState(namespace: string, key: string, value: unknown): Promise<void>;

  /** Register additional tools at runtime (from plugins/drivers). */
  registerTools(tools: ToolDefinition[]): void;
}
