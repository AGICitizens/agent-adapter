/**
 * Reverse proxy / payment gateway engine for LLM-less mode.
 * Receives inbound HTTP, resolves capability, enforces pricing,
 * resolves payment, forwards to target service.
 */

import { randomUUID } from "node:crypto";
import type { ProviderContext, JobEngine, PaymentChallenge } from "@agent-adapter/contracts";
import type { CapabilityRegistry } from "../capabilities/registry.js";
import type { PaymentRegistry } from "../payments/index.js";
import { httpRequest } from "../tools/http-client.js";
import { buildCapabilityRequest } from "../tools/capability-request.js";

export interface ProxyRequest {
  capabilityName: string;
  method: string;
  headers: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface ProxyEngineDeps {
  readonly provider: ProviderContext;
  readonly capabilities: CapabilityRegistry;
  readonly payments: PaymentRegistry;
  readonly jobs: JobEngine;
}

export interface ProxyEngine {
  handleRequest(req: ProxyRequest): Promise<ProxyResponse>;
}

/** Extract payment proof from request headers (x-payment or x-payment-proof). */
const extractPaymentProof = (
  headers: Record<string, string>,
): string | undefined =>
  headers["x-payment"] ?? headers["x-payment-proof"] ?? undefined;

export const createProxyEngine = (deps: ProxyEngineDeps): ProxyEngine => {
  const { capabilities, payments, jobs } = deps;

  return {
    async handleRequest(req) {
      // 1. Look up capability
      const cap = capabilities.getCapability(req.capabilityName);
      if (!cap) {
        return {
          status: 404,
          headers: {},
          body: { error: "capability_not_found", capability: req.capabilityName },
        };
      }

      // 2. Check enabled
      if (!cap.enabled) {
        return {
          status: 404,
          headers: {},
          body: { error: "capability_disabled", capability: req.capabilityName },
        };
      }

      if (!cap.pricing) {
        return {
          status: 503,
          headers: {},
          body: {
            error: "pricing_not_configured",
            capability: req.capabilityName,
          },
        };
      }

      // 3. Payment enforcement
      if (cap.pricing) {
        const proof = extractPaymentProof(req.headers);
        const adapterIds = payments.list();

        if (!proof) {
          return {
            status: 402,
            headers: {},
            body: {
              error: "payment_required",
              capability: req.capabilityName,
              pricing: cap.pricing,
              accepts: adapterIds,
            },
          };
        }

        // Build a challenge from pricing for verification
        const challenge: PaymentChallenge = {
          type: "proxy",
          network: "",
          payTo: "",
          amount: cap.pricing.amount.toString(),
          currency: cap.pricing.currency,
          resource: `/proxy/${req.capabilityName}`,
          scheme: cap.pricing.model,
        };

        // Try each adapter's verify — first success wins
        let verified = false;
        for (const id of adapterIds) {
          const adapter = payments.resolve({ ...challenge, type: id });
          if (adapter) {
            verified = await adapter.verify(proof, challenge);
            if (verified) break;
          }
        }

        if (!verified) {
          return {
            status: 402,
            headers: {},
            body: {
              error: "payment_invalid",
              capability: req.capabilityName,
              message: "Payment proof could not be verified",
            },
          };
        }
      }

      // 4. Create and execute job
      const job = await jobs.create({
        capabilityName: req.capabilityName,
        platform: "proxy",
        platformRef: `proxy-${randomUUID().slice(0, 8)}`,
      });
      await jobs.transition(job.id, "executing");

      // 5. Forward to target service
      const input =
        typeof req.body === "object" &&
        req.body !== null &&
        !Array.isArray(req.body) &&
        !(req.body instanceof Uint8Array)
          ? { ...(req.query ?? {}), ...(req.body as Record<string, unknown>) }
          : { ...(req.query ?? {}) };
      const request = buildCapabilityRequest(cap.executionPlan, input, {
        fallbackBody: req.body,
      });

      try {
        const response = await httpRequest({
          ...request,
          responseMode: "proxy",
        });

        // 6. Complete job
        await jobs.transition(job.id, "completed");

        return {
          status: response.status,
          headers: response.headers,
          body: response.body,
        };
      } catch (err) {
        // 7. Fail job on network/timeout error
        await jobs.transition(job.id, "failed", {
          errorDetail: err instanceof Error ? err.message : "Unknown error",
        });

        return {
          status: 502,
          headers: {},
          body: {
            error: "target_unreachable",
            message: err instanceof Error ? err.message : "Unknown error",
          },
        };
      }
    },
  };
};
