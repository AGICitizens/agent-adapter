/**
 * @agent-adapter/server
 *
 * Server factory — createServer(deps, config).
 * Creates Hono app, registers middleware and routes.
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { ServerConfig } from "@agent-adapter/contracts";
import type { ProxyEngine } from "@agent-adapter/core/proxy";
import { authMiddleware, type AuthEnv } from "./auth/index.js";
import { createProxyRoutes } from "./proxy/index.js";

export interface ServerDeps {
  readonly proxyEngine: ProxyEngine;
}

export interface Server {
  /** The Hono app instance (for testing or custom mounting). */
  readonly app: Hono<AuthEnv>;
  /** Start listening on the configured host:port. */
  start(): void;
}

export const createServer = (
  deps: ServerDeps,
  config: ServerConfig,
): Server => {
  const app = new Hono<AuthEnv>();

  // Global auth — resolves providerId for all routes
  app.use("*", authMiddleware());

  // Proxy routes: /proxy/:capabilityName
  app.route("/proxy", createProxyRoutes(deps.proxyEngine));

  // TODO: Management API routes (/manage/*) — task 2.6
  // TODO: Capability execution API (/api/v1/capabilities/:name/execute) — task 2.7

  return {
    app,
    start() {
      serve(
        { fetch: app.fetch, hostname: config.host, port: config.port },
        (info) => {
          console.log(`Agent adapter listening on http://${info.address}:${info.port}`);
        },
      );
    },
  };
};
