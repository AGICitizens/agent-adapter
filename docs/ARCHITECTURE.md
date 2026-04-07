# Architecture: Agent Adapter Runtime

## High-Level Diagram

```
                    ┌─────────────────────────────────────────────────┐
                    │              @agent-adapter/server               │
                    │                                                  │
  Inbound agents ──▶│  /proxy/*  (reverse proxy / payment gateway)    │
                    │  /api/v1/* (capability execution API)           │
  Provider      ──▶│  /manage/* (management API)                     │
                    │  /dash/*   (dashboard SPA)                      │
                    └────────────────┬────────────────────────────────┘
                                     │ delegates to
                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        @agent-adapter/core                           │
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌───────────┐  ┌───────────┐      │
│  │ Capability  │  │  Payment   │  │   Job     │  │   Tool    │      │
│  │ Registry    │  │  Registry  │  │  Engine   │  │  Handlers │      │
│  └────────────┘  └────────────┘  └───────────┘  └───────────┘      │
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌───────────┐  ┌───────────┐      │
│  │  Wallet     │  │  Secrets   │  │   State   │  │  Config   │      │
│  │  Module     │  │  Store     │  │   Store   │  │  Loader   │      │
│  └────────────┘  └────────────┘  └───────────┘  └───────────┘      │
│                                                                      │
│  ┌────────────┐  ┌────────────────────────────────────────────┐     │
│  │  Proxy      │  │              Database Layer                │     │
│  │  Engine     │  │  Drizzle ORM → SQLite | Postgres           │     │
│  └────────────┘  └────────────────────────────────────────────┘     │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ tool calls
                             │
┌────────────────────────────┴─────────────────────────────────────────┐
│                     @agent-adapter/agent (optional)                   │
│                                                                       │
│  LLM Loop: plan → call core/tools → observe → repeat                │
│  System prompt + provider prompt overlay                              │
│  Tool definitions (Zod → OpenAI function calling format)             │
└──────────────────────────────────────────────────────────────────────┘
                             │
                             ▼ capability execution (HTTP / MCP)
┌──────────────────────────────────────────────────────────────────────┐
│              Target Service (Provider's API / MCP Server)            │
└──────────────────────────────────────────────────────────────────────┘
```

## Two Operating Modes

### Mode 1: Payment Proxy (LLM-less)

```
Agent (external) ──HTTP──▶ server/proxy ──▶ core/proxy ──▶ payment check
                                                         ──▶ core/tools (execute capability)
                                                         ──▶ core/jobs (track)
                                                         ──▶ target service
                                          ◀── response ◀──
```

No LLM involved. The adapter is a smart reverse proxy. External agents or users send requests, the proxy enforces pricing, resolves payment (x402 / escrow / MPP), executes the capability against the target service, tracks the job, and returns the response.

### Mode 2: Autonomous Agent (LLM-enabled)

```
agent/loop ──tool call──▶ core/tools ──▶ core/capabilities (lookup)
                                       ──▶ core/payments (negotiate)
                                       ──▶ core/jobs (track)
                                       ──▶ target service (execute)
                                       ──▶ core/store (persist)
           ◀── result ◀──
```

The embedded LLM agent drives all platform interactions. It reads platform docs, registers, discovers tasks, bids, executes capabilities via core/tools, delivers results, and manages payments. The agent calls the same tool handlers that the proxy mode uses — they share the execution engine.

## Module Responsibilities

Each module has a single clear responsibility. No module imports from another module's internals.

### @agent-adapter/contracts

- **src/types.ts** — Capability, Job, PricingConfig, ToolDefinition, ProviderContext
- **src/wallet.ts** — WalletPlugin interface (chain-aware: `getAddress(chain?)`, `signMessage(msg, chain?)`, `signTransaction(tx, chain?)`), WalletRegistry interface (holds multiple WalletPlugins keyed by chain family, with `get(chain)`, `list()`, `primary()`, `has(chain)` methods)
- **src/payments.ts** — PaymentAdapter, PaymentChallenge, PaymentReceipt, PaymentSession
- **src/secrets.ts** — SecretsBackend interface
- **src/extensions.ts** — Extension interface, RuntimeEvent enum
- **src/drivers.ts** — PlatformDriver interface
- **src/tool-plugins.ts** — ToolPlugin interface
- **src/runtime.ts** — RuntimeAPI (stable surface for plugins)
- **src/database.ts** — DatabaseAdapter interface

No runtime behavior. No dependencies. This is the stable center.

### @agent-adapter/core

