#!/usr/bin/env node
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createEnsIdentityResolver } from "@agent-adapter/ens-identity";
import {
  KeeperHubClient,
  KeeperHubError,
  KeeperHubIdentityPublisher,
} from "@agent-adapter/keeperhub";
import {
  banner,
  blank,
  bullet,
  detail,
  fail,
  note,
  plain,
  roundHeader,
  sectionRule,
  shortAddr,
  shortHash,
  step,
  success,
  tag,
  tagResponse,
  warn,
} from "./ui.js";

interface DemoConfig {
  yamlPath: string;
  goal: string;
  subname: string;
  buyerKey: `0x${string}`;
  sellerKey: `0x${string}`;
  zgRpcUrl: string;
  sepoliaRpcUrl: string;
  escrowAddress: `0x${string}`;
  paymentChainId: number;
  identityChainId: number;
  llmModel: string;
  openrouterKey: string;
}

interface ParsedYaml {
  adapter: { name: string; mode: string };
  capabilities: { source: { type: string; baseUrl?: string }; pricing: Record<string, unknown> };
  http: { host: string; port: number };
}

interface AggregatedStats {
  rounds: number;
  toolCalls: number;
  payments: { txHash: string; nonce: string }[];
  totalLatencyMs: number;
}

async function main(): Promise<void> {
  const cfg = loadDemoConfig();
  const yaml = readSellerYaml(cfg.yamlPath);

  banner(`Agent Adapter Runtime — Live Demo`);
  printConfigBlock(cfg, yaml);

  // ── Phase 1: Infrastructure Setup ─────────────────────────────────────────
  sectionRule("Infrastructure Setup");

  let n = 0;
  step(++n, "Loading runtime config + .env");
  detail("yaml", cfg.yamlPath);
  detail("adapter", `${yaml.adapter.name} (${yaml.adapter.mode})`);

  step(++n, "Checking buyer wallet on 0G Galileo");
  await reportWalletBalance(cfg.zgRpcUrl, cfg.paymentChainId, cfg.buyerKey, "Buyer");

  step(++n, "Checking seller wallet on 0G Galileo");
  await reportWalletBalance(cfg.zgRpcUrl, cfg.paymentChainId, cfg.sellerKey, "Seller");

  step(++n, `Verifying escrow on 0G Galileo (chain ${cfg.paymentChainId})`);
  detail("contract", cfg.escrowAddress);
  detail("explorer", `https://chainscan-galileo.0g.ai/address/${cfg.escrowAddress}`);

  step(++n, "Triggering KeeperHub workflow to publish identity on Sepolia");
  await triggerKeeperHubPublish(cfg);

  step(++n, "Resolving provider identity via ENS on Sepolia");
  const identity = await resolveIdentity(cfg);
  if (!identity) {
    fail(`No ENS records found at ${cfg.subname}.`);
    note(
      "Pre-populate text records first (see scripts/seed-ens.sh) or wait for KeeperHub to publish.",
    );
    process.exit(1);
  }
  detail("subname", cfg.subname);
  detail("endpoint", identity.endpoint);
  detail("capabilities", identity.capabilities.join(", ") || "(none)");
  for (const [capId, price] of Object.entries(identity.pricing)) {
    detail(`pricing.${capId}`, `${price.amount} (${price.asset})`);
  }

  step(++n, "Booting reverse-proxy server");
  const seller = await bootSeller(cfg);
  detail("listening", `http://${yaml.http.host}:${yaml.http.port}`);
  success("seller ready");

  // ── Phase 2: Buyer Goal ───────────────────────────────────────────────────
  sectionRule("Buyer Agent Goal");
  bullet(cfg.goal);
  blank();

  // ── Phase 3: Buyer Loop ───────────────────────────────────────────────────
  sectionRule("Buyer Agent — LLM-Driven (Real Tools, Real Tx)");
  const stats = await runBuyer(cfg);

  // ── Phase 4: Results ──────────────────────────────────────────────────────
  sectionRule("Results");
  plain(
    `Completed in ${(stats.totalLatencyMs / 1000).toFixed(1)}s across ${stats.rounds} rounds, ${stats.toolCalls} tool calls`,
  );
  blank();
  for (const p of stats.payments) {
    bullet(
      `payment: tx=${shortHash(p.txHash)}  on https://chainscan-galileo.0g.ai/tx/${p.txHash}`,
    );
  }
  blank();

  banner("Demo Complete");

  // graceful seller shutdown
  seller.kill("SIGTERM");
  await new Promise<void>((res) => seller.on("exit", () => res()));
}

