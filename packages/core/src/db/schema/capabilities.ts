import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { providers } from "./providers.js";
import { textEnum } from "./utils.js";
import {
  CAPABILITY_SOURCE_TYPES,
  HTTP_METHODS,
} from "../../../../contracts/src/constants.js";

export const capabilities = sqliteTable(
  "capabilities",
  {
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    name: text("name").notNull(),
    description: text("description"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    source: text("source").notNull(),
    inputSchema: text("input_schema"), // JSON string
    outputSchema: text("output_schema"),
    executionMethod: text("execution_method"),
    executionUrl: text("execution_url"),
    executionHeaders: text("execution_headers"),
    executionBodyTemplate: text("execution_body_template"),
    pricingModel: text("pricing_model"),
    pricingAmount: real("pricing_amount"),
    pricingCurrency: text("pricing_currency"),
    pricingItemField: text("pricing_item_field"),
    floor: real("floor"),
    ceiling: real("ceiling"),
    customerDescription: text("customer_description"),
    sourceHash: text("source_hash"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.providerId, table.name] }),
    textEnum("source_check", "source", CAPABILITY_SOURCE_TYPES),
    textEnum("execution_method_check", "execution_method", HTTP_METHODS),
  ],
);
