# Graphify Learnings For Agent Adapter

## Purpose

This note captures what we can realistically learn from the public `graphify` repo after reviewing its source code, running its test suite, and comparing its design to the needs of Agent Adapter.

This is intentionally not a generic inspiration note. It separates:

- ideas that are worth adopting now
- ideas that are worth adopting later
- ideas that should not shape our architecture
- differences between the OSS self-hosted product and the future hosted product

## What Was Verified

Graphify is not just a README project. The following were verified from source and local execution:

- the Python package structure is coherent and matches its architecture doc
- the local install flow for Codex-style `AGENTS.md` guidance works
- the graph query flow works on a sample `graph.json`
- the repo's automated test suite passes locally

At the same time, some README claims are broader than what the directly executable CLI currently exposes. In particular, parts of the multimodal and semantic extraction story depend on skill instructions being followed by the host coding agent, not just on standalone Python runtime code.

## Bottom Line

Graphify is a strong reference for operator ergonomics, graph-derived summaries, provenance labeling, and staged processing. It is not a good template for our core runtime architecture, payment flow, tenancy model, or hosted product design.

The right move is to borrow its clarity patterns, not its execution model.

## Adopt Now

### 1. Generate runtime summary artifacts

Graphify does a good job of turning hidden structure into explicit artifacts like `GRAPH_REPORT.md`.

We should generate a compact runtime-facing summary artifact for each provider that answers:

- which capabilities exist
- where each capability came from
- whether it is enabled
- how it is priced
- which wallet plugin and chains are active
- which payment adapters are loaded
- which tool plugins are registered
- which capability sources failed validation or refresh

Why this helps:

- faster onboarding for operators and contributors
- easier debugging than reading raw config plus database rows
- lower chance of false confidence about what is actually active

OSS mapping:

- write a generated `runtime-out/RUNTIME_REPORT.md`
- optionally emit `runtime-out/runtime.json` for automation

Hosted mapping:

- expose the same information in dashboard and API form
- keep the source of truth in structured storage, not markdown
- optionally generate a support/debug snapshot on demand

### 2. Make provenance first-class

Graphify distinguishes relationships by confidence and origin. That idea is highly applicable to our capability system.

We should annotate capabilities and derived execution metadata with fields like:

- `source_type`: `manual | openapi | mcp | inferred`
- `source_location`: URL, file path, or plugin name
- `discovery_status`: `discovered | verified | stale | invalid`
- `verification_status`: `schema_only | execution_verified | runtime_failed`
- `confidence`: `declared | inferred | ambiguous`

Why this helps:

- prevents treating inferred or weakly parsed capabilities as production-ready
- makes dashboard and reviews more honest
- supports better refresh, pruning, and debugging decisions

OSS mapping:

- add provenance to capability registry and refresh outputs
- include it in management endpoints and generated reports

Hosted mapping:

- same fields, but surfaced as support and approval metadata
- allow provider-facing UI to filter by "verified" vs "unverified" capabilities

### 3. Keep runtime assembly staged and explicit

Graphify's strongest architectural quality is that its pipeline stages are easy to understand. We should keep that same quality in our runtime bootstrap.

Recommended runtime stages:

1. validate config
2. initialize storage
3. initialize provider context
4. load wallet plugins
5. load payment adapters
6. refresh capabilities
7. build tool handlers
8. initialize external tool plugins
9. expose server and agent surfaces

Why this helps:

- easier reasoning about startup failures
- better integration testing seams
- clearer eventual hosted bootstrap path

OSS mapping:

- keep `createRuntime()` as the composition root
- avoid hidden side effects inside registries where possible

Hosted mapping:

- split runtime boot from request-scoped auth and provider resolution
- make provider boot idempotent and safe for multi-tenant operation

### 4. Cache discovery and refresh work more deliberately

Graphify benefits from explicit incremental processing and file-hash caching. The same mindset is valuable for capability refresh and provider bootstrap.

Useful cache targets for us:

- OpenAPI source fetch hash
- parsed capability set hash
- last successful refresh timestamp
- refresh error state
- plugin manifest hash

Why this helps:

- faster startup for self-hosted deployments
- less unnecessary source fetching
- clearer operator feedback when data is unchanged

OSS mapping:

- refresh only when source hashes change, unless forced
- store refresh metadata in SQLite

Hosted mapping:

- background refresh jobs keyed by provider and source hash
- separate "last checked" from "last changed"

