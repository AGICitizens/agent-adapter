import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { providers } from "./providers.js";
import { textEnum } from "./utils.js";
import {
  JOB_STATUSES,
  PAYMENT_STATUSES,
} from "../../../../contracts/src/constants.js";

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    /** Matches capabilities(provider_id, name). Not a formal FK — composite PK target. */
    capabilityName: text("capability_name").notNull(),
    platform: text("platform").notNull(),
    platformRef: text("platform_ref").notNull(),
    status: text("status").notNull(),
    inputHash: text("input_hash"),
    outputHash: text("output_hash"),
    paymentProtocol: text("payment_protocol"),
    paymentStatus: text("payment_status"),
    paymentAmount: real("payment_amount"),
    paymentCurrency: text("payment_currency"),
    llmInputTokens: integer("llm_input_tokens"),
    llmOutputTokens: integer("llm_output_tokens"),
    llmEstimatedCost: real("llm_estimated_cost"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (_) => [
    textEnum("job_status_check", "status", JOB_STATUSES),
    textEnum("payment_status_check", "payment_status", PAYMENT_STATUSES),
  ],
);
