/**
 * Capability registry — discovery from OpenAPI, MCP, manual, and LLM-inferred sources.
 * Does not set pricing — only discovers and stores.
 */

export { createCapabilityRegistry } from "./registry.js";
export type { CapabilityRegistry, SyncResult } from "./registry.js";
export { createCapabilityStore } from "./store.js";
export type { CapabilityStore } from "./store.js";
export { CapabilityParseError, PricingRequiredError } from "./errors.js";
