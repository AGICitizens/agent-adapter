import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";

export const capabilities = sqliteTable("capabilities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  source: text("source").notNull(),
  inputSchema: text("input_schema"),
  outputSchema: text("output_schema"),
  pricingAmount: real("pricing_amount"),
  pricingAsset: text("pricing_asset"),
  pricingRail: text("pricing_rail"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  metadata: text("metadata"),
  sourceHash: text("source_hash"),
  updatedAt: integer("updated_at").notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  capabilityId: text("capability_id").notNull(),
  status: text("status").notNull(),
  buyer: text("buyer"),
  paymentRail: text("payment_rail"),
  paymentTxHash: text("payment_tx_hash"),
  paymentAmount: text("payment_amount"),
  paymentAsset: text("payment_asset"),
  paymentChainId: integer("payment_chain_id"),
  request: text("request"),
  response: text("response"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  jobId: text("job_id"),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const secrets = sqliteTable("secrets", {
  key: text("key").primaryKey(),
  value: blob("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS capabilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  input_schema TEXT,
  output_schema TEXT,
  pricing_amount REAL,
  pricing_asset TEXT,
  pricing_rail TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata TEXT,
  source_hash TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  capability_id TEXT NOT NULL,
  status TEXT NOT NULL,
  buyer TEXT,
  payment_rail TEXT,
  payment_tx_hash TEXT,
  payment_amount TEXT,
  payment_asset TEXT,
  payment_chain_id INTEGER,
  request TEXT,
  response TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY,
  value BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
`;
