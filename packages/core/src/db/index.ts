import type { DatabaseAdapter, DatabaseConfig } from "@agent-adapter/contracts";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "./schema/index.js";

export * as schema from "./schema/index.js";

/** Core-internal database handle — includes the typed Drizzle instance. */
export interface DatabaseConnection {
  readonly adapter: DatabaseAdapter;
  readonly db: BetterSQLite3Database<typeof schema>;
}

export async function createDb(
  config: DatabaseConfig,
): Promise<DatabaseConnection> {
  if (config.driver === "postgres") {
    throw new Error(
      "Hosted/Postgres mode is not implemented yet. Use self-hosted SQLite for now.",
    );
  }

  const { createSqlite } = await import("./sqlite.js");
  return createSqlite(config.path ?? "adapter.db");
}
