# Agent Adapter

A TypeScript runtime that turns any HTTP API into a paid endpoint on EVM. AI agents discover providers through ENS, pay through an on-chain escrow on 0G Galileo, and call the upstream API — without API keys, accounts, or a centralized marketplace.

## What it does

- Wraps any HTTP API behind a payment-gated runtime
- Uses ENS on Sepolia for provider discovery
- Uses an EVM escrow contract on 0G Galileo for x402-style payments
- Includes an LLM-driven buyer agent that resolves a provider, pays, and returns the result
- Includes KeeperHub integration for managed ENS publishing

## Live deployments

| Network | Component | Address |
|---|---|---|
| 0G Galileo | Escrow contract | [`0xc5b8ea3842A30D85424eAdAa00c8729ac6892214`](https://chainscan-galileo.0g.ai/address/0xc5b8ea3842A30D85424eAdAa00c8729ac6892214) |
| Ethereum Sepolia | ENS parent | `agentadapter.eth` |
| Ethereum Sepolia | Demo subname | `weather.agentadapter.eth` |
| 0G Galileo | Sample paid call | [`0x0d5c9e6f…`](https://chainscan-galileo.0g.ai/tx/0x0d5c9e6f7c16937ce524f83ebc7b6d541a0579ac1b98ccb585006d2ae3417398) |

## Quickstart

Prerequisites: Node.js 20+, pnpm, Foundry.

```bash
git clone https://github.com/AGICitizens/agent-adapter.git
cd agent-adapter
pnpm install

cp .env.example .env
cp agent-adapter.example.yaml agent-adapter.yaml

pnpm build
pnpm demo
```

The demo completes in ~20 seconds and produces a real payment transaction on 0G Galileo.

## Configuration

The runtime reads `agent-adapter.yaml`. Secrets come from `.env` via `${VAR}` interpolation.

| Variable | Purpose |
|---|---|
| `PRIVATE_KEY` | Seller wallet private key |
| `BUYER_PRIVATE_KEY` | Buyer wallet private key (falls back to `PRIVATE_KEY`) |
| `ZG_RPC_URL` | 0G Galileo RPC |
| `ZG_ESCROW_ADDRESS` | Deployed escrow contract address |
| `SEPOLIA_RPC_URL` | Sepolia RPC for ENS reads |
| `ENS_PARENT_NAME` | Parent ENS name |
| `KEEPERHUB_API_KEY` | KeeperHub API token |
| `KEEPERHUB_IDENTITY_WORKFLOW_SLUG` | KeeperHub workflow slug |
| `OPENROUTER_API_KEY` | OpenRouter API key for the buyer agent |
| `LLM_MODEL` | Model id for the buyer agent |

## Bounty integrations

Per-bounty details are in [`bounties/`](./bounties):

- [0G](./bounties/0G.md)
- [ENS](./bounties/ENS.md)
- [KeeperHub](./bounties/KEEPERHUB.md)

## Repository layout

```
packages/
  contracts/       shared TypeScript interfaces
  runtime/         reverse-proxy runtime
  wallet-evm/      viem wallet integration
  payment-x402/    x402 payment adapter
  ens-identity/    ENS resolver
  keeperhub/       KeeperHub workflow client
apps/
  buyer-agent/     LLM-driven buyer agent
  demo/            terminal demo orchestrator
  future-ui/       local management UI preview
solidity/
  src/             escrow contract
  script/          deployment script
  test/            Foundry tests
```

## License

MIT — see [`LICENSE`](./LICENSE).
