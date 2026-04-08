/**
 * Reverse proxy middleware (/proxy/*).
 * Thin HTTP ↔ ProxyRequest/ProxyResponse translation.
 * All business logic lives in core/proxy.
 */

import { Hono } from "hono";
import type { ProxyEngine } from "@agent-adapter/core/proxy";
import type { AuthEnv } from "../auth/index.js";

/** Flatten Headers into a plain Record. */
const flattenHeaders = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
};

/** Safely parse request body as JSON, return undefined if empty or not JSON. */
const parseBody = async (req: Request): Promise<unknown> => {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined;
  try {
    return await req.json();
  } catch {
    return undefined;
  }
};

export const createProxyRoutes = (proxyEngine: ProxyEngine) => {
  const app = new Hono<AuthEnv>();

  app.all("/:capabilityName", async (c) => {
    const capabilityName = c.req.param("capabilityName");

    const result = await proxyEngine.handleRequest({
      capabilityName,
      method: c.req.method,
      headers: flattenHeaders(c.req.raw.headers),
      body: await parseBody(c.req.raw),
    });

    return c.json(result.body as object, result.status as 200, result.headers);
  });

  return app;
};
