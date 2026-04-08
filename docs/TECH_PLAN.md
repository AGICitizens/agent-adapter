# Technical Plan: Agent Adapter Runtime

## Stack

| Layer            | Choice                                  | Reason                                                                               |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| Language         | TypeScript (strict mode)                | Solana ecosystem alignment, MCP tooling compat, type safety across packages          |
| Runtime          | Node.js (ES2022)                        | Async-first, broad library ecosystem, single-process model                           |
| Build            | Turborepo + pnpm workspaces + tsc       | Monorepo with incremental builds, no bundler complexity for backend packages         |
| DB (self-hosted) | SQLite via better-sqlite3 + Drizzle ORM | Zero-config, single-file, self-hostable                                              |
| DB (hosted)      | PostgreSQL via Supabase + Drizzle ORM   | Multi-tenant RLS, managed auth, same Drizzle schema                                  |
| ORM              | Drizzle ORM                             | Dialect-agnostic query builder, supports both SQLite and Postgres from shared schema |
| Auth (hosted)    | Supabase Auth                           | JWT-based, RLS integration, free tier sufficient                                     |
| HTTP framework   | Hono                                    | Lightweight, middleware-friendly, works in Node/edge/Bun                             |
| LLM client       | OpenAI-compatible SDK (openai npm)      | Works with Anthropic, OpenAI, OpenRouter via base_url swap                           |
| Wallet (default) | @open-wallet-standard/core (OWS)        | Multi-chain wallet from single seed (EVM, Solana, etc.), hardened key management      |
| Solana           | @solana/web3.js + tweetnacl             | Fallback Solana-only wallet plugin, standard Solana libraries                        |
| EVM              | viem                                    | EVM wallet plugin for Base, Arbitrum, Polygon, Ethereum (Phase 7)                    |
| x402             | @x402/core + @x402/evm + @x402/svm     | Multi-chain x402 V2 payment protocol with CAIP-2 network identifiers                |
| Encryption       | @noble/ciphers (AES-256-GCM)            | Audited, pure JS, no native bindings                                                 |
| CLI              | Commander.js                            | Standard Node CLI framework                                                          |
| Dashboard        | React + Vite (embedded SPA)             | Served by the Hono server, no separate process                                       |
| Config           | YAML (yaml npm)                         | Human-readable, provider-editable                                                    |
| Testing          | Vitest                                  | Fast, TypeScript-native, workspace-aware                                             |

## Package Structure

```
agent-adapter/
├── packages/
│   ├── contracts/        → @agent-adapter/contracts
│   │   └── src/          Types, interfaces, enums. Zero runtime deps.
│   │
│   ├── core/             → @agent-adapter/core
│   │   └── src/
│   │       ├── db/           Drizzle schema, SQLite + Postgres adapters, migrations
│   │       ├── capabilities/ Registry, OpenAPI parser, MCP fetcher, manual loader, LLM inference
│   │       ├── payments/     Payment registry, adapter loading
│   │       ├── jobs/         Job engine (4-state lifecycle)
│   │       ├── store/        Secrets store, state store, encryption
│   │       ├── wallet/       Wallet generation, import, persistence
│   │       ├── tools/        Tool handler dispatch (shared by agent + server)
│   │       ├── proxy/        Reverse proxy / payment gateway for LLM-less mode
│   │       ├── config/       YAML loader, env resolution, validation
│   │       └── index.ts      RuntimeContext factory
│   │
│   ├── agent/            → @agent-adapter/agent
│   │   └── src/
│   │       ├── loop.ts       LLM conversation loop (plan → tools → observe → repeat)
│   │       ├── prompt.ts     Default system prompt + provider prompt merging
│   │       ├── tools.ts      Tool definitions as Zod schemas for OpenAI function calling
│   │       └── index.ts      AgentLoop factory
│   │
│   ├── server/           → @agent-adapter/server
│   │   └── src/
│   │       ├── api/          Management REST API routes (Hono)
│   │       ├── proxy/        Reverse proxy middleware (inbound request → payment → forward)
│   │       ├── auth/         Auth middleware (no-op self-hosted, Supabase JWT hosted)
│   │       ├── dashboard/    Static SPA serving
│   │       └── index.ts      Server factory
│   │
│   └── cli/              → @agent-adapter/cli
│       └── src/
│           ├── commands/     init, start, capabilities, wallet, agent, metrics, drivers
│           └── index.ts      CLI entry point
│
├── plugins/              Community / bundled plugins (separate packages)
│   ├── payment-free/
│   ├── payment-x402/
│   ├── payment-escrow/
│   ├── payment-mpp/
│   ├── wallet-ows/          Default self-hosted wallet (OWS, multi-chain from single seed)
│   ├── wallet-solana/       Fallback Solana-only wallet (no OWS dependency)
│   ├── wallet-evm/          EVM-only wallet via viem (Phase 7)
│   ├── wallet-hosted/       Hosted mode server-managed encrypted keypairs
│   └── webhook-notifier/
│
├── dashboard-ui/         React SPA (built separately, output embedded in server)
│   └── src/
│
└── docs/
    ├── PRD.md
    ├── TECH_PLAN.md
    ├── ARCHITECTURE.md
    ├── AI_USAGE.md
    ├── ACCEPTANCE.md
    └── DECISIONS.md
```

