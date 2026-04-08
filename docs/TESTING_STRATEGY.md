# Testing Strategy

## Goal

The goal of this test strategy is not just "high coverage". It is to prevent false confidence.

The failure mode we want to eliminate is:

- unit tests pass
- the implementation matches those unit tests
- but the real runtime path across modules is still wrong

This happened because we had good local tests for parsing and storage, but not enough production-like tests for the full execution path.

## Confidence Model

Every important behavior should be defended by the right layer of tests:

- Unit tests prove local logic.
- Integration tests prove module boundaries.
- E2E sub-path tests prove real request flows.
- Acceptance docs define what "done" actually means.

If a behavior crosses a module boundary, a unit test alone is not enough.

## Rules

1. Never mark a feature "done" because parser tests pass if the feature is only valuable when executed later.
2. Every production code path that transforms data across boundaries must have at least one integration or E2E test.
3. When a route or tool eventually makes an HTTP request, at least one test should hit a real local HTTP server instead of a mocked transport.
4. When state is persisted in SQLite/Postgres in production, integration tests should use the real database adapter for that environment whenever possible.
5. When a component caches data, tests must verify both the reported state and the effective runtime behavior after refresh/reload.
6. Tests should fail on behavioral mismatch with the product contract, not just mismatch with the current implementation.
7. Gaps between test environment and production must be documented explicitly.

## Test Layers

### 1. Unit Tests

Use for:

- parsing
- validation
- pricing math
- schema mapping
- small helpers
- state transitions

Good examples in this repo:

- OpenAPI/manual parsing
- capability request templating
- job transition validation
- secret encryption helpers

Unit tests should stay fast and isolated, but they are not sufficient for runtime confidence.

### 2. Integration Tests

Use for real interactions between core modules:

- config -> registry -> store
- registry -> tool handler -> HTTP client
- proxy engine -> job engine -> payment registry
- wallet registry -> wallet tools -> multi-chain plugin

Integration tests should prefer:

- real SQLite
- real serialization
- real fetch against a local HTTP server
- minimal mocking only for truly external dependencies like blockchains, hosted auth, or LLM APIs

### 3. E2E Sub-Path Tests

Full product E2E is not possible yet because the product is incomplete.

Instead, we use sub-path E2E tests that are as production-like as possible for completed slices:

- inbound request -> Hono route -> auth -> core proxy -> upstream service
- OpenAPI discovery -> capability enablement -> tool execution -> upstream service

These tests should exercise:

- real Hono app
- real request/response bodies
- real local upstream server
- real SQLite-backed stores

## Mandatory Coverage by Area

### Capabilities

Required tests:

- parser unit tests for JSON and YAML OpenAPI
- integration test for OpenAPI discovery through actual execution
- stale capability refresh test that verifies runtime disappearance, not just stale reporting

### Proxy Mode

Required tests:

- unpaid request path
- paid request path
- disabled capability path
- unpriced capability path
- JSON upstream response passthrough
- text upstream response passthrough
- binary upstream response passthrough
- failure path creates failed job with error detail

### Wallets

Required tests:

- registry resolution by chain family and CAIP-2
- tool-layer tests that verify the requested chain is forwarded to the plugin
- persistence/reload encryption tests

### Jobs

Required tests:

- transition validity
- payment update persistence
- LLM usage accumulation
- failure detail persistence through a runtime path, not just direct state mutation

### Server

Required tests:

- route translation tests
- sub-path E2E tests with the real Hono app and real upstream server
- content-type and body-shape preservation tests

## Production-Like Defaults

When writing new integration or E2E tests, prefer this setup:

- SQLite `:memory:` for self-hosted runtime paths
- local Node HTTP server on an ephemeral port for upstream APIs
- real `fetch` and real request bodies
- actual registry refresh and DB writes
- actual Hono app via `app.request(...)` or localhost HTTP when socket behavior matters

Avoid these shortcuts unless there is no better option:

- mocking the module under test
- mocking `fetch` when the behavior being tested is HTTP translation
- asserting only internal metadata when the production value is in the external result

## Test Design Heuristics

When a feature is added, ask:

1. What is the first real boundary this code crosses?
2. What is the last observable effect a user or caller cares about?
3. Do we have a test that covers both in one path?

If the answer to 3 is no, add an integration or E2E test.

Examples:

- OpenAPI parser bug:
  Parser-only tests are not enough. We need execution-path coverage.
- Cache invalidation bug:
  Reporting stale names is not enough. We need post-refresh lookup/execution checks.
- Proxy body bug:
  Mocking `httpRequest` is not enough. We need a real upstream server and real bytes.

## Gaps Between Tests and Production

Even high-fidelity tests still differ from production. We should be explicit:

### Current unavoidable gaps

- Hosted mode is not implemented, so there is no true hosted/Postgres/Supabase E2E yet.
- Payment rails are represented by lightweight adapters, not real x402/escrow/MPP settlement flows.
- `app.request(...)` exercises the Hono app stack but does not reproduce every Node socket-level behavior on inbound traffic.
- Local upstream servers do not reproduce internet latency, TLS, proxies, or intermediary infrastructure.
- Load/performance and concurrency behavior are still mostly untested.

### How we handle those gaps

- Document them in the PR/test plan.
- Keep the sub-path E2E tests as close as possible to production for the implemented slice.
- Add a higher-fidelity test as soon as the product slice exists.

## Release Gates

Before merging a feature that affects runtime behavior:

- unit tests for local logic must pass
- at least one integration test for the cross-module path must pass
- if the feature is externally reachable, at least one route/tool E2E sub-path test must pass
- docs/acceptance expectations must match the tested behavior

## Recommended Next Additions

As the codebase grows, add these next:

- true runtime bootstrap integration tests once `createRuntime()` exists
- Postgres integration tests once hosted mode exists
- x402 retry-flow integration tests once the adapter exists
- agent-loop integration tests with a deterministic fake model once the agent package is implemented
- performance/load checks for proxy overhead once the HTTP surface stabilizes
