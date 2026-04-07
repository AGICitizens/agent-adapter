import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { providers } from "./providers.js";

export const llmUsage = sqliteTable("llm_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  providerId: text("provider_id")
    .notNull()
    .references(() => providers.id),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  estimatedCost: real("estimated_cost"),
  currency: text("currency"),
  createdAt: text("created_at").notNull(),
});