function loadDemoConfig(): DemoConfig {
  const yamlPath = process.env.AGENT_ADAPTER_YAML ?? "agent-adapter.yaml";
  const goal =
    process.env.DEMO_GOAL ?? "Get the current temperature in Tokyo and report it.";
  const subname = process.env.DEMO_SUBNAME ?? "weather.agentadapter.eth";

  const sellerKey = process.env.PRIVATE_KEY;
  const buyerKey = process.env.BUYER_PRIVATE_KEY ?? sellerKey;

  if (!sellerKey || !/^0x[a-fA-F0-9]{64}$/.test(sellerKey)) {
    throw new Error("PRIVATE_KEY (seller) is not set or malformed.");
  }
  if (!buyerKey || !/^0x[a-fA-F0-9]{64}$/.test(buyerKey)) {
    throw new Error("BUYER_PRIVATE_KEY (or PRIVATE_KEY fallback) is not set or malformed.");
  }
  const zgRpcUrl = process.env.ZG_RPC_URL;
  const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL;
  const escrowAddress = process.env.ZG_ESCROW_ADDRESS;
  if (!zgRpcUrl) throw new Error("ZG_RPC_URL is not set.");
  if (!sepoliaRpcUrl) throw new Error("SEPOLIA_RPC_URL is not set.");
  if (!escrowAddress) throw new Error("ZG_ESCROW_ADDRESS is not set.");

  return {
    yamlPath,
    goal,
    subname,
    buyerKey: buyerKey as `0x${string}`,
    sellerKey: sellerKey as `0x${string}`,
    zgRpcUrl,
    sepoliaRpcUrl,
    escrowAddress: escrowAddress as `0x${string}`,
    paymentChainId: Number(process.env.ZG_CHAIN_ID ?? 16602),
    identityChainId: Number(process.env.SEPOLIA_CHAIN_ID ?? 11155111),
    llmModel: process.env.LLM_MODEL ?? "google/gemini-2.0-flash-001",
    openrouterKey: process.env.OPENROUTER_API_KEY ?? "",
  };
}

function readSellerYaml(path: string): ParsedYaml {
  const raw = readFileSync(resolve(path), "utf8");
  const parsed = parseYaml(raw) as ParsedYaml;
  return parsed;
}

function printConfigBlock(cfg: DemoConfig, yaml: ParsedYaml): void {
  const lines = [
    `Payment:   x402 on-chain native (0G Galileo, chain ${cfg.paymentChainId})`,
    `Escrow:    ${cfg.escrowAddress}`,
    `LLM:       ${cfg.llmModel} via OpenRouter`,
    `Provider:  ${yaml.adapter.name} — ${yaml.capabilities.source.baseUrl ?? "<no baseUrl>"} behind x402 paywall`,
    `Discovery: ENS subnames on Sepolia (chain ${cfg.identityChainId})`,
    `Everything is real — no mocks.`,
  ];
  blank();
  for (const line of lines) plain(`        ${line}`);
}

async function reportWalletBalance(
  rpcUrl: string,
  chainId: number,
  privateKey: `0x${string}`,
  label: string,
): Promise<void> {
  try {
    const account = privateKeyToAccount(privateKey);
    const client = createPublicClient({
      chain: {
        id: chainId,
        name: `chain-${chainId}`,
        nativeCurrency: { decimals: 18, name: "0G", symbol: "0G" },
        rpcUrls: { default: { http: [rpcUrl] } },
      },
      transport: http(rpcUrl),
    });
    const balance = await client.getBalance({ address: account.address });
    detail(`${label} address`, account.address);
    detail(`${label} balance`, `${formatEther(balance)} 0G`);
  } catch (err) {
    warn(`balance check failed: ${describeError(err)}`);
  }
}

async function triggerKeeperHubPublish(cfg: DemoConfig): Promise<void> {
  const apiKey = process.env.KEEPERHUB_API_KEY;
  const slug = process.env.KEEPERHUB_IDENTITY_WORKFLOW_SLUG;
  const baseUrl = process.env.KEEPERHUB_BASE_URL ?? "https://app.keeperhub.com/api";

  if (!apiKey || !slug) {
    note("KEEPERHUB_API_KEY or KEEPERHUB_IDENTITY_WORKFLOW_SLUG not set — skipping.");
    note("(Demo continues using the pre-published ENS records.)");
    return;
  }

  const sellerAccount = privateKeyToAccount(cfg.sellerKey);
  const manifest = {
    walletAddress: sellerAccount.address,
    endpoint: `http://127.0.0.1:8080`,
    capabilities: ["forecast"],
    pricing: { forecast: { amount: "1000000000000000", asset: "native" as const } },
    paymentChainId: cfg.paymentChainId,
    escrowAddress: cfg.escrowAddress,
  };

  try {
    const client = new KeeperHubClient({ apiKey, baseUrl });
    const publisher = new KeeperHubIdentityPublisher({ client, workflowSlug: slug });
    const result = await publisher.publish({
      subname: cfg.subname,
      ownerAddress: sellerAccount.address,
      manifest,
    });
    detail("workflow", slug);
    detail("executionId", result.executionId);
    detail("status", `${result.status} (async on KeeperHub)`);
    note("KeeperHub uses its managed Sepolia wallet to write the ENS records.");
  } catch (err) {
    if (err instanceof KeeperHubError) {
      warn(`KeeperHub returned ${err.status ?? "?"}: ${err.message}`);
    } else {
      warn(`KeeperHub trigger failed: ${describeError(err)}`);
    }
    note("Demo continues using the pre-published ENS records.");
  }
}

