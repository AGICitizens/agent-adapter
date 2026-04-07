import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { providers } from "./providers.js";

export const inboundEvents = sqliteTable("inbound_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  providerId: text("provider_id")
    .notNull()
    .references(() => providers.id),
  sourceType: text("source_type").notNull(),
  source: text("source").notNull(),
  channel: text("channel"),
  eventType: text("event_type").notNull(),
  /** JSON-serialized event payload. */
  payload: text("payload").notNull(),
  /** JSON-serialized headers. */
  headers: text("headers"),
  receivedAt: text("received_at").notNull(),
  deliveredAt: text("delivered_at"),
});
