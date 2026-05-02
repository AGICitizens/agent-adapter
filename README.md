# Agent Adapter

A TypeScript runtime that turns any HTTP API into a paid endpoint on EVM. Buyers find providers through ENS, pay through an on-chain escrow on 0G Galileo, and call the API. No API keys, no signups.

## Live deployments

- Escrow contract on 0G Galileo (chain 16602): [`0xc5b8ea3842A30D85424eAdAa00c8729ac6892214`](https://chainscan-galileo.0g.ai/address/0xc5b8ea3842A30D85424eAdAa00c8729ac6892214)
- ENS parent on Sepolia: `agentadapter.eth`
- Demo subname: `weather.agentadapter.eth`
- Sample paid call (real Paid event): [tx](https://chainscan-galileo.0g.ai/tx/0x0d5c9e6f7c16937ce524f83ebc7b6d541a0579ac1b98ccb585006d2ae3417398)

## How it works

1. The seller runs a Hono server (the runtime). It wraps an upstream API (open-meteo for the demo).
2. The buyer reads the seller's ENS subname on Sepolia. One `getEnsText` call returns endpoint, capabilities, pricing, and escrow address.
3. Buyer hits the seller. Seller responds with HTTP 402 and an x402 challenge (amount, nonce, payee).
4. Buyer signs and broadcasts `escrow.pay(nonce, payee)` on 0G Galileo with the right `msg.value`.
5. Buyer retries the call with an `X-PAYMENT` header. Seller checks the `Paid` event in the receipt, then forwards the request to the upstream and returns the response.

KeeperHub is wired in to publish the seller's ENS records without the seller needing Sepolia gas. The demo calls KeeperHub's `helloworld` workflow as a connectivity proof; production wires a custom Web3-plugin workflow.

## Run the demo

You need Node 20+, pnpm, and Foundry.

```
git clone https://github.com/AGICitizens/agent-adapter.git
cd agent-adapter
pnpm install

cp .env.example .env                  # fill in your keys
cp agent-adapter.example.yaml agent-adapter.yaml

pnpm build
pnpm demo
```

The demo boots the seller and a buyer agent in two processes and prints the rounds in one terminal. End-to-end runtime is around 15-20 seconds and produces a real on-chain payment on 0G Galileo each run.

## Folders

```
packages/contracts        Shared TS interfaces
packages/runtime          Hono server + reverse-proxy
packages/wallet-evm       viem wallet plugin
packages/payment-x402     x402 challenge + Paid-event verifier
packages/ens-identity     ENS text-record reader
packages/keeperhub        KeeperHub workflow client
apps/buyer-agent          LLM-driven buyer (OpenRouter)
apps/demo                 Terminal orchestrator
solidity/                 Escrow contract + Foundry tests
```

## Security notes

- Private keys are read from `process.env` at boot. Never inlined, never committed.
- `.env` and `agent-adapter.yaml` are gitignored. Only `.env.example` and `agent-adapter.example.yaml` are tracked.
- Logger redacts `*.privateKey`, `*.apiKey`, and named env vars.
- Replay protection is at two layers: in-memory nonce set in the adapter and the on-chain `consumedNonces` mapping in the escrow.

## License

MIT.