async function resolveIdentity(cfg: DemoConfig): Promise<
  | {
      endpoint: string;
      capabilities: string[];
      pricing: Record<string, { amount: string; asset: string }>;
      escrowAddress?: string;
    }
  | null
> {
  const resolver = createEnsIdentityResolver({
    chainId: cfg.identityChainId,
    rpcUrl: cfg.sepoliaRpcUrl,
    defaultPaymentChainId: cfg.paymentChainId,
  });
  const identity = await resolver.resolveAdapter(cfg.subname);
  if (!identity) return null;
  return {
    endpoint: identity.endpoint,
    capabilities: identity.capabilities,
    pricing: identity.pricing,
    escrowAddress: identity.escrowAddress,
  };
}

async function bootSeller(cfg: DemoConfig): Promise<ChildProcess> {
  const sellerCli = resolve(process.cwd(), "packages/runtime/dist/cli.js");
  const child = spawn("node", [sellerCli, "run", cfg.yamlPath], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // forward seller output to stderr (visually distinct from buyer's structured events)
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[seller] ${chunk.toString()}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[seller] ${chunk.toString()}`);
  });

  // wait until the seller logs that the http server is listening
  return new Promise((resolveBoot, rejectBoot) => {
    const timeout = setTimeout(() => {
      rejectBoot(new Error("seller did not become ready in 15s"));
    }, 15_000);

    const onChunk = (chunk: Buffer): void => {
      if (chunk.toString().includes("http server listening")) {
        clearTimeout(timeout);
        resolveBoot(child);
      }
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        rejectBoot(new Error(`seller exited early with code ${code}`));
      }
    });
  });
}

async function runBuyer(cfg: DemoConfig): Promise<AggregatedStats> {
  const buyerCli = resolve(process.cwd(), "apps/buyer-agent/dist/index.js");
  const child = spawn(
    "node",
    [buyerCli, "--goal", cfg.goal, "--subname", cfg.subname],
    {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[buyer] ${chunk.toString()}`);
  });

  const stats: AggregatedStats = {
    rounds: 0,
    toolCalls: 0,
    payments: [],
    totalLatencyMs: 0,
  };

  let buffer = "";
  const lineHandler = (chunk: Buffer): void => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        renderBuyerEvent(event, stats);
      } catch {
        // non-JSON line — surface for debug
        process.stderr.write(`[buyer raw] ${line}\n`);
      }
    }
  };
  child.stdout?.on("data", lineHandler);

  await new Promise<void>((res, rej) => {
    child.on("exit", (code) => {
      if (code === 0 || code === null) res();
      else rej(new Error(`buyer-agent exited with code ${code}`));
    });
  });

  return stats;
}

function renderBuyerEvent(event: Record<string, unknown>, stats: AggregatedStats): void {
  const kind = String(event.kind);
  switch (kind) {
    case "boot":
      tag(
        "SYS",
        `Buyer Boot — model=${event.model}  buyer=${shortAddr(String(event.buyerAddress))}`,
      );
      break;

    case "round-start":
      stats.rounds = Math.max(stats.rounds, Number(event.round));
      roundHeader(Number(event.round));
      break;

    case "thinking":
      tag("SYS", "thinking…", undefined, `${(Number(event.latencyMs) / 1000).toFixed(1)}s`);
      stats.totalLatencyMs += Number(event.latencyMs);
      break;

    case "tool-call":
      stats.toolCalls += 1;
      tag("CAP", `Tool ${event.tool}`, JSON.stringify(event.args));
      break;

    case "tool-result":
      tagResponse(`tool ${event.tool} → ok`, summarize(event.result));
      break;

    case "tool-error":
      tagResponse(`tool ${event.tool} → error: ${event.message}`);
      break;

    case "ens-resolved": {
      const id = (event.identity ?? {}) as Record<string, unknown>;
      tag(
        "NET",
        `ENS resolve  ${event.subname}`,
        `endpoint=${id.endpoint} capabilities=${JSON.stringify(id.capabilities ?? [])}`,
      );
      break;
    }

    case "x402-challenge":
      tag(
        "NET",
        `402 challenge  ${event.capability}`,
        `amount=${event.amount} nonce=${shortHash(String(event.nonce))}`,
      );
      break;

    case "x402-paid":
      tag(
        "KEY",
        `Wallet Sign + broadcast`,
        `tx=${shortHash(String(event.txHash))}  nonce=${shortHash(String(event.nonce))}`,
      );
      stats.payments.push({
        txHash: String(event.txHash),
        nonce: String(event.nonce),
      });
      break;

    case "x402-verified":
      tagResponse(`payment verified by adapter — forwarding upstream`);
      break;

    case "result":
      tag("CAP", "Final result", summarize(event.payload));
      break;

    case "error":
      tag("SYS", `error: ${event.message}`);
      break;

    case "done":
      stats.rounds = Number(event.rounds);
      stats.totalLatencyMs = Number(event.totalLatencyMs);
      break;

    default:
      tag("SYS", `(${kind})`, JSON.stringify(event));
  }
}

function summarize(value: unknown, max = 160): string {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

main().catch((err) => {
  process.stderr.write(`demo orchestrator fatal: ${describeError(err)}\n`);
  process.exit(1);
});