### 5. Keep safety and validation at explicit boundaries

Graphify has an explicit `security.py` boundary for path and input validation. We should continue strengthening that style in our own system.

Highest-value boundaries for us:

- capability source ingestion
- proxy request construction
- outbound HTTP forwarding
- secret reads and writes
- wallet import and rehydration
- plugin loading

Why this helps:

- fewer ambiguous failure modes
- better auditability
- safer hosted rollout later

## Adopt Later

### 1. Generated wiki or explainer documents

Graphify's idea of an agent-crawlable wiki is useful, but it is secondary for us right now.

Potential future output:

- `runtime-out/wiki/index.md`
- one page per capability family
- one page per provider integration
- one page for wallet/payment configuration

This becomes more valuable once the project has a fuller management API, dashboard, and hosted control plane.

### 2. Graph-style internal topology views

A graph of capabilities, plugins, payment rules, and job flows could be useful for maintainers, but it should not be on the critical path right now.

Good future use cases:

- tracing plugin ownership
- visualizing capability dependencies
- support debugging for hosted tenants

### 3. Persistent operator memory artifacts

Graphify stores query results back into its knowledge system. For us, a similar idea could exist later as support or operator notes tied to providers, incidents, or capability overrides.

This is useful, but only after the core hosted operations model exists.

## Do Not Adopt

### 1. Skill-script-driven core behavior

Graphify relies significantly on external skill instructions to drive semantic extraction. That is acceptable for a developer-assistant workflow, but it is the wrong foundation for our runtime.

We should not make core correctness depend on:

- an agent remembering to run a step
- prompt conventions as primary control flow
- manual operator behavior for critical runtime transitions

Our core behavior must remain encoded in TypeScript runtime code and verified tests.

### 2. README-first feature posture

Graphify has some cases where the README surface is broader than the directly exposed CLI surface.

We should avoid that pattern for Agent Adapter, especially because our domain includes payments, secrets, tenancy, and execution.

The rule for us should be:

- acceptance docs may describe planned work
- product docs and runtime docs should clearly separate implemented vs planned behavior

### 3. Unit-heavy confidence without production-like verification

Graphify's test suite is real and useful, but it still illustrates the limit of mostly local testing around helper behavior and pipeline shape.

For us, that is not enough.

We should keep requiring:

- unit tests for helpers and invariants
- integration tests for subsystem boundaries
- sub-path end-to-end tests for real request flows

This is especially important for:

- capability execution
- payment enforcement
- wallet routing
- proxy passthrough
- hosted auth and provider isolation

## Architecture Impact By Product Surface

### Self-Hosted OSS

The most valuable Graphify-inspired improvements for OSS are visibility and operator trust.

Recommended OSS additions:

- generated runtime report after startup or refresh
- provenance and verification metadata on capabilities
- stronger refresh metadata and caching
- explicit startup stage logging
- operator-friendly diagnostics for wallet/payment/plugin loading

Expected payoff:

- easier debugging
- less guesswork when reading the system state
- safer plugin and capability experimentation

### Hosted Version

The hosted product should borrow far less from Graphify directly.

Recommended hosted takeaways:

- provenance fields in the data model
- explicit verification states for discovered capabilities
- support/debug snapshots derived from structured runtime state
- clearly staged tenant bootstrap and refresh jobs

What should remain driven by hosted-first concerns instead:

- auth and tenant isolation
- request-scoped provider resolution
- audit logs
- rate limiting and abuse controls
- billing and payment observability
- managed key custody and secret rotation

Expected payoff:

- clearer support workflows
- better tenant-facing transparency
- less ambiguity around "discovered" versus "safe to sell"

## Recommended Near-Term Changes For This Repo

These are the highest-value follow-ups if we want to turn the learnings into code.

1. Add structured provenance fields to capability records and registry refresh results.
2. Generate `runtime-out/RUNTIME_REPORT.md` and `runtime-out/runtime.json` from the active runtime state.
3. Add explicit refresh metadata storage: last checked, last changed, last success, last error.
4. Surface verification status in management API responses before hosted mode is implemented.
5. Keep expanding production-like integration and end-to-end tests instead of relying on parser-level confidence.

## Decision

Adopt Graphify-inspired visibility and provenance ideas.

Do not adopt Graphify's skill-centric execution model as a basis for Agent Adapter runtime or hosted architecture.
