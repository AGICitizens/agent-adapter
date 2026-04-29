import type { Hono } from "hono";
import type { Capability, PaymentAdapter, PaymentRail } from "@agent-adapter/contracts";
import type { ServerContext } from "./server.js";

/**
 * Mount payment-gated routes for each enabled capability.
 *
 * On a request without `X-PAYMENT`, we return a 402 with a fresh challenge.
 * The challenge → verify → forward → respond loop is wired in commit 4 once
 * the wallet and x402 adapter plugins land.
 */
export function mountReverseProxy(
  app: Hono,
  ctx: ServerContext,
  capabilities: Capability[],
): void {
  for (const cap of capabilities) {
    if (!cap.enabled) continue;
    app.all(capabilityRoute(cap), async (c) => {
      const paymentHeader = c.req.header("X-PAYMENT");
      if (!paymentHeader) {
        const adapter = pickAdapter(ctx, cap);
        if (!adapter) return c.json({ error: "no_payment_adapter_for_rail" }, 500);
        const quote = await adapter.quote({ capabilityId: cap.id, params: c.req.query() });
        const challenge = await adapter.challenge({ quote, capabilityId: cap.id });
        return c.json(challenge, 402);
      }
      // TODO(commit 4): parse the X-PAYMENT header, verify with the adapter,
      // forward the request to the upstream API, return the response.
      return c.json({ error: "payment_verification_not_implemented" }, 501);
    });
  }
}

function capabilityRoute(cap: Capability): string {
  return `/cap/${cap.id}`;
}

function pickAdapter(ctx: ServerContext, cap: Capability): PaymentAdapter | undefined {
  const rail: PaymentRail = cap.pricing?.rail ?? "free";
  return ctx.registry.payments.get(rail);
}
