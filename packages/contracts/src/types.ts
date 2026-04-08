/**
 * Core domain types shared across all packages.
 */

import type { JOB_STATUSES, PAYMENT_STATUSES } from "./constants.js";

export interface ProviderContext {
  readonly providerId: string;
}

export type PricingModel = "per_call" | "per_item" | "per_token" | "quoted";

export interface PricingConfig {
  readonly model: PricingModel;
  readonly amount: number;
  readonly currency: string;
  readonly itemField?: string;
  readonly floor?: number;
  readonly ceiling?: number;
}

export type CapabilitySource = "openapi" | "mcp" | "manual" | "inferred";

export interface Capability {
  readonly name: string;
  readonly description: string;
  readonly source: CapabilitySource;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly executionPlan: ExecutionPlan;
  readonly enabled: boolean;
  readonly pricing: PricingConfig | null;
  readonly sourceHash: string | null;
}

export interface ExecutionPlan {
  readonly method: string;
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly bodyTemplate?: Record<string, unknown>;
}

export type JobStatus = (typeof JOB_STATUSES)[number];

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface Job {
  readonly id: string;
  readonly providerId: string;
  readonly capabilityName: string;
  readonly platform: string;
  readonly platformRef: string;
  readonly status: JobStatus;
  readonly inputHash: string | null;
  readonly outputHash: string | null;
  readonly paymentProtocol: string | null;
  readonly paymentStatus: PaymentStatus | null;
  readonly paymentAmount: number | null;
  readonly paymentCurrency: string | null;
  readonly llmInputTokens: number | null;
  readonly llmOutputTokens: number | null;
  readonly llmEstimatedCost: number | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}
