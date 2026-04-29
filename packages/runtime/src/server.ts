import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import type { RuntimeConfig } from "./config.js";
import type { PluginRegistry } from "./plugins/registry.js";

export interface ServerContext {
  config: RuntimeConfig;
  registry: PluginRegistry;
}

export function createServer(ctx: ServerContext): Hono {
  const app = new Hono();

  app.use("*", honoLogger());
  app.use("*", cors());

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      adapter: ctx.config.adapter.name,
      mode: ctx.config.adapter.mode,
    }),
  );

  // Reverse-proxy capability routes are mounted via mountReverseProxy().
  // Management API and dashboard mount points land in later commits.

  return app;
}
