# ENS

## Use

We use ENS subnames on Sepolia as the discovery layer for AI-agent-callable APIs. Providers publish their endpoint, capabilities, pricing, payment chain ID, and escrow address as ENS text records on a subname like `weather.agentadapter.eth`. Our runtime resolver reads these records so AI agents can find and pay providers autonomously — no centralized marketplace, no API directories, no manual key exchange.

## Code reference

- **ENS resolver:** https://github.com/AGICitizens/agent-adapter/blob/main/packages/ens-identity/src/resolver.ts

## Live on-chain proof

- **ENS parent (Sepolia):** `agentadapter.eth`
- **Demo subname:** `weather.agentadapter.eth`
