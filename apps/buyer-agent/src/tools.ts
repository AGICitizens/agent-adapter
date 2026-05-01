import type OpenAI from "openai";
import type { AdapterIdentity } from "@agent-adapter/contracts";
import type { EnsIdentityResolver } from "@agent-adapter/ens-identity";
import type { BuyerEventEmitter } from "./events.js";
import type { X402Client } from "./x402-client.js";

export type ToolName = "resolve_provider" | "request_capability" | "report_result";

export interface ToolEnv {
  resolver: EnsIdentityResolver;
  x402: X402Client;
  identityCache: Map<string, AdapterIdentity>;
  emitEvent: BuyerEventEmitter;
}

export const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "resolve_provider",
      description:
        "Resolve an ENS subname to discover the provider's reverse-proxy endpoint, capability list, and per-capability pricing. Always call this before request_capability.",
      parameters: {
        type: "object",
        properties: {
          subname: {
            type: "string",
            description: "Fully-qualified ENS name, e.g. weather.agentadapter.eth",
          },
        },
        required: ["subname"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_capability",
      description:
        "Call a capability on a previously-resolved provider. The client handles 402 payments automatically: it parses the challenge, signs and broadcasts an escrow tx on the payment chain, and retries with the payment proof. Returns the upstream API's response body and the payment transaction hash if a payment was made.",
      parameters: {
        type: "object",
        properties: {
          subname: {
            type: "string",
            description: "ENS name of a provider previously returned by resolve_provider.",
          },
          capability: {
            type: "string",
            description: "Capability id from the provider's manifest (e.g. forecast).",
          },
          query: {
            type: "object",
            description: "Query string parameters forwarded to the upstream API.",
            additionalProperties: { type: ["string", "number", "boolean"] },
          },
        },
        required: ["subname", "capability"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "report_result",
      description:
        "Report the final answer to the user's goal. Call this exactly once when the goal is achieved or when no further progress is possible.",
      parameters: {
        type: "object",
        properties: {
          answer: { type: "string", description: "The final answer to deliver to the user." },
          payload: {
            type: ["object", "null"],
            description: "Structured data backing the answer (raw API response, etc.).",
          },
        },
        required: ["answer"],
      },
    },
  },
];

export interface ResolveProviderArgs {
  subname: string;
}

export interface RequestCapabilityArgs {
  subname: string;
  capability: string;
  query?: Record<string, string | number | boolean>;
}

export interface ReportResultArgs {
  answer: string;
  payload?: unknown;
}

export interface ResolveProviderResult {
  subname: string;
  walletAddress: string;
  endpoint: string;
  capabilities: string[];
  pricing: Record<string, { amount: string; asset: string }>;
  paymentChainId: number;
  escrowAddress?: string;
}

export async function handleResolveProvider(
  args: ResolveProviderArgs,
  env: ToolEnv,
  round: number,
): Promise<ResolveProviderResult> {
  const identity = await env.resolver.resolveAdapter(args.subname);
  if (!identity) {
    throw new Error(`Provider not found at ENS subname '${args.subname}'`);
  }
  env.identityCache.set(args.subname, identity);
  env.emitEvent({ kind: "ens-resolved", round, subname: args.subname, identity });
  return {
    subname: identity.subname,
    walletAddress: identity.walletAddress,
    endpoint: identity.endpoint,
    capabilities: identity.capabilities,
    pricing: identity.pricing,
    paymentChainId: identity.paymentChainId,
    escrowAddress: identity.escrowAddress,
  };
}

export async function handleRequestCapability(
  args: RequestCapabilityArgs,
  env: ToolEnv,
  round: number,
): Promise<unknown> {
  const identity = env.identityCache.get(args.subname);
  if (!identity) {
    throw new Error(
      `request_capability: subname '${args.subname}' has not been resolved. Call resolve_provider first.`,
    );
  }
  if (!identity.capabilities.includes(args.capability)) {
    throw new Error(
      `request_capability: '${args.capability}' is not in provider's capability list (${identity.capabilities.join(", ")})`,
    );
  }
  const result = await env.x402.callCapability({
    endpoint: identity.endpoint,
    capabilityId: args.capability,
    query: args.query ?? {},
    method: "GET",
    round,
  });
  return result;
}
