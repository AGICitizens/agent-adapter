import type {
  ProviderContext,
  ToolDefinition,
  WalletRegistry,
  SecretsBackend,
  StateBackend,
  JobEngine,
} from "@agent-adapter/contracts";
import type { CapabilityRegistry } from "../capabilities/registry.js";
import type { PaymentRegistry } from "../payments/index.js";

/** All dependencies the tool handler dispatch needs. */
export interface ToolHandlerDeps {
  readonly provider: ProviderContext;
  readonly capabilities: CapabilityRegistry;
  readonly wallets: WalletRegistry;
  readonly secrets: SecretsBackend;
  readonly state: StateBackend;
  readonly jobs: JobEngine;
  readonly payments: PaymentRegistry;
}

/** Internal pattern — each handler file exports a factory returning this shape. */
export interface HandlerGroup {
  readonly tools: ToolDefinition[];
  execute(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}
