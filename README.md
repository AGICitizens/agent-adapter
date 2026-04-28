# Agent Adapter

> Wrap any HTTP API or MCP server into a self-hosted, wallet-backed economic agent on EVM.

Agent Adapter is a TypeScript runtime that lets a provider take an existing API or tool surface, attach pricing and an EVM wallet, and serve it behind a reverse-proxy that handles payment-gating, settlement, and onchain identity — without rewriting around any one marketplace, payment rail, or chain.

## What it does

- **Reverse-proxy mode** — the adapter sits in front of an upstream HTTP API; clients pay-per-call via `x402`, the adapter settles onchain, then forwards the request to the upstream.
- **Onchain identity** — every adapter instance owns an ENS subname; wallet, capability list, and pricing live in ENS text records, so other agents discover and verify the adapter through one onchain lookup.
- **Plugin contracts** — wallets, payment adapters, stores, and extensions are all defined as TypeScript interfaces; implementations are swappable.
- **Multichain by design** — payment escrow on 0G Galileo, identity layer on Ethereum Sepolia. All chain config is env-driven; nothing is hardcoded.

## Repo layout

```
packages/
  contracts/       Shared TS interfaces (wallet, payment, store, extension)
  runtime/         Hono server, config, store, reverse-proxy
  wallet-evm/      viem-based EVM wallet plugin
  payment-x402/    HTTP 402 challenge/redeem flow
  ens-identity/    ENS subname registration + text record reads/writes
  keeperhub/       KeeperHub MCP integration for execution reliability
apps/
  demo-provider/   Minimal upstream API used for end-to-end demos
  example-agent/   Buyer-side example: resolves, pays, calls
solidity/          Foundry project for the on-chain escrow contract
```

## Quickstart

```bash
pnpm install
cp .env.example .env  # fill in values
pnpm dev
```

## License

MIT — see [LICENSE](./LICENSE).
