# Acceptance Criteria: Agent Adapter Runtime

## How to Use
- Each row maps to a requirement ID in PRD.md.
- "Done" means ALL criteria for that requirement are passing.
- AI agents: generate tests from this file. Do not mark a requirement complete unless all criteria pass.

## Phase 1 — Foundation

| Req ID | Criteria | Test Type | Pass Condition |
|--------|----------|-----------|----------------|
| F01 | OpenAPI spec (URL) parsed into capabilities | Unit | Given a valid OpenAPI JSON URL, returns list of Capability objects with name, inputSchema, outputSchema, execution plan |
| F01 | OpenAPI spec (local file) parsed into capabilities | Unit | Given a local file path to valid OpenAPI YAML, returns same structured capabilities |
| F01 | Invalid OpenAPI spec returns typed error | Unit | Given malformed spec, throws CapabilityParseError with descriptive message, not a raw exception |
| F01 | Operations without operationId are handled gracefully | Unit | Generates a name from method + path (e.g. `get_users_by_id`) |
| F03 | Manual capability definitions loaded from config | Unit | Given YAML config with manual definitions, registers capabilities with correct schemas |
| F03 | Manual definition with missing required fields rejected | Unit | Throws validation error listing missing fields |
| F05 | Discovered capabilities default to disabled, no pricing | Unit | After OpenAPI ingestion, all capabilities have `enabled: false` and `pricing: null` |
| F05 | Capability without pricing cannot be activated | Unit | Attempting to enable a capability with null pricing throws PricingRequiredError |
| F07 | WalletRegistry loads configured wallet plugins on startup | Integration | `createRuntime()` with default config loads `wallet-ows` plugin, `walletRegistry.list()` returns at least one plugin |
| F07 | OWS wallet derives valid Solana address | Unit | `walletRegistry.get("solana").getAddress()` returns valid base58-encoded Solana address |
| F07 | OWS wallet derives valid EVM address | Unit | `walletRegistry.get("evm").getAddress()` returns valid checksummed Ethereum address |
| F07 | Fallback wallet-solana plugin works without OWS | Integration | Config with `wallet: { plugin: "solana" }` generates Solana keypair via tweetnacl, no OWS dependency |
| F07 | WalletRegistry resolves correct plugin by chain | Unit | `walletRegistry.get("solana")` returns Solana-capable plugin, `walletRegistry.get("evm")` returns EVM-capable plugin, `walletRegistry.get("unknown")` throws |
| F07 | Wallet keypair import from base58 | Unit | Given valid base58 private key, imports and encrypts correctly, getAddress returns matching public key |
| F07 | Wallet keys encrypted at rest | Integration | Raw bytes in DB are not plaintext. Decrypting with correct key yields valid keypair. Decrypting with wrong key fails. |
| F14 | SQLite database created and schema initialized | Integration | `createDb({ driver: "sqlite", path: ":memory:" })` succeeds, all tables exist |
| F14 | Postgres database connects and schema initialized | Integration | `createDb({ driver: "postgres", url: testDbUrl })` succeeds, all tables exist |
| F14 | Same Drizzle queries work on both SQLite and Postgres | Integration | Insert + select + update + delete operations produce identical results on both dialects |
| F16 | Secrets encrypted with AES-256-GCM | Unit | `secretsStore("platform", "key", "value")` stores encrypted blob, `secretsRetrieve` returns original value |
| F16 | Wrong encryption key cannot decrypt secrets | Unit | Changing key material causes decryption to throw |
| F16 | Secrets scoped by providerId | Integration | Provider A's secrets not visible to Provider B queries |

## Phase 2 — Payment Proxy

| Req ID | Criteria | Test Type | Pass Condition |
|--------|----------|-----------|----------------|
| F06 | per_call pricing enforced | Unit | Capability with per_call pricing returns correct amount in payment challenge |
| F06 | per_item pricing calculates from input field | Unit | Given itemField="items.length" and 5 items, charge = amount × 5 |
| F06 | quoted pricing respects floor/ceiling | Unit | Agent bid below floor rejected. Bid above ceiling rejected. Bid within range accepted. |
| F08 | Free payment adapter always returns secured | Unit | `canHandle({type:"free"})` returns true, `execute()` returns receipt with amount 0 |
| F08 | x402 adapter parses multi-chain 402 response | Unit | Given HTTP 402 with multiple `accepts` entries (CAIP-2 network IDs for EVM and Solana), extracts all payment requirements correctly |
| F08 | x402 adapter resolves correct wallet via WalletRegistry | Unit | Given 402 challenge for `eip155:8453`, resolves EVM wallet; given `solana:5eykt4...`, resolves Solana wallet |
| F08 | x402 adapter signs and retries | Integration | Mock server returns 402 then 200 on retry with payment header. Adapter handles full flow. |
| F08 | Payment registry resolves correct adapter | Unit | Given challenge type "x402", resolves x402 adapter. Given "free", resolves free adapter. Unknown type throws. |
| F09 | Job created in pending state | Unit | `jobEngine.create(...)` returns job with status "pending" |
| F09 | Job transitions pending → executing → completed | Unit | Sequential calls to markExecuting then markCompleted succeed, status updates correctly |
| F09 | Job transitions pending → executing → failed | Unit | markFailed records error detail, sets completedAt |
| F09 | Invalid transition rejected | Unit | Calling markCompleted on a pending (not executing) job throws InvalidTransitionError |
| F09 | Job records payment status | Unit | After payment sync, job.paymentStatus and job.paymentAmount reflect the payment |
| F11 | Tool handlers callable via management API | Integration | POST /api/v1/capabilities/:name/execute with valid input returns capability result |
| F11 | Tool handlers callable via agent loop | Integration | Agent loop calling cap__* tool gets same result as direct API call |
| F12 | Reverse proxy forwards request to target | Integration | Request to /proxy/my_capability with valid payment returns target service response |
| F12 | Reverse proxy rejects unpaid request | Integration | Request without payment returns 402 with payment requirements |
| F12 | Reverse proxy rejects disabled capability | Integration | Request to disabled capability returns 404 |
| F12 | Reverse proxy rejects unpriced capability | Integration | Request to capability without pricing returns 503 with "pricing not configured" |
| F12 | Proxy latency overhead < 50ms | Performance | Proxied request to local mock server adds < 50ms vs direct call (excluding payment negotiation) |

