#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { startRuntime } from "./runtime.js";

const COMMANDS = new Set(["init", "run"]);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || !COMMANDS.has(command)) {
    printUsage();
    process.exit(1);
  }
  if (command === "init") {
    runInit(args[1] ?? "agent-adapter");
    return;
  }
  if (command === "run") {
    const configPath = args[1] ?? "agent-adapter.yaml";
    const config = loadConfig(configPath);
    const runtime = await startRuntime(config);
    const stop = async () => {
      await runtime.shutdown();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }
}

function printUsage(): void {
  process.stdout.write(
    "Usage:\n" +
      "  agent-adapter init [name]      Scaffold an agent-adapter.yaml + data dir\n" +
      "  agent-adapter run  [config]    Start the runtime against the given YAML config\n",
  );
}

function runInit(name: string): void {
  const dir = resolve(name);
  if (existsSync(dir)) {
    process.stderr.write(`Directory already exists: ${dir}\n`);
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, "data"), { recursive: true });
  writeFileSync(
    resolve(dir, "agent-adapter.yaml"),
    DEFAULT_YAML.replace("__NAME__", name),
    "utf8",
  );
  writeFileSync(resolve(dir, ".env"), DEFAULT_ENV, "utf8");
  process.stdout.write(
    `Scaffolded ${name}/ — edit agent-adapter.yaml, fill .env, run \`agent-adapter run\`\n`,
  );
}

const DEFAULT_YAML = `adapter:
  name: __NAME__
  dataDir: ./data
  mode: reverse-proxy

capabilities:
  source:
    type: openapi
    url: ""
  pricing: {}

wallet:
  type: viem
  privateKey: \${PRIVATE_KEY}

chains:
  payment:
    id: 16602
    rpcUrl: \${ZG_RPC_URL}
  identity:
    id: 11155111
    rpcUrl: \${SEPOLIA_RPC_URL}

payments:
  - type: free

http:
  host: 127.0.0.1
  port: 8080
`;

const DEFAULT_ENV = `PRIVATE_KEY=
ZG_RPC_URL=https://evmrpc-testnet.0g.ai
SEPOLIA_RPC_URL=
KEEPERHUB_API_KEY=
`;

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
