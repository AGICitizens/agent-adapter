# PRD: Agent Adapter Runtime

## Overview

- **What**: A runtime that turns any API or MCP server into an economic agent — capable of discovering work, getting paid, and participating in agent economies — available as self-hosted OSS or a managed hosted service.
- **Why**: API providers who want to participate in agent economies currently have to hand-roll integrations for each ecosystem, implement payment protocols, and keep all of it updated. They just want: "Let agents use and pay for my API." The adapter handles the economic plumbing so providers can focus on their core service.
- **Who**: API providers and MCP server operators who want to monetize their services in agent economies without writing blockchain, payment, or platform-specific code.
- **Success metric**: A provider can go from "I have an API" to "agents are paying to use it" in under 10 minutes, with zero blockchain knowledge.

## Goals

- [ ] G01 — Provider wraps an existing API and has paid capability execution within 10 minutes of setup
- [ ] G02 — LLM-less mode works as a standalone payment proxy (no agent intelligence required)
- [ ] G03 — LLM-enabled mode autonomously discovers work, bids, executes, and gets paid across platforms
- [ ] G04 — Same codebase serves both self-hosted (SQLite, no auth) and hosted (Postgres/Supabase, multi-tenant) deployments
- [ ] G05 — Provider can give a docs URL and the system infers API capabilities via LLM, validates them, and onboards endpoints automatically
- [ ] G06 — Plugin architecture allows community-built wallet providers, payment adapters, platform drivers, and tool extensions

## Non-Goals (Out of Scope for v1)

- No mobile app or native desktop client
- No built-in marketplace or task board — the adapter connects to external platforms
- No hardware wallet or MPC-based key management (software wallets only via OWS or raw keypairs)
- No capability composition / multi-step workflow chaining (providers use manual capabilities or the agent orchestrates at runtime)
- No built-in rate limiting dashboard for providers' upstream APIs (adapter enforces its own limits, provider manages their own API limits)
- No GraphQL capability source (OpenAPI, MCP, manual, and LLM-inferred only)

## User Stories

| ID  | Story                                                                                                                                                  | Priority |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| U01 | As a provider, I want to point the adapter at my OpenAPI spec and have it discover all my endpoints, so I can choose which to monetize.                | P0       |
| U02 | As a provider, I want to set per-endpoint pricing (per-call, per-item, quoted) through a dashboard, so I control my economics.                         | P0       |
| U03 | As a provider, I want the adapter to handle x402 payment negotiation automatically, so agents can pay-per-call without me writing payment code.        | P0       |
| U04 | As a provider, I want to run the adapter without an LLM, using it purely as a payment proxy between agents and my API.                                 | P0       |
| U05 | As a provider, I want to enable the LLM agent to autonomously find work on platforms and bid on tasks matching my capabilities.                        | P1       |
| U06 | As a provider, I want to paste my docs URL and have the adapter infer my API endpoints, validate them with test calls, and present them for review.    | P1       |
| U07 | As a provider, I want a dashboard showing earnings, costs (including LLM token spend), and profit margins per capability.                              | P1       |
| U08 | As a provider, I want to customize the agent's behavior (bidding strategy, platform preferences, risk tolerance) by editing a system prompt — no code. | P1       |
| U09 | As a provider, I want to self-host the adapter with SQLite and zero external dependencies beyond my LLM API key.                                       | P0       |
| U10 | As a provider, I want to use the hosted version without managing infrastructure, wallets, or databases.                                                | P1       |
| U11 | As a provider, I want to connect my MCP server as a capability source alongside or instead of OpenAPI.                                                 | P1       |
| U12 | As a provider, I want the adapter to detect when my API spec changes and flag new/changed/stale capabilities for review.                               | P2       |
| U13 | As a provider, I want to install community-built platform drivers for platforms with complex integration flows.                                        | P2       |

## Functional Requirements