## Phase 3 — Agent Mode

| Req ID | Criteria | Test Type | Pass Condition |
|--------|----------|-----------|----------------|
| F10 | Agent loop calls status__whoami first | Unit | Mock LLM returns tool call for status__whoami as first action |
| F10 | Agent loop dispatches tool calls to core handlers | Integration | Agent calls net__http_request → core HTTP client makes actual request → result returned to agent |
| F10 | Agent loop stops after max rounds | Unit | After maxToolRounds iterations, loop returns with message about reaching max |
| F10 | Agent loop records token usage | Unit | After loop completes, llm_usage table has entry with prompt_tokens, completion_tokens |
| F10 | Completion guard prevents early stop | Unit | If jobs__pending returns non-empty, agent receives nudge message instead of stopping |
| F10 | Provider custom prompt appended to default | Unit | With appendToDefault=true, system prompt contains both default and custom text |
| F10 | Provider custom prompt replaces default | Unit | With appendToDefault=false, system prompt contains only custom text |
| F10 | Agent can be paused and resumed | Integration | POST /manage/agent/pause stops loop, POST /manage/agent/resume restarts it |

## Phase 4 — Dashboard & CLI

| Req ID | Criteria | Test Type | Pass Condition |
|--------|----------|-----------|----------------|
| F13 | Dashboard serves at configured port | Integration | GET / returns HTML with React app |
| F13 | Dashboard shows capability list | Integration | GET /manage/capabilities returns JSON with all discovered capabilities and pricing status |
| F19 | CLI init creates config file | Integration | `agent-adapter init` with defaults creates valid agent-adapter.yaml |
| F19 | CLI start boots runtime | Integration | `agent-adapter start` connects DB, loads wallet, registers capabilities |
| F19 | CLI capabilities list shows all capabilities | Integration | Output matches /manage/capabilities response |
| F19 | CLI capabilities price sets pricing | Integration | After `capabilities price X --amount 0.02 --model per_call`, capability has correct pricing |

## Phase 5 — LLM-Inferred Capabilities

| Req ID | Criteria | Test Type | Pass Condition |
|--------|----------|-----------|----------------|
| F04 | Docs URL scraped and parsed | Integration | Given a URL to API docs page, returns structured text content |
| F04 | LLM generates endpoint definitions from docs | Integration | Given scraped docs, LLM returns array of capability definitions with name, method, path, schemas |
| F04 | Each inferred endpoint validated with test call | Integration | For each inferred capability, adapter makes test HTTP call and classifies result (confirmed / needs-review / invalid) |
| F04 | Self-correction on validation failure | Integration | On 400 error, LLM re-infers schema from error message, retries, improves accuracy |
| F04 | Inferred capabilities require review | Unit | Inferred capabilities have source="inferred" and enabled=false, visible in dashboard as "needs review" |
| F04 | Provider can approve/reject inferred capabilities | Integration | PUT /manage/capabilities/:name/toggle on inferred capability with pricing set enables it |

## Phase 6 — Hosted Mode

| Req ID | Criteria | Test Type | Pass Condition |
|--------|----------|-----------|----------------|
| F15 | Supabase JWT validated on all management endpoints | Integration | Request without JWT returns 401. Request with valid JWT returns 200 with provider-scoped data. |
| F15 | Provider A cannot see Provider B's data | Integration | Two valid JWTs for different providers return different capability lists, different jobs, different wallet addresses |
| F15 | RLS policies enforced at database level | Integration | Direct Postgres query with wrong provider_id returns no rows, even bypassing application code |

## Non-Functional

| Req ID | Criteria | Test Type | Pass Condition |
|--------|----------|-----------|----------------|
| NFR-P | Reverse proxy overhead < 50ms | Load test | 100 sequential requests to proxy, P95 overhead < 50ms |
| NFR-S | Dashboard inaccessible from non-localhost (self-hosted default) | Integration | Request from non-127.0.0.1 to dashboard port returns connection refused or 403 |
| NFR-S | Wallet private key not in any log output | Audit | Grep all log output during full test suite, no private key material found |
| NFR-S | Secrets not in any log output | Audit | Grep all log output during full test suite, no decrypted secret values found |
| NFR-R | Credentials survive process crash | Integration | Store credential, kill process, restart, retrieve credential — value matches |
| NFR-R | Failed jobs have error detail | Unit | Every markFailed call includes non-empty error string |
