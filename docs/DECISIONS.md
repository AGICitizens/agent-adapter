# Architecture Decisions

## ADR-001: TypeScript Rewrite from Python
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: The original prototype was built in Python for the OWS hackathon. The project is now moving to production with a hosted offering, and the team wants stronger type safety, better Solana ecosystem alignment, and a unified language across runtime and dashboard.
- **Decision**: Rewrite the entire runtime in TypeScript (Node.js, ES2022).
- **Consequences**: All Python code becomes reference-only. The contracts/runtime/plugin architecture is preserved but expressed in TypeScript interfaces. Dashboard (already React/TS) gets first-class integration. MCP tooling and Solana libraries have strong TS/JS support.
- **Alternatives considered**: Keeping Python (rejected — team prefers TS, Solana ecosystem is JS-heavy), Rust (rejected — too high a barrier for community plugin contributions), Go (rejected — weaker type system for complex interfaces, poor Solana library support).

## ADR-002: Dual Database Support (SQLite + Postgres via Drizzle)
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: Self-hosted mode needs zero-config persistence (SQLite). Hosted mode needs multi-tenant isolation with auth (Postgres via Supabase). The original PRD specified SQLite only.
- **Decision**: Use Drizzle ORM as a dialect-agnostic query layer. Define schema once (with dialect-specific column helpers where needed). `createDb(config)` factory returns the right driver. Runtime code never writes raw SQL.
- **Consequences**: Schema must avoid Postgres-only features (array columns, NOTIFY/LISTEN) in shared code. Some column types differ (TEXT timestamps in SQLite vs native TIMESTAMP in Postgres). Drizzle handles this. RLS policies are Postgres-only and defined separately. Both paths must be tested.
- **Alternatives considered**: Postgres-only (rejected — violates self-hosted zero-config goal), Prisma (rejected — heavier, worse SQLite support, code generation step), Kysely (viable but Drizzle has better dual-dialect support and growing ecosystem).

## ADR-003: ProviderContext on Every Operation (Multi-Tenancy from Day 1)
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: Hosted mode requires data isolation between providers. Retrofitting multi-tenancy is painful and error-prone.
- **Decision**: Every database table has a `providerId` column. Every core function accepts `ProviderContext`. Self-hosted mode uses `{ providerId: "default" }` as a constant. Hosted mode resolves it from the Supabase JWT.
- **Consequences**: Slightly more verbose function signatures. But multi-tenancy works from day one without any architectural changes when hosted mode ships. Postgres RLS acts as defense-in-depth on top of application-level scoping.
- **Alternatives considered**: Schema-per-tenant in Postgres (rejected — operational complexity at scale), separate databases per tenant (rejected — expensive, hard to manage), retrofit later (rejected — learned from industry experience that this is always harder than doing it upfront).

## ADR-004: LLM Loop as Optional Layer
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: The original PRD assumed the LLM agent was always running. Many providers just want a payment proxy — they don't need autonomous bidding or platform navigation.
- **Decision**: The LLM agent is in a separate package (`@agent-adapter/agent`) and is off by default. Without it, the adapter operates as a payment-aware reverse proxy. The core tool handlers are shared — both the agent and the server API call the same execution engine.
- **Consequences**: Two clear operating modes: proxy mode (LLM-less, lower cost, simpler) and agent mode (autonomous, higher cost, more capable). The tool handler interface must be clean enough to serve both callers. Agent package is an optional dependency.
- **Alternatives considered**: Always-on agent with a "passive" mode (rejected — still consumes LLM tokens for the loop even if idle), separate products (rejected — too much code duplication, same core capabilities).

