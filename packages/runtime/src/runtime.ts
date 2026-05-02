import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import { pino, type Logger } from "pino";
import type {
  AssetRef,
  Capability,
  EvmAddress,
  Store,
} from "@agent-adapter/contracts";
import { X402Adapter } from "@agent-adapter/payment-x402";
import { createEvmWallet, type EvmWallet } from "@agent-adapter/wallet-evm";
import type { RuntimeConfig } from "./config.js";
import { createPluginRegistry, registerPayment, registerWallet } from "./plugins/registry.js";
import { mountReverseProxy, type UpstreamMapping } from "./reverseProxy.js";
import { createServer } from "./server.js";
import { openDatabase, type DatabaseHandle } from "./store/db.js";

export interface Runtime {
  shutdown: () => Promise<void>;
}

export async function startRuntime(config: RuntimeConfig): Promise<Runtime> {
  const log = pino({
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "*.privateKey",
        "*.apiKey",
        "wallet.privateKey",
        "keeperhub.apiKey",
        "PRIVATE_KEY",
        "KEEPERHUB_API_KEY",
        "OPENROUTER_API_KEY",
      ],
      censor: "[Redacted]",
    },
  });
  log.info({ name: config.adapter.name, mode: config.adapter.mode }, "agent-adapter booting");

  const dataDir = resolve(config.adapter.dataDir);
  mkdirSync(dataDir, { recursive: true });
  const handle = openDatabase(resolve(dataDir, "agent-adapter.db"));

  const registry = createPluginRegistry(createPlaceholderStore());

  const wallet = buildWallet(config);
  if (wallet) {
    registerWallet(registry, wallet);
    log.info(
      { chainId: wallet.chainId, address: wallet.address },
      "viem wallet registered",
    );
  }

  const { capabilities, upstreamMap, priceLookup } = buildCapabilities(config);
  log.info({ count: capabilities.length }, "capabilities loaded");

  const x402Adapter = buildX402Adapter(config, wallet, priceLookup);
  if (x402Adapter) {
    registerPayment(registry, x402Adapter);
    log.info("x402 payment adapter registered");
  }

  const app = createServer({ config, registry });
  mountReverseProxy(app, { config, registry }, capabilities, {
    upstreamFor: (cap) => upstreamMap.get(cap.id) ?? null,
    challengeStore: new Map(),
  });

  const httpServer = serve({
    fetch: app.fetch,
    hostname: config.http.host,
    port: config.http.port,
  });
  log.info(
    { url: `http://${config.http.host}:${config.http.port}` },
    "http server listening",
  );

  return {
    shutdown: () => shutdown(httpServer, handle, log),
  };
}

function buildWallet(config: RuntimeConfig): EvmWallet | null {
  const key = config.wallet.privateKey;
  if (!key) return null;
  return createEvmWallet({
    chainId: config.chains.payment.id,
    rpcUrl: config.chains.payment.rpcUrl,
    privateKey: key as `0x${string}`,
    name: `chain-${config.chains.payment.id}`,
  });
}

function buildX402Adapter(
  config: RuntimeConfig,
  wallet: EvmWallet | null,
  priceLookup: (id: string) => { amount: bigint; asset: AssetRef },
): X402Adapter | null {
  const x402Config = config.payments.find((p) => p.type === "x402");
  if (!x402Config || !wallet) return null;
  return new X402Adapter({
    wallet,
    payTo: wallet.address,
    priceLookup,
    escrowAddress: x402Config.escrowAddress as EvmAddress | undefined,
  });
}

interface CapabilityBuildResult {
  capabilities: Capability[];
  upstreamMap: Map<string, UpstreamMapping>;
  priceLookup: (id: string) => { amount: bigint; asset: AssetRef };
}

function buildCapabilities(config: RuntimeConfig): CapabilityBuildResult {
  const capabilities: Capability[] = [];
  const upstreamMap = new Map<string, UpstreamMapping>();
  const source = config.capabilities.source;

  if (source.type === "manual") {
    for (const def of source.definitions) {
      const baseUrl = def.upstream.baseUrl ?? source.baseUrl;
      if (!baseUrl) {
        throw new Error(
          `capability '${def.id}' has no upstream baseUrl — set capabilities.source.baseUrl or capabilities.source.definitions[].upstream.baseUrl`,
        );
      }
      upstreamMap.set(def.id, {
        baseUrl,
        path: def.upstream.path,
        method: def.upstream.method,
      });
      const pricing = config.capabilities.pricing[def.id];
      capabilities.push({
        id: def.id,
        name: def.name,
        description: def.description,
        source: "manual",
        pricing: pricing
          ? {
              rail: pricing.rail,
              amount: BigInt(Math.floor(pricing.amount)),
              asset: pricing.asset as AssetRef,
            }
          : undefined,
        enabled: pricing?.enabled !== false,
      });
    }
  }

  const priceLookup = (id: string): { amount: bigint; asset: AssetRef } => {
    const pricing = config.capabilities.pricing[id];
    if (!pricing) {
      throw new Error(`no pricing configured for capability '${id}'`);
    }
    return { amount: BigInt(Math.floor(pricing.amount)), asset: pricing.asset as AssetRef };
  };

  return { capabilities, upstreamMap, priceLookup };
}

async function shutdown(server: ServerType, handle: DatabaseHandle, log: Logger): Promise<void> {
  await new Promise<void>((res) => server.close(() => res()));
  handle.close();
  log.info("shutdown complete");
}

function createPlaceholderStore(): Store {
  return {
    capabilities: {
      list: async () => [],
      get: async () => null,
      upsert: async () => {},
      remove: async () => {},
    },
    jobs: {
      create: async () => {},
      update: async () => {},
      get: async () => null,
      list: async () => [],
    },
    decisions: {
      log: async () => {},
      list: async () => [],
    },
  };
}
