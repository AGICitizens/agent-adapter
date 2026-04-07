export const DATABASE_DRIVERS = ["sqlite", "postgres"] as const;

export const CAPABILITY_SOURCE_TYPES = [
  "openapi",
  "mcp",
  "manual",
  "inferred",
] as const;

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export const JOB_STATUSES = [
  "pending",
  "executing",
  "completed",
  "failed",
] as const;

export const PAYMENT_STATUSES = [
  "none", // no payment required (free adapter)
  "required", // payment challenge received, not yet paid
  "pending", // payment sent, awaiting confirmation
  "failed", // payment attempt failed
] as const;
