import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import { pino, type Logger } from "pino";
import type { Store } from "@agent-adapter/contracts";
import type { RuntimeConfig } from "./config.js";
import { createPluginRegistry } from "./plugins/registry.js";
import { mountReverseProxy } from "./reverseProxy.js";
import { createServer } from "./server.js";
import { openDatabase, type DatabaseHandle } from "./store/db.js";

export interface Runtime {
  shutdown: () => Promise<void>;
}

export async function startRuntime(config: RuntimeConfig): Promise<Runtime> {
  const log = pino({ level: process.env.LOG_LEVEL ?? "info" });
  log.info({ name: config.adapter.name, mode: config.adapter.mode }, "agent-adapter booting");

  const dataDir = resolve(config.adapter.dataDir);
  mkdirSync(dataDir, { recursive: true });

  const handle = openDatabase(resolve(dataDir, "agent-adapter.db"));
  const registry = createPluginRegistry(createPlaceholderStore());

  // TODO(commit 4): load wallet plugin (viem, multi-chain), payment adapters
  // (free + x402), capability discovery from OpenAPI URL, ENS subname
  // registration via KeeperHub, escrow contract verification on 0G Galileo.

  const app = createServer({ config, registry });
  mountReverseProxy(app, { config, registry }, []); // capabilities arrive in commit 4

  const httpServer = serve({
    fetch: app.fetch,
    hostname: config.http.host,
    port: config.http.port,
  });
  log.info(
    { url: `http://${config.http.host}:${config.http.port}` },
    "http server listening",
  );

  return {
    shutdown: () => shutdown(httpServer, handle, log),
  };
}

async function shutdown(server: ServerType, handle: DatabaseHandle, log: Logger): Promise<void> {
  await new Promise<void>((res) => server.close(() => res()));
  handle.close();
  log.info("shutdown complete");
}

// Placeholder Store until the SQLite-backed adapter lands in commit 4.
function createPlaceholderStore(): Store {
  return {
    capabilities: {
      list: async () => [],
      get: async () => null,
      upsert: async () => {},
      remove: async () => {},
    },
    jobs: {
      create: async () => {},
      update: async () => {},
      get: async () => null,
      list: async () => [],
    },
    decisions: {
      log: async () => {},
      list: async () => [],
    },
  };
}