- **src/db/** — Drizzle schema (shared types), SQLite dialect, Postgres dialect, `createDb(config)` factory. All database access goes through Drizzle. No raw SQL outside this directory.
- **src/capabilities/** — CapabilityRegistry (in-memory + SQLite/Postgres overlay), source parsers (OpenAPI, MCP, manual, LLM-inferred). Does not set pricing — only discovers and stores.
- **src/payments/** — PaymentRegistry (resolves adapter per challenge), adapter loading from config. Does not implement payment protocols — plugins do.
- **src/jobs/** — JobEngine: create, markExecuting, markCompleted, markFailed, listActive, getById. Manages the 4-state lifecycle. Does not interact with platforms.
- **src/store/** — SecretsStore (encrypt/decrypt/persist), StateStore (JSON key-value), encryption backend (AES-256-GCM). Scoped by providerId.
- **src/wallet/** — WalletRegistry implementation: loads configured wallet plugins (OWS, chain-specific, or hosted), exposes `get(chain)` to resolve the right wallet for a given chain. Default self-hosted plugin is `wallet-ows` (Open Wallet Standard) which derives addresses for EVM, Solana, and other chains from a single encrypted seed. Fallback chain-specific plugins (`wallet-solana`, `wallet-evm`) available for providers who don't want OWS. Hosted mode uses `wallet-hosted` with server-managed encrypted keypairs. All key material encrypted at rest via AES-256-GCM.
- **src/tools/** — ToolHandlers: the central dispatch that maps tool names to handler functions. Both the agent loop and the server API call into this. Handles: status, net, secrets, state, wallet, payment, capability execution, jobs.
- **src/proxy/** — ProxyEngine: receives inbound HTTP, looks up capability by path mapping, enforces pricing, resolves payment, calls tool handlers to execute, returns response. This is the "payment gateway" mode.
- **src/config/** — YAML loader, env var resolution (`${VAR_NAME}` syntax), Zod validation of config shape.
- **src/index.ts** — `createRuntime(config)` factory: connects DB, loads wallet, initializes registries, returns RuntimeContext.

### @agent-adapter/agent

- **src/tools.ts** — All tool definitions as Zod schemas, compiled to OpenAI function calling format. Includes core tools + dynamically generated cap\_\_\* tools from the registry.
- **src/prompt.ts** — Default system prompt text. Provider prompt loading and merging (append/replace modes).
- **src/loop.ts** — AgentLoop class: LLM conversation loop using OpenAI-compatible API. Plan → tool calls → observe → repeat. Includes completion guard (checks jobs\_\_pending before stopping). Records token usage.
- **src/index.ts** — `createAgent(runtime, config)` factory.

### @agent-adapter/server

- **src/api/** — Hono route handlers for /manage/\* endpoints. Each handler extracts ProviderContext from request (self-hosted: constant, hosted: JWT), calls core functions, formats response. No business logic.
- **src/proxy/** — Hono middleware for /proxy/\* routes. Maps inbound path to capability, delegates to core/proxy engine.
- **src/auth/** — Auth middleware. Self-hosted: no-op (passes through). Hosted: validates Supabase JWT, extracts providerId, attaches to context.
- **src/dashboard/** — Serves static built React SPA from embedded directory.
- **src/index.ts** — `createServer(runtime, config)` factory: creates Hono app, registers all middleware and routes.

### @agent-adapter/cli

- **src/commands/** — One file per command group: init.ts, start.ts, capabilities.ts, wallet.ts, agent.ts, metrics.ts, drivers.ts.
- **src/index.ts** — Commander.js program definition, command registration, entry point.

Commands delegate to core and server. No business logic in CLI.

## Data Flow

### Capability Discovery

1. Config specifies capability sources (OpenAPI URL, MCP server, manual definitions, docs URL)
2. `core/capabilities` fetches and parses each source
3. Parsed capabilities registered in in-memory CapabilityRegistry
4. `core/db` syncs registry with capability_config table (preserving provider pricing overlays)
5. New capabilities appear as disabled, no pricing — flagged in dashboard

### Inbound Request (Proxy Mode)

1. External request hits `server/proxy` middleware at /proxy/:capabilityName
2. Auth middleware resolves ProviderContext
3. Proxy looks up capability in registry, checks enabled + priced
4. Proxy initiates payment flow (402 response for x402, escrow check, etc.)
5. On payment secured: `core/jobs` creates job record
6. `core/tools` executes capability against target service
7. Job marked completed or failed
8. Response returned to caller

### Agent Loop (Agent Mode)

1. Agent calls `status__whoami` → gets full current state from core
2. For each registered platform: agent calls `net__http_request` to check for tasks
3. Agent matches tasks against capabilities, evaluates pricing
4. Agent bids via `net__http_request`, handles acceptance
5. Agent calls `jobs__create` to create job record
6. Agent calls `pay_*` tools to secure payment
7. Agent calls `cap__*` tool → core/tools executes against target service
8. Agent delivers result via `net__http_request` to platform
9. Agent monitors settlement, updates job

### Multi-Tenancy (Hosted Mode)

1. Request arrives with Supabase JWT in Authorization header
2. Auth middleware validates JWT, extracts `providerId`
3. ProviderContext attached to request
4. All core operations receive ProviderContext, scope DB queries by `providerId`
5. Postgres RLS policies enforce isolation as defense-in-depth

## Key Constraints

- **No direct DB access outside core/db.** All modules use Drizzle queries through the db layer.
- **No business logic in route handlers.** Server routes validate input, resolve auth, call core, format response.
- **No business logic in CLI commands.** Commands parse args, call core/server functions, format terminal output.
- **No platform-specific code in core.** Core knows HTTP, payments, and jobs. Platform choreography is the agent's job (or a driver plugin's).
- **Tool handlers are the shared execution engine.** Both agent and server call the same handlers. Never duplicate execution logic.
- **ProviderContext flows through everything.** Every database query, every tool handler call, every registry lookup takes a providerId. Self-hosted uses `"default"`.
- **Secrets only via environment variables or config file.** Never hardcoded. Config supports `${VAR_NAME}` syntax for env var interpolation.
- **Plugins depend only on @agent-adapter/contracts.** Never on core internals. The contracts package is the stable API boundary.
