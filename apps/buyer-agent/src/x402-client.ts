import { encodeFunctionData, type Hex } from "viem";
import { z } from "zod";
import type { EvmAddress } from "@agent-adapter/contracts";
import type { EvmWallet } from "@agent-adapter/wallet-evm";
import type { BuyerEventEmitter } from "./events.js";

const ESCROW_PAY_ABI = [
  {
    type: "function",
    name: "pay",
    stateMutability: "payable",
    inputs: [
      { name: "nonce", type: "bytes32" },
      { name: "payee", type: "address" },
    ],
    outputs: [],
  },
] as const;

const ChallengeSchema = z.object({
  rail: z.literal("x402"),
  capabilityId: z.string(),
  amount: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
  asset: z.union([z.literal("native"), z.string().regex(/^0x[a-fA-F0-9]{40}$/)]),
  chainId: z.number().int().positive(),
  payTo: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  expiresAt: z.number().int().positive(),
  nonce: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  escrowAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

export type ParsedChallenge = z.infer<typeof ChallengeSchema>;

export interface CallCapabilityInput {
  endpoint: string;
  capabilityId: string;
  query: Record<string, string | number | boolean>;
  body?: unknown;
  method?: "GET" | "POST";
  /** Round number — used purely for event correlation. */
  round: number;
}

export interface CallCapabilityResult {
  status: number;
  body: unknown;
  payment?: { txHash: Hex; nonce: Hex };
}

export interface X402ClientConfig {
  buyerWallet: EvmWallet;
  paymentChainId: number;
  emitEvent: BuyerEventEmitter;
  /** Per-fetch timeout in ms; defaults to 30000. */
  timeoutMs?: number;
}

/**
 * HTTP client that auto-handles 402 Payment Required by signing and broadcasting
 * an `escrow.pay(nonce, payee)` transaction on the payment chain, then retrying
 * the original request with the `X-PAYMENT` header. Plain 200 responses pass
 * through unchanged.
 */
export class X402Client {
  private readonly timeoutMs: number;

  constructor(private readonly config: X402ClientConfig) {
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async callCapability(input: CallCapabilityInput): Promise<CallCapabilityResult> {
    const url = buildCapabilityUrl(input.endpoint, input.capabilityId, input.query);
    const method = input.method ?? "GET";

    const initial = await this.request(url, method, input.body);
    if (initial.status !== 402) {
      return { status: initial.status, body: initial.body };
    }

    const challenge = ChallengeSchema.parse(initial.body);
    if (challenge.chainId !== this.config.paymentChainId) {
      throw new Error(
        `x402 challenge.chainId=${challenge.chainId} does not match buyer's paymentChainId=${this.config.paymentChainId}`,
      );
    }

    this.config.emitEvent({
      kind: "x402-challenge",
      round: input.round,
      capability: input.capabilityId,
      amount: challenge.amount.toString(),
      nonce: challenge.nonce as Hex,
    });

    const txHash = await this.payChallenge(challenge);
    this.config.emitEvent({
      kind: "x402-paid",
      round: input.round,
      capability: input.capabilityId,
      txHash,
      nonce: challenge.nonce as Hex,
      escrowAddress: challenge.escrowAddress as EvmAddress | undefined,
    });

    await this.config.buyerWallet.reader().waitForTransactionReceipt({ hash: txHash });

    const settled = await this.request(url, method, input.body, {
      txHash,
      chainId: challenge.chainId,
      nonce: challenge.nonce,
    });

    if (settled.status >= 200 && settled.status < 300) {
      this.config.emitEvent({
        kind: "x402-verified",
        round: input.round,
        capability: input.capabilityId,
      });
    }

    return {
      status: settled.status,
      body: settled.body,
      payment: { txHash, nonce: challenge.nonce as Hex },
    };
  }

  private async payChallenge(challenge: ParsedChallenge): Promise<Hex> {
    if (challenge.asset !== "native") {
      throw new Error(
        `buyer-agent currently supports native-asset escrow payments only; got asset=${challenge.asset}`,
      );
    }

    if (!challenge.escrowAddress) {
      // No escrow contract — direct transfer to payTo.
      return this.config.buyerWallet.sendTransaction({
        to: challenge.payTo as EvmAddress,
        value: challenge.amount,
      });
    }

    const data = encodeFunctionData({
      abi: ESCROW_PAY_ABI,
      functionName: "pay",
      args: [challenge.nonce as Hex, challenge.payTo as EvmAddress],
    });

    return this.config.buyerWallet.sendTransaction({
      to: challenge.escrowAddress as EvmAddress,
      data,
      value: challenge.amount,
    });
  }

  private async request(
    url: string,
    method: "GET" | "POST",
    body: unknown,
    payment?: { txHash: Hex; chainId: number; nonce: string },
  ): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (method === "POST") headers["Content-Type"] = "application/json";
      if (payment) headers["X-PAYMENT"] = JSON.stringify(payment);

      const response = await fetch(url, {
        method,
        headers,
        body: method === "POST" && body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Non-JSON body — return as text. Upstream APIs may legitimately return raw text.
      }
      return { status: response.status, body: parsed };
    } finally {
      clearTimeout(timer);
    }
  }
}

function buildCapabilityUrl(
  endpoint: string,
  capabilityId: string,
  query: Record<string, string | number | boolean>,
): string {
  const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const path = `${base}/cap/${encodeURIComponent(capabilityId)}`;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) qs.set(k, String(v));
  const queryString = qs.toString();
  return queryString.length > 0 ? `${path}?${queryString}` : path;
}
