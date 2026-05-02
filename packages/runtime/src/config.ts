import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const EvmAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "expected 0x-prefixed 20-byte hex");

const ChainConfigSchema = z.object({
  id: z.number().int().positive(),
  rpcUrl: z.string().url(),
});

const PricingSchema = z.object({
  rail: z.union([z.literal("x402"), z.literal("free")]).default("x402"),
  amount: z.number().nonnegative(),
  asset: z.union([z.literal("native"), EvmAddress]).default("native"),
  enabled: z.boolean().default(true),
});

const PaymentAdapterConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("free") }),
  z.object({
    type: z.literal("x402"),
    chainId: z.number().int().positive(),
    escrowAddress: EvmAddress.optional(),
  }),
]);

const ManualCapabilityDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  upstream: z.object({
    path: z.string().min(1),
    method: z.enum(["GET", "POST"]).default("GET"),
    baseUrl: z.string().url().optional(),
  }),
});

const CapabilitySourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("openapi"),
    url: z.string(),
    baseUrl: z.string().url().optional(),
  }),
  z.object({
    type: z.literal("manual"),
    baseUrl: z.string().url().optional(),
    definitions: z.array(ManualCapabilityDefSchema),
  }),
]);

const RuntimeConfigSchema = z.object({
  adapter: z.object({
    name: z.string().min(1),
    dataDir: z.string().default("./data"),
    mode: z.enum(["reverse-proxy", "agent-led"]).default("reverse-proxy"),
  }),
  capabilities: z.object({
    source: CapabilitySourceSchema,
    pricing: z.record(z.string(), PricingSchema).default({}),
  }),
  wallet: z.object({
    type: z.literal("viem"),
    privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  }),
  chains: z.object({
    payment: ChainConfigSchema,
    identity: ChainConfigSchema,
  }),
  payments: z.array(PaymentAdapterConfigSchema).default([{ type: "free" }]),
  ens: z
    .object({
      parent: z.string().min(1),
      subname: z.string().min(1),
    })
    .optional(),
  keeperhub: z
    .object({
      apiKey: z.string().optional(),
      baseUrl: z.string().url().default("https://app.keeperhub.com/api"),
      identityWorkflowSlug: z.string().optional(),
    })
    .optional(),
  http: z
    .object({
      host: z.string().default("127.0.0.1"),
      port: z.number().int().min(0).max(65535).default(8080),
    })
    .default({ host: "127.0.0.1", port: 8080 }),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type ManualCapabilityDef = z.infer<typeof ManualCapabilityDefSchema>;
export type CapabilityPricingConfig = z.infer<typeof PricingSchema>;

function resolveEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([^}]+)\}/g, (_, name: string) => process.env[name] ?? "");
  }
  if (Array.isArray(value)) return value.map(resolveEnvVars);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, resolveEnvVars(v)]),
    );
  }
  return value;
}

export function loadConfig(path: string): RuntimeConfig {
  const absolute = resolve(path);
  const raw = readFileSync(absolute, "utf8");
  const parsed = parseYaml(raw);
  const resolved = resolveEnvVars(parsed);
  return RuntimeConfigSchema.parse(resolved);
}
