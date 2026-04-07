import { eq, and, like, asc, desc } from "drizzle-orm";
import type { StateBackend } from "@agent-adapter/contracts";
import type { DatabaseConnection } from "../db/index.js";
import { schema } from "../db/index.js";

export const createStateStore = (
  conn: DatabaseConnection,
  providerId: string,
): StateBackend => {
  const { db } = conn;
  const { state } = schema;

  return {
    async get(namespace, key) {
      const row = db
        .select({ data: state.data })
        .from(state)
        .where(
          and(
            eq(state.providerId, providerId),
            eq(state.namespace, namespace),
            eq(state.key, key),
          ),
        )
        .get();
      if (!row) return null;
      return JSON.parse(row.data) as unknown;
    },

    async set(namespace, key, value) {
      const now = new Date().toISOString();
      const data = JSON.stringify(value);
      db.insert(state)
        .values({ providerId, namespace, key, data, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [state.providerId, state.namespace, state.key],
          set: { data, updatedAt: now },
        })
        .run();
    },

    async query(namespace, opts) {
      const conditions = [
        eq(state.providerId, providerId),
        eq(state.namespace, namespace),
      ];
      if (opts?.prefix) {
        conditions.push(like(state.key, `${opts.prefix}%`));
      }

      const orderCol = opts?.orderBy === "updatedAt" ? state.updatedAt : state.key;
      const orderFn = opts?.order === "desc" ? desc : asc;

      let query = db
        .select({ key: state.key, data: state.data, updatedAt: state.updatedAt })
        .from(state)
        .where(and(...conditions))
        .orderBy(orderFn(orderCol))
        .$dynamic();

      if (opts?.limit !== undefined) {
        query = query.limit(opts.limit);
      }
      if (opts?.offset !== undefined) {
        query = query.offset(opts.offset);
      }

      const rows = query.all();
      return rows.map((r) => ({
        key: r.key,
        data: JSON.parse(r.data) as unknown,
        updatedAt: r.updatedAt,
      }));
    },

    async delete(namespace, key) {
      const result = db
        .delete(state)
        .where(
          and(
            eq(state.providerId, providerId),
            eq(state.namespace, namespace),
            eq(state.key, key),
          ),
        )
        .run();
      return result.changes > 0;
    },

    async batchSet(namespace, entries) {
      const now = new Date().toISOString();
      db.transaction((tx) => {
        for (const entry of entries) {
          const data = JSON.stringify(entry.data);
          tx.insert(state)
            .values({ providerId, namespace, key: entry.key, data, createdAt: now, updatedAt: now })
            .onConflictDoUpdate({
              target: [state.providerId, state.namespace, state.key],
              set: { data, updatedAt: now },
            })
            .run();
        }
      });
    },
  };
};
