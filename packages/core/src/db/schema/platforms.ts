import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { providers } from "./providers.js";

export const platforms = sqliteTable(
  "platforms",
  {
    providerId: text("provider_id")
      .references(() => providers.id)
      .notNull(),
    baseUrl: text("base_url").notNull(),
    platformName: text("platform_name").notNull(),
    agentId: text("agent_id"),
    lastActiveAt: text("last_active_at"),
    metadata: text("metadata"), // JSON string
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.providerId, table.baseUrl] })],
);
