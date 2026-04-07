import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { providers } from "./providers.js";

export const decisionLog = sqliteTable("decision_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  providerId: text("provider_id")
    .notNull()
    .references(() => providers.id),
  action: text("action").notNull(),
  platform: text("platform"),
  /** JSON-serialized detail payload. */
  detail: text("detail"),
  createdAt: text("created_at").notNull(),
});
