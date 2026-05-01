#!/usr/bin/env node
import { privateKeyToAccount } from "viem/accounts";
import { createEnsIdentityResolver } from "@agent-adapter/ens-identity";
import { createEvmWallet } from "@agent-adapter/wallet-evm";
import type { AdapterIdentity, EvmAddress } from "@agent-adapter/contracts";
import { loadEnv } from "./env.js";
import { stdoutEmitter } from "./events.js";
import { createLlmClient } from "./llm.js";
import { runLoop } from "./loop.js";
import { X402Client } from "./x402-client.js";

interface CliArgs {
  goal: string;
  subname: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--goal") args.goal = argv[++i];
    else if (arg === "--subname") args.subname = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      printHelpAndExit(0);
    }
  }
  if (!args.goal) {
    console.error("buyer-agent: --goal <text> is required");
    printHelpAndExit(1);
  }
  return {
    goal: args.goal!,
    subname: args.subname ?? "weather.agentadapter.eth",
  };
}

function printHelpAndExit(code: number): never {
  console.error("Usage: buyer-agent --goal <text> [--subname <ens-name>]");
  console.error("");
  console.error("Required env: OPENROUTER_API_KEY, ZG_RPC_URL, ZG_ESCROW_ADDRESS,");
  console.error("              SEPOLIA_RPC_URL, BUYER_PRIVATE_KEY (or PRIVATE_KEY)");
  process.exit(code);
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const emit = stdoutEmitter;

  const buyerAccount = privateKeyToAccount(env.BUYER_PRIVATE_KEY);
  const buyerWallet = createEvmWallet({
    chainId: env.BUYER_PAYMENT_CHAIN_ID,
    rpcUrl: env.ZG_RPC_URL,
    privateKey: env.BUYER_PRIVATE_KEY,
    name: "0G-Galileo",
    symbol: "0G",
  });

  const resolver = createEnsIdentityResolver({
    chainId: env.BUYER_IDENTITY_CHAIN_ID,
    rpcUrl: env.SEPOLIA_RPC_URL,
    defaultPaymentChainId: env.BUYER_PAYMENT_CHAIN_ID,
  });

  const x402 = new X402Client({
    buyerWallet,
    paymentChainId: env.BUYER_PAYMENT_CHAIN_ID,
    emitEvent: emit,
    timeoutMs: env.BUYER_REQUEST_TIMEOUT_MS,
  });

  const llm = createLlmClient({
    apiKey: env.OPENROUTER_API_KEY,
    model: env.LLM_MODEL,
  });

  const identityCache = new Map<string, AdapterIdentity>();

  emit({
    kind: "boot",
    goal: cli.goal,
    subname: cli.subname,
    model: env.LLM_MODEL,
    buyerAddress: buyerAccount.address as EvmAddress,
  });

  await runLoop({
    goal: cli.goal,
    defaultSubname: cli.subname,
    maxRounds: env.BUYER_MAX_ROUNDS,
    llm,
    model: env.LLM_MODEL,
    toolEnv: { resolver, x402, identityCache, emitEvent: emit },
    emitEvent: emit,
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`buyer-agent fatal: ${message}\n`);
  process.exit(1);
});
