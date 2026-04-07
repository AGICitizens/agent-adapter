import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "node:path";
import type { DatabaseAdapter } from "@agent-adapter/contracts";
import * as schema from "./schema/index.js";

export interface SqliteConnection {
  readonly adapter: DatabaseAdapter;
  readonly db: BetterSQLite3Database<typeof schema>;
}

export function createSqlite(path: string): SqliteConnection {
  const connection = new Database(path);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");

  const db = drizzle(connection, { schema });

  const adapter: DatabaseAdapter = {
    dialect: "sqlite",

    async initialize() {
      migrate(db, {
        migrationsFolder: resolve(import.meta.dirname, "../../migrations"),
      });

      // Seed default provider for self-hosted mode
      db.insert(schema.providers)
        .values({
          id: "default",
          name: "Default Provider",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .run();
    },

    async close() {
      connection.close();
    },
  };

  return { adapter, db };
}