## ADR-005: Five-Package Monorepo Structure
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: Need clear separation between types (contracts), runtime logic (core), LLM logic (agent), HTTP serving (server), and CLI tooling.
- **Decision**: Five packages: `@agent-adapter/contracts` (types, zero deps), `@agent-adapter/core` (runtime, registry, jobs, tools), `@agent-adapter/agent` (LLM loop, optional), `@agent-adapter/server` (HTTP API, dashboard, proxy), `@agent-adapter/cli` (CLI wrapper).
- **Consequences**: Clear dependency graph (contracts → core → agent/server → cli). Plugins depend only on contracts. Turborepo manages the build order. Each package is independently publishable to npm.
- **Alternatives considered**: Monolith (rejected — can't make agent optional, can't publish contracts separately for plugin authors), three packages (contracts + runtime + cli, rejected — runtime becomes too large, agent can't be optional).

## ADR-006: LLM-Inferred Capabilities as a First-Class Source
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: Most competitors require a clean OpenAPI spec. Many APIs don't have one but do have documentation pages. "Give us your docs URL and we'll figure it out" is a significant onboarding advantage and potential moat.
- **Decision**: Add "inferred" as a fourth capability source type alongside openapi/mcp/manual. The inference pipeline: scrape docs URL → LLM generates endpoint definitions → validate each with test HTTP calls → self-correct on errors → present for provider review. Inferred capabilities require explicit approval before activation.
- **Consequences**: Unreliable by nature (LLM hallucination). Mitigated by: validation with actual HTTP calls, self-correction loop, mandatory provider review, confidence scoring. The review step is critical — no inferred capability auto-activates. Dashboard must clearly distinguish inferred-and-unreviewed from confirmed capabilities.
- **Alternatives considered**: Only support OpenAPI (rejected — too limiting, misses the moat opportunity), auto-activate inferred capabilities (rejected — too risky, providers must review).

## ADR-007: Hosted Wallet Management (Pragmatic Custody)
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: Users of the hosted version shouldn't need to manage their own wallet, passphrase, or key material. But we also want to minimize custodial risk and avoid paid KMS services.
- **Decision**: In hosted mode, keypairs are generated server-side and encrypted at rest with a server-managed key (environment variable). This is effectively custodial. We are transparent about it. For providers who want full self-custody, they use the OSS self-hosted version. A future enhancement adds a "settlement address" feature where earnings are periodically swept to a provider-controlled external wallet, limiting custodial exposure to the hot wallet balance.
- **Consequences**: Hosted mode has custodial risk. Mitigated by: encryption at rest, key rotation support, settlement sweeps (future), and clear documentation that self-hosted = self-custodial. No paid KMS dependency.
- **Alternatives considered**: Provider-held passphrase via HKDF (rejected — Supabase Auth uses OAuth/magic links, no password to derive from), non-custodial with delegated signing (rejected — too complex for v1, requires provider to run a signer), hardware wallet integration (rejected — incompatible with hosted model).

## ADR-008: Hono as HTTP Framework
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: Need a lightweight HTTP framework for the management API, reverse proxy, and dashboard serving. Must work in Node.js with standard middleware patterns.
- **Decision**: Use Hono. It's lightweight, has a clean middleware API, supports all needed patterns (routing, middleware, static serving, WebSocket for future SSE), and works in Node.js, Bun, and edge runtimes.
- **Consequences**: Smaller community than Express, but growing fast. API is stable. Middleware ecosystem is sufficient (CORS, auth, compression). Built-in test client simplifies integration testing.
- **Alternatives considered**: Express (rejected — legacy patterns, poor TypeScript support), Fastify (viable but heavier than needed), tRPC (rejected — we need REST for the management API and proxy, not RPC).

## ADR-009: Reverse Proxy as the LLM-Less Mode
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: The LLM-less mode needed a concrete product shape. Just exposing tool handlers via REST isn't enough — there's no clear user-facing value without the agent.
- **Decision**: LLM-less mode is a reverse proxy / payment gateway. The adapter sits in front of the provider's API, handles payment negotiation (x402 402 responses, escrow verification, MPP), and only forwards the request to the target service once payment is secured. This is the same execution path as agent mode, minus the autonomous platform navigation.
- **Consequences**: The adapter has a clear value proposition even without the LLM: "Put this in front of your API and agents can pay you." The proxy must be low-latency (< 50ms overhead) since it's in the hot path of every request. Path mapping from proxy routes to capabilities must be configurable.
- **Alternatives considered**: SDK-only mode where the provider calls execute() programmatically (still supported via the capability execution API, but the proxy is the primary LLM-less experience), webhook mode where the adapter receives callbacks (too passive, doesn't solve the payment negotiation problem).

## ADR-010: Multi-Chain Wallet Architecture via WalletRegistry
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: x402 V2 is multi-chain by default, using CAIP-2 network identifiers (e.g. `eip155:8453` for Base, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` for Solana mainnet). It's live on Base, Solana, Stellar, Arbitrum, Polygon, and Ethereum mainnet. Solana and EVM wallets use fundamentally different cryptographic systems (Ed25519 vs secp256k1) — no single keypair works on both. The original PRD scoped v1 to Solana-only, but the x402 ecosystem has moved to multi-chain, and limiting to one chain reduces the adapter's addressable market.
- **Decision**: Replace the single-wallet model with a WalletRegistry that holds one WalletPlugin per chain family. The WalletPlugin interface gains an optional `chain` parameter on sign operations. The payment adapter resolves the correct wallet via `walletRegistry.get(chain)` based on the payment challenge's CAIP-2 network identifier. The x402 402 response includes multiple `accepts` entries (one per configured chain). For v1, ship `wallet-ows` (multi-chain default) and `wallet-solana` (fallback). Add `wallet-evm` in Phase 7.
- **Consequences**: The adapter can accept payment on any chain the provider configures, without architectural changes. Providers configure which chains they want to accept. The WalletRegistry is a thin routing layer — complexity lives in the wallet plugins. The payment-x402 plugin uses `@x402/evm` and `@x402/svm` (separate packages with separate signing logic, unified by `@x402/core`), matching how the x402 SDK itself is structured.
- **Alternatives considered**: Single wallet per chain with manual config switching (rejected — poor UX, can't accept multiple chains simultaneously), multi-chain wallet service like Crossmint (rejected — paid dependency, contradicts self-hosted zero-cost constraint), Solana-only for v1 with multi-chain later (rejected — architecture should support multi-chain from day one even if only Solana ships initially; WalletRegistry is additive).

## ADR-011: Open Wallet Standard (OWS) as Default Self-Hosted Wallet
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: The WalletRegistry needs wallet plugins per chain. Building and maintaining separate wallet plugins for each chain (key derivation, signing, address encoding) is significant work. Open Wallet Standard (OWS) launched recently with backing from PayPal, Ripple, Circle, Solana Foundation, and TON Foundation. It provides: one seed phrase deriving addresses across EVM, Solana, Bitcoin, Cosmos, Tron, TON, and more (all using CAIP-2 chain identifiers); AES-256-GCM encrypted keys at rest with protected memory; a pre-signing policy engine (chain allowlists, spending limits, expiry); and a clean Node.js SDK (`@open-wallet-standard/core`) with a simple API: `signMessage(wallet, chain, msg)`.
- **Decision**: Make OWS the default wallet plugin for self-hosted mode (`wallet-ows`). The plugin wraps OWS's API to conform to the WalletPlugin interface, routing by chain based on payment context. Keep chain-specific plugins (`wallet-solana`, `wallet-evm`) as fallbacks for providers who don't want OWS. Use `wallet-hosted` for hosted mode (OWS is local-first, wallets live in `~/.ows/`, not suitable for server-managed keys).
- **Consequences**: Self-hosted providers get multi-chain wallet support with zero extra configuration — one OWS wallet gives one address per chain. The policy engine provides free infrastructure for spending limits and chain restrictions. However, OWS is very new (launched ~2 weeks ago) — APIs might shift. Mitigated by: the WalletPlugin abstraction means OWS is swappable with one config line, and the fallback plugins (`wallet-solana`) have no OWS dependency. OWS is software-only (keys decrypted in-process), which is fine for self-hosted but not for hosted mode. The `wallet-ows` plugin is thin — it adapts OWS's signing API to WalletPlugin's interface.
- **Alternatives considered**: Build custom multi-chain key derivation (rejected — reinventing what OWS already does, significant crypto engineering), OWS as the only wallet option (rejected — too risky given OWS's newness, providers need a fallback), skip OWS and ship chain-specific plugins only (rejected — OWS eliminates the need to manage separate keypairs per chain and provides the policy engine for free).

## ADR-012: Turborepo for Build Orchestration (originally ADR-010)
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: Monorepo with 5 packages needs build orchestration that respects the dependency graph.
- **Decision**: Use Turborepo with pnpm workspaces. `turbo build` builds packages in dependency order (contracts → core → agent/server → cli). Caching speeds up rebuilds. pnpm's `workspace:*` protocol for inter-package dependencies.
- **Consequences**: Requires `turbo.json` config and `pnpm-workspace.yaml`. Build artifacts in `dist/` per package. Dev mode uses `tsc --watch` per package.
- **Alternatives considered**: Nx (rejected — heavier, more opinionated), plain pnpm workspaces with manual build order (rejected — error-prone as package count grows), Lerna (rejected — effectively dead, Turborepo is the successor), npm workspaces (rejected — pnpm is faster, stricter dependency resolution, better disk efficiency).

## ADR-013: Two-Layer Configuration (YAML + DB)
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: Config is loaded from YAML at startup (Task 1.1), but users will need to change settings at runtime via the dashboard/CLI without restarting — especially in hosted mode where there's no YAML file at all.
- **Decision**: Configuration is split into two layers. **Startup config (YAML)** covers infrastructure wiring: database connection, wallet plugin, server host/port, LLM provider/key, mode. It is read once at boot and never mutated by the application. **Runtime config (DB)** covers business settings: capability pricing, enable/disable flags, agent prompt tweaks, payment adapter tuning. These are read/written at any time via dashboard, CLI, or management API without restart. YAML values seed the initial DB state on first boot. DB values override YAML defaults at runtime. In hosted mode, there is no YAML — everything comes from the DB, seeded during provider onboarding (Phase 6).
- **Consequences**: The YAML file is a deployment artifact (like docker-compose.yaml) — operators edit it, the app never writes to it. No config drift, no merge conflicts, no container permission issues. Runtime settings need a `settings` table in the DB (part of Task 1.4 state store or 1.8 createRuntime). The `loadConfig()` function stays simple (read → parse → validate). A future `loadConfigFromDb()` or branching in `createRuntime()` handles hosted mode.
- **Alternatives considered**: App writes back to YAML on changes (rejected — causes drift, merge conflicts, permission issues in containers), YAML-only with restart required for all changes (rejected — unacceptable UX for pricing/capability changes), DB-only even for self-hosted (rejected — YAML is ergonomic for initial setup and version-controllable).

## ADR-014: Tiered Plugin Persistence (No Raw DB Access for Plugins)
- **Date**: 2026-04-07
- **Status**: Accepted
- **Context**: Plugins need persistence beyond flat key-value (pagination, batch writes, deletion), but exposing raw database access breaks every guarantee the runtime provides: provider scoping, encryption of secrets, audit logging, schema migration control.
- **Decision**: Three tiers. **Tier 1 (existing):** `getState`, `setState`, plus `SecretsBackend` methods — covers 90% of plugin needs. **Tier 2 (new):** `stateQuery` (pagination, ordering, prefix filtering), `stateDelete`, and `stateBatchSet` on RuntimeAPI — covers real-world use cases like "get the 20 most recent cached tasks" or "clear stale entries" without exposing SQL. **Tier 3 (core-only, never exposed):** Drizzle schema, raw DB connection, migration logic. Plugins never import from `@agent-adapter/core/db`. All state methods are scoped by `providerId` automatically. If a plugin's storage needs outgrow Tier 2, that's a signal it should be a core module, not a plugin.
- **Consequences**: Plugins get a richer persistence API without any database coupling. The state table acts as a plugin's "private schema" — they pick a namespace (e.g. `"drv_agic:task_cache"`) and get an isolated, provider-scoped JSON key-value store with querying. Core retains full control over schema evolution and migration. No breaking changes to existing `getState`/`setState` consumers.
- **Alternatives considered**: Expose raw SQL or Drizzle query builder to plugins (rejected — breaks provider scoping, audit logging, and migration control), keep flat key-value only (rejected — forces plugins to implement their own pagination and batch logic over individual get/set calls, leading to N+1 query patterns), per-plugin SQLite databases (rejected — operational complexity, no cross-plugin querying if ever needed, harder to back up).
