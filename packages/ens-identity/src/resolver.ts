import {
  createPublicClient,
  defineChain,
  http,
  type Chain,
  type PublicClient,
} from "viem";
import { mainnet, sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import type {
  AdapterIdentity,
  AdapterPricing,
  AssetRef,
  ChainId,
  EvmAddress,
  IdentityResolver,
} from "@agent-adapter/contracts";

export interface EnsIdentityResolverConfig {
  /** Sepolia chain id (11155111) — the resolver only operates on this network. */
  chainId: ChainId;
  rpcUrl: string;
  /** Default payment chain to assign when the manifest omits it (e.g. `16602` for 0G Galileo). */
  defaultPaymentChainId: ChainId;
}

export const TEXT_KEYS = {
  manifest: "agent.adapter.manifest",
  wallet: "agent.adapter.wallet",
  endpoint: "agent.adapter.endpoint",
  capabilities: "agent.adapter.capabilities",
  pricing: "agent.adapter.pricing",
  paymentChainId: "agent.adapter.payment-chain-id",
  escrowAddress: "agent.adapter.escrow",
} as const;

export function createEnsIdentityResolver(
  config: EnsIdentityResolverConfig,
): EnsIdentityResolver {
  return new EnsIdentityResolver(config);
}

export class EnsIdentityResolver implements IdentityResolver {
  readonly name = "ens";

  private readonly client: PublicClient;
  private readonly defaultPaymentChainId: ChainId;

  constructor(config: EnsIdentityResolverConfig) {
    this.client = createPublicClient({
      chain: pickEnsChain(config.chainId, config.rpcUrl),
      transport: http(config.rpcUrl),
    });
    this.defaultPaymentChainId = config.defaultPaymentChainId;
  }

  async resolveAdapter(subname: string): Promise<AdapterIdentity | null> {
    const name = normalize(subname);

    const manifest = await this.readText(name, TEXT_KEYS.manifest);
    if (manifest) {
      const parsed = parseManifest(manifest);
      if (parsed) return { ...parsed, subname };
    }

    const [wallet, endpoint, caps, pricing, chainText, escrow] = await Promise.all([
      this.readText(name, TEXT_KEYS.wallet),
      this.readText(name, TEXT_KEYS.endpoint),
      this.readText(name, TEXT_KEYS.capabilities),
      this.readText(name, TEXT_KEYS.pricing),
      this.readText(name, TEXT_KEYS.paymentChainId),
      this.readText(name, TEXT_KEYS.escrowAddress),
    ]);

    if (!wallet || !endpoint) return null;

    return {
      subname,
      walletAddress: wallet as EvmAddress,
      endpoint,
      capabilities: parseJsonArray(caps),
      pricing: parsePricing(pricing),
      paymentChainId: parseChainId(chainText) ?? this.defaultPaymentChainId,
      escrowAddress: (escrow as EvmAddress | undefined) || undefined,
    };
  }

  private async readText(name: string, key: string): Promise<string | null> {
    try {
      return await this.client.getEnsText({ name, key });
    } catch {
      return null;
    }
  }
}

function parseManifest(raw: string): Omit<AdapterIdentity, "subname"> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const wallet = obj.wallet ?? obj.walletAddress;
  const endpoint = obj.endpoint;
  if (typeof wallet !== "string" || typeof endpoint !== "string") return null;

  return {
    walletAddress: wallet as EvmAddress,
    endpoint,
    capabilities: Array.isArray(obj.capabilities)
      ? obj.capabilities.filter((v): v is string => typeof v === "string")
      : [],
    pricing: parsePricing(typeof obj.pricing === "string" ? obj.pricing : JSON.stringify(obj.pricing ?? {})),
    paymentChainId: parseChainId(
      typeof obj.paymentChainId === "number"
        ? String(obj.paymentChainId)
        : typeof obj.paymentChainId === "string"
          ? obj.paymentChainId
          : null,
    ) ?? 1,
    escrowAddress:
      typeof obj.escrowAddress === "string" ? (obj.escrowAddress as EvmAddress) : undefined,
  };
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function parsePricing(raw: string | null): Record<string, AdapterPricing> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};
  const out: Record<string, AdapterPricing> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    if (typeof v.amount !== "string") continue;
    out[key] = {
      amount: v.amount,
      asset: parseAsset(v.asset),
    };
  }
  return out;
}

function parseAsset(raw: unknown): AssetRef {
  if (typeof raw !== "string") return "native";
  if (raw === "native") return "native";
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) return raw as EvmAddress;
  return "native";
}

function parseChainId(raw: string | null): ChainId | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * viem's built-in `sepolia` and `mainnet` chain configs include the ENS
 * Universal Resolver address. `defineChain` does not — `getEnsText` against a
 * custom chain silently fails. Prefer the preset for known ENS chains.
 */
function pickEnsChain(chainId: ChainId, rpcUrl: string): Chain {
  if (chainId === sepolia.id) return sepolia;
  if (chainId === mainnet.id) return mainnet;
  return defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}
