import type { CapabilitySource } from "./store.js";
import type { PaymentReceipt } from "./payment.js";

export type RuntimeEvent =
  | { type: "capability.discovered"; capabilityId: string; source: CapabilitySource; at: number }
  | { type: "job.created"; jobId: string; capabilityId: string; at: number }
  | { type: "payment.challenged"; jobId: string; rail: string; at: number }
  | { type: "payment.received"; jobId: string; receipt: PaymentReceipt; at: number }
  | { type: "job.executed"; jobId: string; durationMs: number; at: number }
  | { type: "job.failed"; jobId: string; error: string; at: number };

export type RuntimeEventType = RuntimeEvent["type"];
