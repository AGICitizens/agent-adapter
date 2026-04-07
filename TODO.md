# Implementation Roadmap

Tasks ordered for incremental development — each builds on what came before.

## Phase 1 — Foundation (v0.1)

- [x] 1.1 — Config loader: YAML parsing, env var resolution (`${VAR}`), Zod validation
- [x] 1.2 — Database abstraction: Drizzle schema, SQLite adapter, Postgres adapter, `createDb()` factory
- [ ] 1.3 — Secrets store: AES-256-GCM encrypted credential storage, provider-scoped keys
- [ ] 1.4 — State store: JSON key-value persistence
- [ ] 1.5 — Wallet module: WalletRegistry, wallet-solana plugin, encrypted persistence
- [ ] 1.6 — Capability registry: in-memory registry, OpenAPI parser, manual definition loader
- [ ] 1.7 — Spec change detection: content hash comparison, new/changed/stale flagging
- [ ] 1.8 — `createRuntime()` factory: wire config → DB → secrets → state → wallet → capabilities

## Phase 2 — Payment Proxy (v0.2)

- [ ] 2.1 — Job engine: 4-state lifecycle (pending → executing → completed/failed), payment status linking
- [ ] 2.2 — Payment registry: adapter loading, challenge resolution by type
- [ ] 2.3 — payment-free plugin: no-op adapter for testing
- [ ] 2.4 — Tool handlers: capability execution, HTTP client, wallet/secrets/state ops
- [ ] 2.5 — Reverse proxy mode: inbound request handling, pricing enforcement, payment resolution, target forwarding
- [ ] 2.6 — Management REST API: all `/manage/*` endpoints (Hono)
- [ ] 2.7 — Capability execution API: `POST /api/v1/capabilities/:name/execute`
- [ ] 2.8 — payment-x402 plugin: multi-chain 402 parsing (CAIP-2), WalletRegistry signing, retry with proof

## Phase 3 — Agent Mode (v0.3)

- [ ] 3.1 — Tool definitions: Zod schemas → OpenAI function calling format
- [ ] 3.2 — System prompt: default prompt + provider prompt merging (append/replace)
- [ ] 3.3 — Agent loop: LLM conversation loop, tool dispatch, token usage recording
- [ ] 3.4 — Completion guard: prevent agent from stopping while jobs are pending
- [ ] 3.5 — Agent observability: decision log, tool call history

## Phase 4 — Dashboard & CLI (v0.4)

- [ ] 4.1 — CLI: init (interactive setup), start, capabilities list/price/enable/disable/refresh
- [ ] 4.2 — CLI: wallet address/balance/import, agent pause/resume/decisions, metrics summary/export
- [ ] 4.3 — Dashboard SPA: React + Vite scaffold, embedded in server
- [ ] 4.4 — Dashboard pages: Overview, Capabilities (pricing editor), Agent, Metrics, Wallet, Settings

## Phase 5 — LLM-Inferred Capabilities (v0.5)

- [ ] 5.1 — Docs scraper: fetch and parse documentation pages from URL
- [ ] 5.2 — LLM inference pipeline: generate endpoint definitions from scraped content
- [ ] 5.3 — Validation + self-correction: test inferred endpoints with HTTP calls, re-infer on errors
- [ ] 5.4 — Review UI: inferred capabilities with confidence scores, approve/reject flow
- [ ] 5.5 — "inferred" source type in capability registry

## Phase 6 — Hosted Mode (v0.6)

- [ ] 6.1 — Supabase integration: Postgres connection via Drizzle, auth middleware
- [ ] 6.2 — Multi-tenant RLS: provider_id scoping on all tables, RLS policies
- [ ] 6.3 — Auth middleware: Supabase JWT validation, provider context injection
- [ ] 6.4 — Hosted wallet: wallet-hosted plugin, server-managed encrypted keypairs, envelope encryption
- [ ] 6.5 — Provider onboarding flow: signup → wallet provisioning → capability setup

## Phase 7 — Production (v1.0)

- [ ] 7.1 — MCP capability source: connect to MCP server, `tools/list`, register capabilities
- [ ] 7.2 — wallet-ows plugin: OWS multi-chain default for self-hosted (single seed → EVM + Solana + more)
- [ ] 7.3 — wallet-evm plugin: EVM-only wallet via viem
- [ ] 7.4 — payment-escrow plugin: Solana escrow prepare/sign/submit/check
- [ ] 7.5 — payment-mpp plugin: Stripe-backed payment sessions
- [ ] 7.6 — Spec drift detection: periodic re-fetch, hash comparison, dashboard alerts
- [ ] 7.7 — Metrics aggregation: daily revenue/cost/margin per capability per platform
- [ ] 7.8 — Plugin/driver system: package entry point discovery, CLI install/remove
- [ ] 7.9 — Extension system: lifecycle hooks, event emission
