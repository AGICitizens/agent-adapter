import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { providers } from "./providers.js";

export const secrets = sqliteTable(
  "secrets",
  {
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    /** Scoping key — e.g. "twitter", "openai". Not FK'd to platforms (secrets can exist before registration). */
    platform: text("platform").notNull(),
    /** Credential identifier — e.g. "api_key", "api_secret", "webhook_secret". */
    key: text("key").notNull(),
    /** AES-256-GCM encrypted value. */
    encryptedValue: text("encrypted_value").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.providerId, table.platform, table.key] }),
  ],
);
