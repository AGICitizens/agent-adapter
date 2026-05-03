import type { Hono } from "hono";
import type {
  Capability,
  PaymentAdapter,
  PaymentChallenge,
  PaymentRail,
} from "@agent-adapter/contracts";
import type { ServerContext } from "./server.js";

export interface ReverseProxyDeps {
  
  upstreamFor: (capability: Capability) => UpstreamMapping | null;
  
  challengeStore: Map<string, PaymentChallenge>;
}

export interface UpstreamMapping {
  
  baseUrl: string;
  
  path: string;
  method: "GET" | "POST";
}

export function mountReverseProxy(
  app: Hono,
  ctx: ServerContext,
  capabilities: Capability[],
  deps: ReverseProxyDeps,
): void {
  for (const cap of capabilities) {
    if (!cap.enabled) continue;
    app.all(capabilityRoute(cap), async (c) => {
      const adapter = pickAdapter(ctx, cap);
      if (!adapter) return c.json({ error: "no_payment_adapter_for_rail" }, 500);

      const paymentHeader = c.req.header("X-PAYMENT");
      if (!paymentHeader) {
        const quote = await adapter.quote({ capabilityId: cap.id, params: c.req.query() });
        const challenge = await adapter.challenge({ quote, capabilityId: cap.id });
        deps.challengeStore.set(challenge.nonce, challenge);
        return c.json(serializeChallenge(challenge), 402);
      }

      let claim: { nonce?: unknown };
      try {
        claim = JSON.parse(paymentHeader) as { nonce?: unknown };
      } catch {
        return c.json({ error: "x_payment_invalid_json" }, 400);
      }

      if (typeof claim.nonce !== "string") {
        return c.json({ error: "x_payment_missing_nonce" }, 400);
      }

      const challenge = deps.challengeStore.get(claim.nonce);
      if (!challenge) {
        return c.json({ error: "x_payment_unknown_nonce" }, 400);
      }

      const receipt = await adapter.verify({ challenge, claim: paymentHeader });
      if (!receipt) {
        return c.json({ error: "x_payment_verification_failed" }, 402);
      }

      deps.challengeStore.delete(challenge.nonce);

      const mapping = deps.upstreamFor(cap);
      if (!mapping) {
        return c.json({ error: "no_upstream_for_capability" }, 500);
      }

      const upstreamResponse = await forwardUpstream(mapping, c.req.query(), c.req.header());
      const text = await upstreamResponse.text();
      const contentType = upstreamResponse.headers.get("content-type") ?? "application/json";
      return new Response(text, {
        status: upstreamResponse.status,
        headers: {
          "content-type": contentType,
          "x-payment-tx": receipt.txHash ?? "",
        },
      });
    });
  }
}

function serializeChallenge(challenge: PaymentChallenge): Record<string, unknown> {
  return {
    rail: challenge.rail,
    capabilityId: challenge.capabilityId,
    amount: challenge.amount.toString(),
    asset: challenge.asset,
    chainId: challenge.chainId,
    payTo: challenge.payTo,
    expiresAt: challenge.expiresAt,
    nonce: challenge.nonce,
    ...(challenge.escrowAddress ? { escrowAddress: challenge.escrowAddress } : {}),
    ...(challenge.metadata ? { metadata: challenge.metadata } : {}),
  };
}

async function forwardUpstream(
  mapping: UpstreamMapping,
  query: Record<string, string>,
  _headers: Record<string, string>,
): Promise<Response> {
  const base = mapping.baseUrl.endsWith("/") ? mapping.baseUrl.slice(0, -1) : mapping.baseUrl;
  const path = mapping.path.startsWith("/") ? mapping.path : `/${mapping.path}`;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) qs.set(k, v);
  const queryString = qs.toString();
  const url = queryString.length > 0 ? `${base}${path}?${queryString}` : `${base}${path}`;

  return fetch(url, {
    method: mapping.method,
    headers: { Accept: "application/json" },
  });
}

function capabilityRoute(cap: Capability): string {
  return `/cap/${cap.id}`;
}

function pickAdapter(ctx: ServerContext, cap: Capability): PaymentAdapter | undefined {
  const rail: PaymentRail = cap.pricing?.rail ?? "free";
  return ctx.registry.payments.get(rail);
}
