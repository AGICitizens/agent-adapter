import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Supabase user ID — null in self-hosted mode. */
  externalAuthId: text("external_auth_id"),
  plan: text("plan").notNull().default("free"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
