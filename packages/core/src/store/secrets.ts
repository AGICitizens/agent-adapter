import { eq, and } from "drizzle-orm";
import type { SecretsBackend } from "@agent-adapter/contracts";
import type { DatabaseConnection } from "../db/index.js";
import { schema } from "../db/index.js";
import { encrypt, decrypt } from "./crypto.js";

export const createSecretsStore = (
  conn: DatabaseConnection,
  providerId: string,
  encryptionKey: Uint8Array,
): SecretsBackend => {
  const { db } = conn;
  const { secrets } = schema;

  return {
    async set(platform, key, value) {
      const now = new Date().toISOString();
      const encryptedValue = encrypt(encryptionKey, value);
      db.insert(secrets)
        .values({
          providerId,
          platform,
          key,
          encryptedValue,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [secrets.providerId, secrets.platform, secrets.key],
          set: { encryptedValue, updatedAt: now },
        })
        .run();
    },

    async get(platform, key) {
      const row = db
        .select({ encryptedValue: secrets.encryptedValue })
        .from(secrets)
        .where(
          and(
            eq(secrets.providerId, providerId),
            eq(secrets.platform, platform),
            eq(secrets.key, key),
          ),
        )
        .get();
      if (!row) return null;
      return decrypt(encryptionKey, row.encryptedValue);
    },

    async delete(platform, key) {
      const result = db
        .delete(secrets)
        .where(
          and(
            eq(secrets.providerId, providerId),
            eq(secrets.platform, platform),
            eq(secrets.key, key),
          ),
        )
        .run();
      return result.changes > 0;
    },

    async listKeys(platform) {
      const rows = db
        .select({ key: secrets.key })
        .from(secrets)
        .where(
          and(
            eq(secrets.providerId, providerId),
            eq(secrets.platform, platform),
          ),
        )
        .all();
      return rows.map((r) => r.key);
    },
  };
};
