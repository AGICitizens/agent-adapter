import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { providers } from "./providers.js";

export const state = sqliteTable(
  "state",
  {
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    /** Plugin/module namespace — e.g. "drv_agic:task_cache", "core:settings". */
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    /** JSON-serialized value. */
    data: text("data").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.providerId, table.namespace, table.key] }),
  ],
);
