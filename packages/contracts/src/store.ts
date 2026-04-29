import type { AssetRef, EvmAddress } from "./common.js";
import type { PaymentRail, PaymentReceipt } from "./payment.js";

export type CapabilitySource = "openapi" | "mcp" | "manual";

export interface CapabilityPricing {
  rail: PaymentRail;
  amount: bigint;
  asset: AssetRef;
}

export interface Capability {
  id: string;
  name: string;
  description?: string;
  source: CapabilitySource;
  inputSchema?: unknown;
  outputSchema?: unknown;
  pricing?: CapabilityPricing;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export type JobStatus =
  | "pending"
  | "challenged"
  | "paid"
  | "executing"
  | "executed"
  | "failed";

export interface JobRecord {
  id: string;
  capabilityId: string;
  status: JobStatus;
  buyer?: EvmAddress;
  payment?: PaymentReceipt;
  request?: unknown;
  response?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DecisionLogEntry {
  id: string;
  jobId?: string;
  type: string;
  payload: unknown;
  createdAt: number;
}

export interface CapabilityStore {
  list(): Promise<Capability[]>;
  get(id: string): Promise<Capability | null>;
  upsert(capability: Capability): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface JobStore {
  create(job: JobRecord): Promise<void>;
  update(id: string, patch: Partial<JobRecord>): Promise<void>;
  get(id: string): Promise<JobRecord | null>;
  list(opts?: { limit?: number; status?: JobStatus }): Promise<JobRecord[]>;
}

export interface DecisionStore {
  log(entry: DecisionLogEntry): Promise<void>;
  list(opts?: { jobId?: string; limit?: number }): Promise<DecisionLogEntry[]>;
}

export interface Store {
  capabilities: CapabilityStore;
  jobs: JobStore;
  decisions: DecisionStore;
}
