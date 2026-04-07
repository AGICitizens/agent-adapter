/**
 * Database adapter interface for dialect-agnostic persistence.
 */

export interface DatabaseAdapter {
  readonly dialect: "sqlite" | "postgres";

  /** Initialize schema / run migrations. */
  initialize(): Promise<void>;

  /** Close the database connection. */
  close(): Promise<void>;
}