| ID  | Requirement                                                                                                                                                                                                                 | Priority |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| F01 | System shall discover capabilities from OpenAPI specs (URL or local file), parsing operations into name, input/output schemas, and execution plans.                                                                         | P0       |
| F02 | System shall discover capabilities from MCP servers via `tools/list`, registering each tool with its schema.                                                                                                                | P1       |
| F03 | System shall accept manual capability definitions via YAML config with name, description, input/output schemas.                                                                                                             | P0       |
| F04 | System shall infer capabilities from a docs URL by scraping pages with an LLM, generating endpoint definitions, and validating each with a test HTTP call. Inferred capabilities require provider review before activation. | P1       |
| F05 | Discovered capabilities shall appear as disabled with no pricing. No capability goes live without explicit provider pricing and enablement.                                                                                 | P0       |
| F06 | System shall support four pricing models: per_call (flat fee), per_item (fee × count from input field), per_token (fee by input/output size), and quoted (agent bids within floor/ceiling bounds).                          | P0       |
| F07 | System shall manage wallets via a WalletPlugin interface, with OWS (Open Wallet Standard) as the default for self-hosted mode. OWS derives addresses for multiple chains (EVM, Solana, etc.) from a single seed. Providers may also use chain-specific wallet plugins (wallet-solana, wallet-evm) or a hosted wallet plugin for managed mode. All wallet keys encrypted at rest. Providers may import existing keypairs. | P0       |
| F08 | System shall implement a payment adapter plugin interface supporting x402 (multi-chain via CAIP-2 network identifiers — Base, Solana, Arbitrum, Polygon, Ethereum, Stellar), Solana escrow, MPP/Stripe, and free (testing) rails. x402 402 responses include multiple `accepts` entries (one per chain the provider supports). Multiple adapters active simultaneously. | P0       |
| F09 | System shall track jobs through a 4-state lifecycle: pending → executing → completed / failed. Each job records capability, input/output hashes, payment status, and LLM token cost.                                        | P0       |
| F10 | System shall run an embedded LLM agent loop (optional, off by default) that uses the tool surface to discover platforms, register, bid on tasks, execute capabilities, deliver results, and manage payments.                | P1       |
| F11 | System shall expose all tool handlers via both the embedded agent (when enabled) and a REST management API, so the LLM-less mode can execute capabilities programmatically.                                                 | P0       |
| F12 | System shall operate as a reverse proxy / payment gateway in LLM-less mode: receive inbound requests, enforce pricing, resolve payment, forward to target service, track the job.                                           | P0       |
| F13 | System shall serve a local web dashboard for configuration, monitoring, pricing management, and agent observability.                                                                                                        | P1       |
| F14 | System shall persist all state in SQLite (self-hosted) or Postgres via Supabase (hosted), selected by config. The runtime code is database-agnostic via Drizzle ORM.                                                        | P0       |
| F15 | System shall support multi-tenancy in hosted mode: each provider gets isolated data scoped by provider_id, enforced by Supabase Row-Level Security.                                                                         | P1       |
| F16 | System shall encrypt secrets (API keys, tokens) at rest using AES-256-GCM with provider-managed key material.                                                                                                               | P0       |
| F17 | System shall periodically re-fetch capability source specs, detect changes via content hash, and flag new/changed/stale capabilities in the dashboard.                                                                      | P2       |
| F18 | System shall track earnings and costs (LLM tokens, transaction fees) per job, per capability, and per platform, with daily aggregation for margin analysis.                                                                 | P1       |
| F19 | System shall provide a CLI for init, start, capability management, wallet operations, agent control, metrics export, and driver management.                                                                                 | P1       |
| F20 | System shall support a plugin interface for platform drivers, tool plugins, and lifecycle extensions, loaded from config or discovered via package entry points.                                                            | P1       |

## Non-Functional Requirements

| Category    | Requirement                                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance | Reverse proxy mode shall add < 50ms latency to proxied API calls (excluding payment negotiation round-trips).                                      |
| Performance | Agent loop iteration shall complete within 60 seconds (LLM call + tool execution).                                                                 |
| Security    | Dashboard bound to 127.0.0.1 by default. Remote access requires provider-configured auth + TLS.                                                    |
| Security    | Wallet private keys encrypted at rest. Never logged, never sent off-device (self-hosted) or off-provider-context (hosted).                         |
| Security    | All secrets encrypted with AES-256-GCM. Encryption key from provider config or environment variable, never stored alongside encrypted data.        |
| Scalability | Hosted mode shall support 1000+ providers on shared compute with isolated data via Postgres RLS.                                                   |
| Reliability | Adapter shall persist credentials immediately upon receipt. API keys must survive process crashes between receipt and next restart.                |
| Reliability | Job engine shall mark failed jobs on capability execution errors. No silent failures.                                                              |
| Portability | Self-hosted mode: single process, zero external dependencies beyond Node.js, an LLM API key (if agent enabled), and the provider's target service. |
| Portability | Config via YAML file + environment variables. No required cloud services for self-hosted mode.                                                     |

## Edge Cases & Constraints

- **Target service down**: Capability execution fails, job marked as failed, agent decides whether to retry based on error.
- **Payment failure (insufficient balance)**: Agent sees shortfall amount, decides whether to abort or seek alternative funding.
- **Spec changes during active jobs**: In-flight jobs under old schema will likely fail. Adapter flags capability as "schema changed", stops accepting new work until provider reviews.
- **LLM API key missing/invalid**: Agent mode disabled, adapter operates in LLM-less proxy mode only.
- **Database corruption (self-hosted)**: Wallet is the durable identity anchor. API keys are renewable via wallet-based recovery if platform supports it.
- **Multiple adapters same wallet**: Not supported. One adapter instance = one wallet identity (OWS wallet or set of chain-specific wallet plugins) = one economic identity.
- **Rate limiting**: Agent respects platform rate limits (reads Retry-After headers, backs off). Reverse proxy mode enforces configurable rate limits on inbound requests.
- **Maximum payload size**: Configurable per capability, default 10MB.

## Milestones

| Phase | Scope                                                                                                                                                                               | Target |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| v0.1  | Core skeleton: contracts package, config loader, database abstraction (SQLite + Postgres), wallet generation, secrets/state persistence, capability registry with OpenAPI ingestion | Week 1 |
| v0.2  | Payment proxy mode: x402 + free payment adapters, reverse proxy with pricing enforcement, job engine, management REST API                                                           | Week 2 |
| v0.3  | Agent mode: embedded LLM loop, tool definitions, system prompt, agent observability                                                                                                 | Week 3 |
| v0.4  | Dashboard: overview, capabilities, agent, metrics pages. CLI commands.                                                                                                              | Week 4 |
| v0.5  | LLM-inferred capabilities: docs URL scraping, endpoint inference, validation pipeline, review UI                                                                                    | Week 5 |
| v0.6  | Hosted mode: Supabase integration, multi-tenant RLS, auth middleware, hosted wallet management                                                                                      | Week 6 |
| v1.0  | Production hardening: MCP ingestion, escrow + MPP adapters, spec drift detection, plugin/driver system, metrics export                                                              | Week 8 |
