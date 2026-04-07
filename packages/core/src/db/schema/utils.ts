import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/sqlite-core";

/**
 * Creates a SQLite CHECK constraint that restricts a text column
 * to a set of allowed values (mimics an enum).
 */
export const textEnum = (
  name: string,
  column: string,
  values: readonly string[],
) => {
  const list = values.map((v) => `'${v}'`).join(", ");
  return check(name, sql.raw(`${column} IN (${list})`));
};
