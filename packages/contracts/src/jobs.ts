/**
 * JobEngine — contract for the 4-state job lifecycle.
 */

import type { Job, JobStatus, PaymentStatus } from "./types.js";

export interface CreateJobInput {
  readonly capabilityName: string;
  readonly platform: string;
  readonly platformRef: string;
  readonly inputHash?: string;
}

export interface JobListFilter {
  readonly status?: JobStatus;
  readonly capabilityName?: string;
  readonly platform?: string;
  readonly createdAfter?: string;
  readonly createdBefore?: string;
}

export interface JobListOptions extends JobListFilter {
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: "createdAt" | "completedAt";
  readonly order?: "asc" | "desc";
}

export interface UpdatePaymentInput {
  readonly paymentProtocol: string;
  readonly paymentStatus: PaymentStatus;
  readonly paymentAmount: number;
  readonly paymentCurrency: string;
}

export interface UpdateLlmUsageInput {
  readonly llmInputTokens: number;
  readonly llmOutputTokens: number;
  readonly llmEstimatedCost: number;
}

export interface JobEngine {
  /** Create a new job in "pending" status. Returns the created job. */
  create(input: CreateJobInput): Promise<Job>;

  /** Get a job by ID (provider-scoped). */
  get(id: string): Promise<Job | undefined>;

  /** List jobs with optional filters and pagination. */
  list(opts?: JobListOptions): Promise<Job[]>;

  /** Transition a job's status. Enforces the state machine. Throws on invalid transition. */
  transition(
    id: string,
    to: JobStatus,
    opts?: { outputHash?: string; errorDetail?: string },
  ): Promise<Job>;

  /** Update payment info on a job. */
  updatePayment(id: string, payment: UpdatePaymentInput): Promise<void>;

  /** Update LLM token usage on a job. Additive — accumulates tokens. */
  updateLlmUsage(id: string, usage: UpdateLlmUsageInput): Promise<void>;

  /** Count jobs matching optional filters. */
  count(filter?: JobListFilter): Promise<number>;

  /** Return all non-complete jobs (pending + executing). Used by the completion guard. */
  listActive(): Promise<Job[]>;
}
