import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { providers } from "./providers.js";

export const wallets = sqliteTable(
  "wallets",
  {
    providerId: text("provider_id")
      .references(() => providers.id)
      .notNull(),
    /** CAIP-2 chain family — e.g. "solana", "evm", "ows". */
    chain: text("chain").notNull(),
    publicKey: text("public_key").notNull(),
    /** AES-256-GCM encrypted private key. */
    encryptedPrivateKey: text("encrypted_private_key").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.providerId, table.chain] })],
);
