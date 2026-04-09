/**
 * Management REST API routes (/manage/*).
 * Each handler: extract ProviderContext → call core → format response.
 */

import { Hono } from "hono";
import type { CapabilityRegistry } from "@agent-adapter/core/capabilities";
import type { ToolHandlers } from "@agent-adapter/core/tools";
import type { PricingConfig, ProviderContext } from "@agent-adapter/contracts";
import type { AuthEnv } from "../auth/index.js";

interface ManagementApiDeps {
  readonly provider: ProviderContext;
  readonly capabilities: CapabilityRegistry;
  readonly tools: ToolHandlers;
}

interface CapabilityExecutionDeps {
  readonly tools: ToolHandlers;
}

const parseJsonBody = async (req: Request): Promise<unknown> => {
  const raw = await req.text();
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid_json");
  }
};

const parsePricingInput = (body: unknown): PricingConfig | null => {
  const candidate =
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "pricing" in body
      ? (body as { pricing: unknown }).pricing
      : body;

  if (candidate === null) return null;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("invalid_pricing");
  }

  const pricing = candidate as Record<string, unknown>;
  const model = pricing.model;
  const amount = pricing.amount;
  const currency = pricing.currency;

  if (
    model !== "per_call" &&
    model !== "per_item" &&
    model !== "per_token" &&
    model !== "quoted"
  ) {
    throw new Error("invalid_pricing_model");
  }

  if (typeof amount !== "number" || Number.isNaN(amount) || amount < 0) {
    throw new Error("invalid_pricing_amount");
  }

  if (typeof currency !== "string" || currency.length === 0) {
    throw new Error("invalid_pricing_currency");
  }

  const floor = pricing.floor;
  const ceiling = pricing.ceiling;
  if (floor !== undefined && (typeof floor !== "number" || Number.isNaN(floor))) {
    throw new Error("invalid_pricing_floor");
  }
  if (
    ceiling !== undefined &&
    (typeof ceiling !== "number" || Number.isNaN(ceiling))
  ) {
    throw new Error("invalid_pricing_ceiling");
  }
  if (
    typeof floor === "number" &&
    typeof ceiling === "number" &&
    floor > ceiling
  ) {
    throw new Error("invalid_pricing_range");
  }

  return {
    model,
    amount,
    currency,
    itemField:
      typeof pricing.itemField === "string" ? pricing.itemField : undefined,
    floor: typeof floor === "number" ? floor : undefined,
    ceiling: typeof ceiling === "number" ? ceiling : undefined,
  };
};

const respondCapabilityExecution = (
  body: unknown,
  status: number,
  headers: Record<string, string>,
) => {
  if (body instanceof Uint8Array) {
    return new Response(Buffer.from(body), { status, headers });
  }

  if (typeof body === "string") {
    return new Response(body, { status, headers });
  }

  if (body === undefined || body === null) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
};

export const createManagementRoutes = (deps: ManagementApiDeps) => {
  const app = new Hono<AuthEnv>();

  app.get("/status", async (c) => {
    const status = await deps.tools.execute("status__whoami", {});
    return c.json(status);
  });

  app.get("/capabilities", (c) => {
    return c.json({
      providerId: deps.provider.providerId,
      capabilities: deps.capabilities.listCapabilities(),
    });
  });

  app.put("/capabilities/:name/pricing", async (c) => {
    let body: unknown;
    try {
      body = await parseJsonBody(c.req.raw);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const name = c.req.param("name");
    try {
      const pricing = parsePricingInput(body);
      const capability = deps.capabilities.setPricing(name, pricing);
      return c.json({ capability });
    } catch (error) {
      if (error instanceof Error && error.message === `Capability not found: ${name}`) {
        return c.json({ error: "capability_not_found", capability: name }, 404);
      }
      return c.json(
        {
          error: "invalid_pricing",
          message: error instanceof Error ? error.message : "Invalid pricing payload",
        },
        400,
      );
    }
  });

  app.put("/capabilities/:name/toggle", async (c) => {
    let body: unknown;
    try {
      body = await parseJsonBody(c.req.raw);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof (body as { enabled?: unknown }).enabled !== "boolean"
    ) {
      return c.json({ error: "invalid_toggle_payload" }, 400);
    }

    const name = c.req.param("name");
    try {
      const capability = deps.capabilities.setEnabled(
        name,
        (body as { enabled: boolean }).enabled,
      );
      return c.json({ capability });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "PricingRequiredError" &&
        "capabilityName" in error
      ) {
        const capabilityName =
          typeof error.capabilityName === "string" ? error.capabilityName : name;
        return c.json(
          {
            error: "pricing_required",
            capability: capabilityName,
            message: error.message,
          },
          409,
        );
      }
      if (error instanceof Error && error.message === `Capability not found: ${name}`) {
        return c.json({ error: "capability_not_found", capability: name }, 404);
      }
      throw error;
    }
  });

  app.post("/capabilities/refresh", async (c) => {
    const result = await deps.capabilities.refresh();
    return c.json({
      providerId: deps.provider.providerId,
      result,
      capabilities: deps.capabilities.listCapabilities(),
    });
  });

  return app;
};

export const createCapabilityExecutionRoutes = (
  deps: CapabilityExecutionDeps,
) => {
  const app = new Hono<AuthEnv>();

  app.post("/capabilities/:name/execute", async (c) => {
    let body: unknown;
    try {
      body = await parseJsonBody(c.req.raw);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "invalid_execute_payload" }, 400);
    }

    const name = c.req.param("name");
    try {
      const result = await deps.tools.execute(`cap__${name}`, body as Record<string, unknown>);
      const execution = result as {
        body: unknown;
        status?: unknown;
        headers?: unknown;
      };
      return respondCapabilityExecution(
        execution.body,
        typeof execution.status === "number" ? execution.status : 200,
        typeof execution.headers === "object" && execution.headers
          ? (execution.headers as Record<string, string>)
          : {},
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === `Capability not found: ${name}`
      ) {
        return c.json({ error: "capability_not_found", capability: name }, 404);
      }
      if (
        error instanceof Error &&
        error.message === `Capability is disabled: ${name}`
      ) {
        return c.json({ error: "capability_disabled", capability: name }, 409);
      }
      return c.json(
        {
          error: "capability_execution_failed",
          capability: name,
          message: error instanceof Error ? error.message : "Unknown error",
        },
        502,
      );
    }
  });

  return app;
};