## Module Breakdown

| Module              | Owns                                                                                 | Does NOT own                                                                  |
| ------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `contracts`         | All interfaces, types, enums shared across packages                                  | No runtime behavior, no dependencies                                          |
| `core/db`           | Drizzle schema definition, dialect-specific adapters, connection factory, migrations | Does not decide which DB to use (config decides)                              |
| `core/capabilities` | Capability discovery from all sources, registry CRUD, spec change detection          | Does not set pricing (provider does via dashboard/CLI)                        |
| `core/payments`     | Payment adapter registry, challenge resolution, adapter loading                      | Does not implement specific payment protocols (plugins do)                    |
| `core/jobs`         | Job lifecycle (pending→executing→completed/failed), payment status linking           | Does not handle platform task lifecycles (agent does)                         |
| `core/store`        | Encrypted secrets, key-value state, encryption backends                              | Does not manage wallet keys (wallet module does)                              |
| `core/wallet`       | WalletRegistry: loads wallet plugins, resolves wallet by chain. OWS default (multi-chain), fallback chain-specific plugins, hosted plugin for managed mode. Encrypted persistence. | Does not sign payment transactions (payment adapters do via wallet interface) |
| `core/tools`        | Tool handler dispatch, capability execution, HTTP client                             | Does not decide which tools to call (agent or server does)                    |
| `core/proxy`        | Inbound request handling, pricing enforcement, payment resolution, forwarding        | Does not manage outbound platform interactions (agent does)                   |
| `core/config`       | YAML parsing, env var resolution, config validation                                  | Does not persist config changes (config file is source of truth)              |
| `agent`             | LLM conversation loop, system prompt, tool schema definitions                        | Does not execute tools directly (calls core/tools handlers)                   |
| `server`            | HTTP API routes, auth middleware, dashboard serving, reverse proxy endpoint          | Does not contain business logic (delegates to core)                           |
| `cli`               | Interactive setup, command parsing, terminal output                                  | Does not contain business logic (delegates to core/server)                    |

## Data Models

All tables include `provider_id TEXT NOT NULL` for multi-tenancy. In self-hosted mode, this is a constant (`"default"`). In hosted mode, it comes from the authenticated JWT and is enforced by Postgres RLS.

