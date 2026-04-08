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

const parseQuery = (url: string): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  const searchParams = new URL(url).searchParams;

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    result[key] = values.length <= 1 ? values[0] : values;
  }

  return result;
};

/** Parse JSON bodies into objects; preserve all other payloads as bytes. */
const parseBody = async (req: Request): Promise<unknown> => {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }

  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.length === 0) return undefined;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return raw;
    }
  }

  return raw;
};

export const createProxyRoutes = (proxyEngine: ProxyEngine) => {
  const app = new Hono<AuthEnv>();

  app.all("/:capabilityName", async (c) => {
    const capabilityName = c.req.param("capabilityName");

    const result = await proxyEngine.handleRequest({
      capabilityName,
      method: c.req.method,
      headers: flattenHeaders(c.req.raw.headers),
      query: parseQuery(c.req.url),
      body: await parseBody(c.req.raw),
    });

    if (result.body instanceof Uint8Array) {
      return new Response(Buffer.from(result.body), {
        status: result.status,
        headers: result.headers,
      });
    }

    if (typeof result.body === "string") {
      return new Response(result.body, {
        status: result.status,
        headers: result.headers,
      });
    }

    if (result.body === undefined || result.body === null) {
      return new Response(null, {
        status: result.status,
        headers: result.headers,
      });
    }

    return c.json(result.body as object, result.status as 200, result.headers);
  });

  return app;
};
