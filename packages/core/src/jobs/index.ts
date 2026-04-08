/**
 * Job engine — 4-state lifecycle (pending → executing → completed / failed).
 * Manages job records, payment status linking, LLM token tracking.
 */

import { randomUUID } from "node:crypto";
import { eq, and, sql, gte, lte, asc, desc } from "drizzle-orm";
import type {
  Job,
  JobStatus,
  PaymentStatus,
  JobEngine,
  CreateJobInput,
  JobListOptions,
  JobListFilter,
  UpdatePaymentInput,
  UpdateLlmUsageInput,
} from "@agent-adapter/contracts";
import type { DatabaseConnection } from "../db/index.js";
import { schema } from "../db/index.js";

type JobRow = typeof schema.jobs.$inferSelect;

/** pending → executing → completed | failed. Terminal states have no outgoing edges. */
const VALID_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  pending: ["executing"],
  executing: ["completed", "failed"],
  completed: [],
  failed: [],
};

export class InvalidJobTransitionError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly from: JobStatus,
    public readonly to: JobStatus,
  ) {
    super(
      `Invalid job transition: "${from}" → "${to}" for job ${jobId}. ` +
        `Valid transitions from "${from}": ${VALID_TRANSITIONS[from]?.join(", ") || "none"}`,
    );
    this.name = "InvalidJobTransitionError";
  }
}

const toJob = (row: JobRow): Job => ({
  id: row.id,
  providerId: row.providerId,
  capabilityName: row.capabilityName,
  platform: row.platform,
  platformRef: row.platformRef,
  // Safe casts — DB CHECK constraints guarantee valid enum values
  status: row.status as JobStatus,
  inputHash: row.inputHash,
  outputHash: row.outputHash,
  paymentProtocol: row.paymentProtocol,
  paymentStatus: row.paymentStatus as PaymentStatus | null,
  paymentAmount: row.paymentAmount,
  paymentCurrency: row.paymentCurrency,
  llmInputTokens: row.llmInputTokens,
  llmOutputTokens: row.llmOutputTokens,
  llmEstimatedCost: row.llmEstimatedCost,
  createdAt: row.createdAt,
  completedAt: row.completedAt,
});

const buildFilterConditions = (
  jobs: typeof schema.jobs,
  providerId: string,
  filter?: JobListFilter,
) => {
  // Provider scoping is always applied — reused by both list() and count()
  const conditions = [eq(jobs.providerId, providerId)];
  if (filter?.status) conditions.push(eq(jobs.status, filter.status));
  if (filter?.capabilityName)
    conditions.push(eq(jobs.capabilityName, filter.capabilityName));
  if (filter?.platform) conditions.push(eq(jobs.platform, filter.platform));
  if (filter?.createdAfter)
    conditions.push(gte(jobs.createdAt, filter.createdAfter));
  if (filter?.createdBefore)
    conditions.push(lte(jobs.createdAt, filter.createdBefore));
  return conditions;
};

export const createJobEngine = (
  conn: DatabaseConnection,
  providerId: string,
): JobEngine => {
  const { db } = conn;
  const { jobs } = schema;

  return {
    async create(input: CreateJobInput): Promise<Job> {
      const now = new Date().toISOString();
      const id = randomUUID();

      db.insert(jobs)
        .values({
          id,
          providerId,
          capabilityName: input.capabilityName,
          platform: input.platform,
          platformRef: input.platformRef,
          status: "pending",
          inputHash: input.inputHash ?? null,
          createdAt: now,
        })
        .run();

      return toJob(
        db
          .select()
          .from(jobs)
          .where(and(eq(jobs.id, id), eq(jobs.providerId, providerId)))
          .get()!,
      );
    },

    async get(id: string): Promise<Job | undefined> {
      const row = db
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, id), eq(jobs.providerId, providerId)))
        .get();
      return row ? toJob(row) : undefined;
    },

    async list(opts?: JobListOptions): Promise<Job[]> {
      const conditions = buildFilterConditions(jobs, providerId, opts);

      const orderCol =
        opts?.orderBy === "completedAt" ? jobs.completedAt : jobs.createdAt;
      const orderFn = opts?.order === "asc" ? asc : desc;

      // $dynamic() allows conditional .limit()/.offset() chaining
      let query = db
        .select()
        .from(jobs)
        .where(and(...conditions))
        .orderBy(orderFn(orderCol))
        .$dynamic();

      if (opts?.limit !== undefined) query = query.limit(opts.limit);
      if (opts?.offset !== undefined) query = query.offset(opts.offset);

      return query.all().map(toJob);
    },

    async transition(
      id: string,
      to: JobStatus,
      opts?: { outputHash?: string },
    ): Promise<Job> {
      const row = db
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, id), eq(jobs.providerId, providerId)))
        .get();
      if (!row) throw new Error(`Job not found: ${id}`);

      const from = row.status as JobStatus;
      if (!VALID_TRANSITIONS[from].includes(to)) {
        throw new InvalidJobTransitionError(id, from, to);
      }

      // Stamp completedAt on terminal states
      const set: Record<string, unknown> = { status: to };
      if (to === "completed" || to === "failed") {
        set.completedAt = new Date().toISOString();
      }
      if (opts?.outputHash) {
        set.outputHash = opts.outputHash;
      }

      db.update(jobs)
        .set(set)
        .where(and(eq(jobs.id, id), eq(jobs.providerId, providerId)))
        .run();

      return toJob(
        db
          .select()
          .from(jobs)
          .where(and(eq(jobs.id, id), eq(jobs.providerId, providerId)))
          .get()!,
      );
    },

    async updatePayment(
      id: string,
      payment: UpdatePaymentInput,
    ): Promise<void> {
      const result = db
        .update(jobs)
        .set({
          paymentProtocol: payment.paymentProtocol,
          paymentStatus: payment.paymentStatus,
          paymentAmount: payment.paymentAmount,
          paymentCurrency: payment.paymentCurrency,
        })
        .where(and(eq(jobs.id, id), eq(jobs.providerId, providerId)))
        .run();

      if (result.changes === 0) throw new Error(`Job not found: ${id}`);
    },

    async updateLlmUsage(
      id: string,
      usage: UpdateLlmUsageInput,
    ): Promise<void> {
      // Additive via SQL to avoid read-then-write race; COALESCE handles initial NULLs
      const result = db
        .update(jobs)
        .set({
          llmInputTokens: sql`COALESCE(${jobs.llmInputTokens}, 0) + ${usage.llmInputTokens}`,
          llmOutputTokens: sql`COALESCE(${jobs.llmOutputTokens}, 0) + ${usage.llmOutputTokens}`,
          llmEstimatedCost: sql`COALESCE(${jobs.llmEstimatedCost}, 0) + ${usage.llmEstimatedCost}`,
        })
        .where(and(eq(jobs.id, id), eq(jobs.providerId, providerId)))
        .run();

      if (result.changes === 0) throw new Error(`Job not found: ${id}`);
    },

    async listActive(): Promise<Job[]> {
      return db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.providerId, providerId),
            sql`${jobs.status} IN ('pending', 'executing')`,
          ),
        )
        .orderBy(asc(jobs.createdAt))
        .all()
        .map(toJob);
    },

    async count(filter?: JobListFilter): Promise<number> {
      const conditions = buildFilterConditions(jobs, providerId, filter);

      const row = db
        .select({ count: sql<number>`COUNT(*)` })
        .from(jobs)
        .where(and(...conditions))
        .get();

      return row?.count ?? 0;
    },
  };
};