```ts
// capability_config — provider's pricing overlay on discovered capabilities
{
  providerId: string;
  name: string; // PK (with providerId)
  enabled: boolean; // default false
  pricingAmount: number | null;
  pricingCurrency: string | null;
  pricingModel: "per_call" | "per_item" | "per_token" | "quoted" | null;
  pricingItemField: string | null;
  pricingFloor: number | null;
  pricingCeiling: number | null;
  customDescription: string | null;
  sourceHash: string | null;
  updatedAt: string;
}

// jobs — one unit of economic work
{
  providerId: string;
  id: string; // PK
  capability: string;
  platform: string;
  platformRef: string;
  status: "pending" | "executing" | "completed" | "failed";
  inputHash: string | null;
  outputHash: string | null;
  paymentProtocol: string | null;
  paymentStatus: string | null;
  paymentAmount: number | null;
  paymentCurrency: string | null;
  llmInputTokens: number | null;
  llmOutputTokens: number | null;
  llmEstimatedCost: number | null;
  createdAt: string;
  completedAt: string | null;
}

// secrets — encrypted credentials scoped by platform
{
  providerId: string;
  platform: string; // PK (with providerId + key)
  key: string;
  encryptedValue: Uint8Array;
  createdAt: string;
  updatedAt: string;
}

// state — general-purpose JSON key-value
{
  providerId: string;
  namespace: string; // PK (with providerId + key)
  key: string;
  data: string; // JSON
  createdAt: string;
  updatedAt: string;
}

// wallet — encrypted keypair(s), one row per chain
{
  providerId: string;
  chain: string; // "solana" | "evm" | "ows" (multi-chain) — PK (with providerId)
  publicKey: string; // chain-specific address
  encryptedPrivateKey: Uint8Array; // for OWS: encrypted seed; for chain-specific: encrypted keypair
  createdAt: string;
}

// decision_log — agent decision observability
{
  providerId: string;
  id: number; // autoincrement
  action: string;
  platform: string;
  detail: string; // JSON
  createdAt: string;
}

// llm_usage — token consumption tracking
{
  providerId: string;
  id: number; // autoincrement
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  currency: string;
  createdAt: string;
}

// platforms — registered platform tracking
{
  providerId: string;
  baseUrl: string; // PK (with providerId)
  platformName: string | null;
  agentId: string | null;
  registrationStatus: string | null;
  registeredAt: string | null;
  lastActiveAt: string | null;
  metadata: string | null; // JSON
}

// inbound_events — SSE/webhook event queue
{
  providerId: string;
  id: number; // autoincrement
  sourceType: string;
  source: string;
  channel: string;
  eventType: string;
  payload: string;
  headers: string; // JSON
  receivedAt: string;
  deliveredAt: string | null;
}
```

## API Design

### Management API (served by @agent-adapter/server)

| Method | Endpoint                           | Auth                  | Description                                |
| ------ | ---------------------------------- | --------------------- | ------------------------------------------ |
| GET    | /manage/status                     | Self: no, Hosted: JWT | Adapter status (same as status\_\_whoami)  |
| GET    | /manage/capabilities               | Self: no, Hosted: JWT | List all capabilities with pricing         |
| PUT    | /manage/capabilities/:name/pricing | Self: no, Hosted: JWT | Set pricing for a capability               |
| PUT    | /manage/capabilities/:name/toggle  | Self: no, Hosted: JWT | Enable/disable a capability                |
| POST   | /manage/capabilities/refresh       | Self: no, Hosted: JWT | Re-fetch specs and update registry         |
| POST   | /manage/capabilities/infer         | Self: no, Hosted: JWT | Infer capabilities from a docs URL         |
| GET    | /manage/platforms                  | Self: no, Hosted: JWT | List registered platforms                  |
| GET    | /manage/jobs                       | Self: no, Hosted: JWT | List jobs with filters                     |
| GET    | /manage/jobs/:id                   | Self: no, Hosted: JWT | Job detail                                 |
| GET    | /manage/wallet                     | Self: no, Hosted: JWT | Wallet address and balances                |
| GET    | /manage/agent/status               | Self: no, Hosted: JWT | Agent loop status                          |
| GET    | /manage/agent/decisions            | Self: no, Hosted: JWT | Recent agent decisions                     |
| GET    | /manage/agent/prompt               | Self: no, Hosted: JWT | Current system prompt                      |
| PUT    | /manage/agent/prompt               | Self: no, Hosted: JWT | Update custom prompt                       |
| POST   | /manage/agent/pause                | Self: no, Hosted: JWT | Pause agent loop                           |
| POST   | /manage/agent/resume               | Self: no, Hosted: JWT | Resume agent loop                          |
| GET    | /manage/metrics                    | Self: no, Hosted: JWT | Earnings, costs, margins                   |
| GET    | /manage/config                     | Self: no, Hosted: JWT | Current config (sensitive values redacted) |

### Reverse Proxy Endpoint (LLM-less payment gateway mode)

| Method | Endpoint  | Auth                      | Description                                                                                |
| ------ | --------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| ANY    | /proxy/\* | Payment (x402/escrow/MPP) | Inbound request → pricing check → payment resolution → forward to target → return response |

### Capability Execution API (programmatic access for LLM-less mode)

| Method | Endpoint                           | Auth               | Description                                       |
| ------ | ---------------------------------- | ------------------ | ------------------------------------------------- |
| POST   | /api/v1/capabilities/:name/execute | Payment or API key | Execute a specific capability with provided input |

## Implementation Phases

### Phase 1 — Foundation (v0.1)

Maps to: F01, F03, F05, F07, F14, F16

