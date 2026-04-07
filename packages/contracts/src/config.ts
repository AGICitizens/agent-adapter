/**
 * Configuration types for the adapter runtime.
 */

export interface AdapterConfig {
  readonly name: string;
  readonly mode: "self-hosted" | "hosted";

  readonly database: DatabaseConfig;
  readonly wallet: WalletConfig;
  readonly server: ServerConfig;
  readonly agent: AgentConfig;

  readonly capabilities: CapabilitySourceConfig[];
  readonly payments: PaymentAdapterConfig[];
  readonly plugins: PluginConfig[];
  readonly drivers: DriverConfig[];
}

export interface DatabaseConfig {
  readonly driver: "sqlite" | "postgres";
  readonly path?: string;
  readonly url?: string;
}

export interface WalletConfig {
  readonly plugin: string;
  readonly chains?: string[];
  readonly importKey?: string;
}

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly dashboard: boolean;
}

export interface AgentConfig {
  readonly enabled: boolean;
  readonly llmProvider: string;
  readonly llmModel: string;
  readonly llmApiKey: string;
  readonly maxToolRounds: number;
  readonly customPrompt?: string;
  readonly promptMode?: "append" | "replace";
}

export interface CapabilitySourceConfig {
  readonly type: "openapi" | "mcp" | "manual" | "inferred";
  readonly url?: string;
  readonly path?: string;
  readonly definitions?: Record<string, unknown>[];
}

export interface PaymentAdapterConfig {
  readonly type: string;
  readonly config?: Record<string, unknown>;
}

export interface PluginConfig {
  readonly package: string;
  readonly config?: Record<string, unknown>;
}

export interface DriverConfig {
  readonly package: string;
  readonly config?: Record<string, unknown>;
}
