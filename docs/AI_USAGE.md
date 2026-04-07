# Agent Contract: Agent Adapter Runtime

## Ground Rules
1. Only implement what is listed in PRD.md. Do not add unrequested features.
2. Follow the package structure and module boundaries in ARCHITECTURE.md exactly.
3. If a requirement is ambiguous, ASK before implementing. Do not guess.
4. Never invent new DB tables, API routes, or environment variables without stating so and getting approval.
5. Prefer small, focused changes. One task = one concern.
6. Work phase-by-phase as defined in TECH_PLAN.md. Do not jump ahead.

## Code Standards
- Language: TypeScript in strict mode. No `any` types. Use `unknown` + type guards when the type is genuinely unknown.
- Module format: ES modules (`"type": "module"` in package.json, `.js` extensions in imports).
- Naming: camelCase for variables/functions, PascalCase for types/interfaces/classes, UPPER_SNAKE_CASE for constants.
- File naming: kebab-case for filenames (e.g. `capability-registry.ts`, not `capabilityRegistry.ts`).
- Error handling: all async functions must handle errors explicitly. No unhandled promise rejections. Use typed error classes, not string throws.
- Logging: structured logs (JSON) with context (providerId, jobId, capabilityName). No `console.log` in production paths. Use a logger instance.
- Imports: always use explicit `.js` extensions in relative imports (required for NodeNext module resolution).
- No default exports. Use named exports only.
- Functions should have explicit return types.

## Package Dependency Rules
- `@agent-adapter/contracts` has ZERO runtime dependencies.
- `@agent-adapter/core` depends only on `contracts` + declared external deps.
- `@agent-adapter/agent` depends on `contracts` + `core`. Never imports from `server` or `cli`.
- `@agent-adapter/server` depends on `contracts` + `core`. Never imports from `agent` directly (agent is loaded optionally at runtime).
- `@agent-adapter/cli` depends on `contracts` + `core` + `server`. Agent is optional.
- Plugins depend ONLY on `@agent-adapter/contracts`. Never on core internals.
- No circular dependencies between packages. Turborepo enforces this via the build graph.

## Database Rules
- All database access goes through Drizzle ORM queries in `core/db/`.
- No raw SQL strings outside `core/db/`. Use Drizzle's query builder.
- Every table includes a `providerId` column. Every query filters by it.
- Schema changes require a migration file. Migrations must be idempotent.
- SQLite and Postgres schemas must stay in sync. If a feature works on one dialect, it must work on both.
- Never use Postgres-only features (e.g. `NOTIFY/LISTEN`, array columns) in shared schema. Use Drizzle's dialect-agnostic column types.
- Exception: Postgres RLS policies are defined separately and only apply in hosted mode.

## Multi-Tenancy Rules
- `ProviderContext` must flow through every operation. Never assume single-tenant.
- Self-hosted mode uses `{ providerId: "default" }` — never omit the context.
- In core modules, every function that touches the database or provider-scoped state must accept `ProviderContext` (or extract it from the calling context).
- Never filter by providerId in the route handler — pass it to core and let core handle scoping.

## Security Rules
- Dashboard bound to 127.0.0.1 by default. Hosted mode requires auth on every endpoint.
- Wallet private keys: encrypted at rest with AES-256-GCM. Never logged. Never sent in API responses. Never included in error messages.
- Secrets (API keys, tokens): encrypted at rest. Never logged. Retrieved only through the SecretsStore interface.
- All user/agent inputs validated at the API boundary using Zod schemas.
- Parameterized queries only. No string concatenation in database queries (Drizzle enforces this).
- Config values containing `${...}` are resolved from environment variables. Never hardcode secrets in YAML.

## Testing Requirements
- Every new module must have at least one test file.
- Tests live in `__tests__/` directories within each package, mirroring the source structure.
- Use Vitest for all tests.
- Unit tests for core logic (capabilities, jobs, payments, store, wallet).
- Integration tests for API routes (using Hono's test client).
- Do not modify existing passing tests unless explicitly asked.
- Test both SQLite and Postgres paths for database-dependent code (use test fixtures).

## What AI Must NOT Do
- Do not refactor code outside files relevant to the current task.
- Do not add npm dependencies without stating the reason and getting approval.
- Do not remove error handling, logging, or auth guards as "cleanup".
- Do not use deprecated APIs from any library in the stack.
- Do not add platform-specific code (AGICitizens, etc.) to core packages. Platform knowledge belongs in agent prompts or driver plugins.
- Do not write to the config file programmatically. Config file is provider-managed. Runtime state goes in the database.
- Do not bypass Drizzle to write raw SQL, even "just for this one query".
- Do not store unencrypted secrets or wallet keys in the database.
- Do not create singleton/global state. Use dependency injection via factory functions (createRuntime, createServer, createAgent).