- [x] Contracts package: all interfaces and types
- [x] Core config loader: YAML parsing, env var resolution, validation with Zod
- [x] Database abstraction: Drizzle schema, SQLite adapter, Postgres adapter, `createDb()` factory
- [ ] Wallet module: WalletRegistry implementation, wallet-ows plugin (default, multi-chain via OWS), wallet-solana plugin (fallback, Solana-only via tweetnacl), import support, AES-256-GCM encrypted persistence
- [x] Secrets store: encrypted credential storage with provider-scoped keys
- [x] State store: JSON key-value persistence
- [x] Capability registry: in-memory registry, OpenAPI spec parser, manual definition loader, MCP fetcher
- [x] Spec change detection: content hash comparison, new/changed/stale flagging

### Phase 2 — Payment Proxy (v0.2)

Maps to: F06, F08, F09, F11, F12

- [ ] Payment adapter interface: registry, challenge resolution, adapter loading
- [ ] payment-free plugin: no-op adapter for testing
- [ ] payment-x402 plugin: multi-chain 402 response parsing (CAIP-2 network IDs), multiple `accepts` entries per chain, payment signing via WalletRegistry chain resolution (@x402/evm + @x402/svm), retry with proof header
- [ ] Job engine: 4-state lifecycle, payment status linking, LLM token tracking
- [ ] Tool handlers: capability execution, HTTP client, wallet ops, secrets/state ops
- [ ] Management REST API (Hono): all /manage/\* endpoints
- [ ] Reverse proxy mode: inbound request handling, pricing enforcement, payment resolution, target forwarding
- [ ] Capability execution API: POST /api/v1/capabilities/:name/execute

### Phase 3 — Agent Mode (v0.3)

Maps to: F10

- [ ] Tool definitions: all agent tools as Zod schemas for OpenAI function calling format
- [ ] Default system prompt: comprehensive instructions for autonomous economic operation
- [ ] Provider prompt merging: append/replace modes, prompt file loading
- [ ] Agent loop: LLM conversation loop with tool dispatch, usage recording
- [ ] Completion guard: prevent agent from stopping while jobs are pending
- [ ] Agent observability: decision log, tool call history

### Phase 4 — Dashboard & CLI (v0.4)

Maps to: F13, F19

- [ ] Dashboard SPA: React + Vite, embedded in server
- [ ] Dashboard pages: Overview, Capabilities (pricing editor), Agent, Metrics, Wallet, Settings
- [ ] CLI: init (interactive setup), start, capabilities list/price/enable/disable/refresh, wallet address/balance/import, agent pause/resume/decisions, metrics summary/export

### Phase 5 — LLM-Inferred Capabilities (v0.5)

Maps to: F04

- [ ] Docs scraper: fetch and parse documentation pages from URL
- [ ] LLM inference pipeline: generate endpoint definitions from scraped content
- [ ] Validation pipeline: test each inferred endpoint with actual HTTP calls
- [ ] Self-correction loop: feed errors back to LLM for re-inference (up to N attempts)
- [ ] Review UI: dashboard page showing inferred capabilities with confidence, source text, test results
- [ ] "inferred" source type in capability registry

### Phase 6 — Hosted Mode (v0.6)

Maps to: F15

- [ ] Supabase integration: Postgres connection via Drizzle, auth middleware
- [ ] Multi-tenant RLS: provider_id scoping on all tables, RLS policies
- [ ] Auth middleware: Supabase JWT validation, provider context injection
- [ ] Hosted wallet management: wallet-hosted plugin with server-managed encrypted keypairs per chain, envelope encryption (OWS not applicable — it's local-first)
- [ ] Provider onboarding flow: signup → wallet provisioning → capability setup

### Phase 7 — Production (v1.0)

Maps to: F02, F17, F18, F20

- [ ] MCP capability source: connect to MCP server, tools/list, register capabilities
- [ ] wallet-evm plugin: EVM-only wallet via viem for providers who want EVM without OWS
- [ ] payment-escrow plugin: Solana escrow prepare/sign/submit/check
- [ ] payment-mpp plugin: Stripe-backed payment sessions
- [ ] Spec drift detection: periodic re-fetch, hash comparison, dashboard alerts
- [ ] Metrics aggregation: daily revenue/cost/margin per capability per platform
- [ ] Plugin/driver system: package entry point discovery, CLI install/remove
- [ ] Extension system: lifecycle hooks, event emission
