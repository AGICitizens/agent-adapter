import { z } from "zod";
import { CAPABILITY_SOURCE_TYPES, DATABASE_DRIVERS } from "./constants.js";

export const databaseConfigSchema = z.object({
  driver: z.enum(DATABASE_DRIVERS).default("sqlite"),
  /** File path for SQLite. Ignored when driver is "postgres". */
  path: z.string().optional(),
  /** Connection string for Postgres. Ignored when driver is "sqlite". */
  url: z.string().optional(),
});

export const walletConfigSchema = z.object({
  /** Name of the wallet plugin package (e.g. "wallet-solana", "wallet-evm"). */
  plugin: z.string(),
  /** CAIP-2 chain identifiers this wallet should operate on. */
  chains: z.array(z.string()).optional(),
  /** Raw private key import — expected to come from env var (${SECRET}). */
  importKey: z.string().optional(),
});

export const serverConfigSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.number().int().default(3000),
  /** Serve the embedded dashboard SPA alongside the API */
  dashboard: z.boolean().default(false),
});

export const agentConfigSchema = z.object({
  enabled: z.boolean().default(false),
  llmProvider: z.string(),
  llmModel: z.string(),
  /** Resolved from env var, never stored in plain YAML */
  llmApiKey: z.string(),
  /** Hard ceiling on tool-call rounds to prevent runaway loops */
  maxToolRounds: z.number().int().default(10),
  customPrompt: z.string().optional(),
  /** "append" merges with the default system prompt; "replace" overrides it entirely. */
  promptMode: z.enum(["append", "replace"]).optional(),
});

export const capabilitySourceConfigSchema = z.object({
  /**
   * How capabilities are discovered:
   * - "openapi": parsed from an OpenAPI spec
   * - "mcp": fetched from an MCP server via tools/list
   * - "manual": hand-defined inline
   * - "inferred": LLM-generated from scraped docs (Phase 5)
   */
  type: z.enum(CAPABILITY_SOURCE_TYPES),
  /** Remote spec URL (openapi, mcp). */
  url: z.string().optional(),
  /** Local file path to a spec (openapi). */
  path: z.string().optional(),
  /** Inline capability definitions (manual). */
  definitions: z.array(z.record(z.unknown())).optional(),
});

export const paymentAdapterConfigSchema = z.object({
  /** Adapter type identifier — maps to a registered payment plugin (e.g. "free", "x402"). */
  type: z.string(),
  config: z.record(z.unknown()).optional(),
});

export const pluginConfigSchema = z.object({
  /** npm package name or local path to the plugin entry point. */
  package: z.string(),
  config: z.record(z.unknown()).optional(),
});

export const driverConfigSchema = z.object({
  /** npm package name or local path to the platform driver. */
  package: z.string(),
  config: z.record(z.unknown()).optional(),
});

export const adapterConfigSchema = z.object({
  name: z.string(),
  mode: z.enum(["hosted", "self-hosted"]).default("self-hosted"),

  database: databaseConfigSchema.default({}),
  wallet: walletConfigSchema,
  server: serverConfigSchema.default({}),
  agent: agentConfigSchema,

  capabilities: z.array(capabilitySourceConfigSchema).default([]),
  payments: z.array(paymentAdapterConfigSchema).default([]),
  plugins: z.array(pluginConfigSchema).default([]),
  /** Platform drivers (e.g. Telegram, Discord) that expose capabilities to end users. */
  drivers: z.array(driverConfigSchema).default([]),
});

export type AdapterConfig = z.infer<typeof adapterConfigSchema>;
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type WalletConfig = z.infer<typeof walletConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type CapabilitySourceConfig = z.infer<
  typeof capabilitySourceConfigSchema
>;
export type PaymentAdapterConfig = z.infer<typeof paymentAdapterConfigSchema>;
export type PluginConfig = z.infer<typeof pluginConfigSchema>;
export type DriverConfig = z.infer<typeof driverConfigSchema>;
