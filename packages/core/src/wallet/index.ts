import { eq } from "drizzle-orm";
import type {
  WalletPlugin,
  WalletRegistry,
  WalletConfig,
  WalletPluginInit,
  WalletPluginFactory,
} from "@agent-adapter/contracts";
import type { DatabaseConnection } from "../db/index.js";
import { schema } from "../db/index.js";
import { encrypt, decrypt } from "../store/crypto.js";

export type { WalletPluginInit, WalletPluginFactory };

// ── CAIP-2 Resolution ────────────────────────────────────────────────────

const CAIP2_PREFIXES: Record<string, string> = {
  "eip155:": "evm",
  "solana:": "solana",
  "stellar:": "stellar",
  "cosmos:": "cosmos",
  "bip122:": "bitcoin",
  "ton:": "ton",
};

/** Resolve a CAIP-2 chain identifier to its chain family. Plain family names pass through. */
export function chainFamily(chainOrCaip2: string): string {
  for (const [prefix, family] of Object.entries(CAIP2_PREFIXES)) {
    if (chainOrCaip2.startsWith(prefix)) return family;
  }
  return chainOrCaip2;
}

// ── Sentinel ─────────────────────────────────────────────────────────────

const VAULT_MANAGED = "vault-managed";

// ── Registry Factory ─────────────────────────────────────────────────────

export async function createWalletRegistry(opts: {
  conn: DatabaseConnection;
  providerId: string;
  encryptionKey: Uint8Array;
  config: WalletConfig;
  pluginFactory: WalletPluginFactory;
}): Promise<WalletRegistry> {
  const { conn, providerId, encryptionKey, config, pluginFactory } = opts;
  const { db } = conn;
  const { wallets } = schema;

  // 1. Load existing rows from DB
  const existingRows = db
    .select()
    .from(wallets)
    .where(eq(wallets.providerId, providerId))
    .all();

  // 2. Determine how to initialise the plugin
  let init: WalletPluginInit;
  const primaryRow = existingRows[0];

  if (primaryRow && primaryRow.encryptedPrivateKey !== VAULT_MANAGED) {
    // Registry-managed: decrypt secret key from DB
    const hex = decrypt(encryptionKey, primaryRow.encryptedPrivateKey);
    const secretKeyBytes = Uint8Array.from(Buffer.from(hex, "hex"));
    init = await pluginFactory({ secretKeyBytes });
  } else if (primaryRow && primaryRow.encryptedPrivateKey === VAULT_MANAGED) {
    // Plugin-managed (vault): just initialise — plugin handles its own persistence
    init = await pluginFactory({ importKeyString: config.importKey });
  } else {
    // No existing wallet — fresh generation or import
    init = await pluginFactory({ importKeyString: config.importKey });
  }

  // 3. Persist if needed
  const now = new Date().toISOString();

  if (!primaryRow && init.secretKey) {
    // Registry-managed: encrypt and store
    const hex = Buffer.from(init.secretKey).toString("hex");
    const encryptedPrivateKey = encrypt(encryptionKey, hex);
    db.insert(wallets)
      .values({
        providerId,
        chain: init.plugin.chain,
        publicKey: init.publicKey,
        encryptedPrivateKey,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [wallets.providerId, wallets.chain],
        set: { encryptedPrivateKey, publicKey: init.publicKey },
      })
      .run();
  } else if (!primaryRow && !init.secretKey) {
    // Vault-managed: store reference row with sentinel
    db.insert(wallets)
      .values({
        providerId,
        chain: init.plugin.chain,
        publicKey: init.publicKey,
        encryptedPrivateKey: VAULT_MANAGED,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [wallets.providerId, wallets.chain],
        set: { publicKey: init.publicKey },
      })
      .run();
  }

  // 4. Build chain → plugin map
  const plugins = new Map<string, WalletPlugin>();
  plugins.set(init.plugin.chain, init.plugin);

  // For multi-chain plugins, index each supported chain as an alias
  if (init.supportedChains) {
    for (const chain of init.supportedChains) {
      plugins.set(chain, init.plugin);
    }
  }

  // 5. Return WalletRegistry
  return {
    get(chain: string): WalletPlugin {
      const resolved = plugins.get(chain) ?? plugins.get(chainFamily(chain));
      if (!resolved) {
        throw new Error(
          `No wallet configured for chain "${chain}". Available: ${[...new Set(plugins.keys())].join(", ")}`,
        );
      }
      return resolved;
    },

    list(): WalletPlugin[] {
      // Deduplicate — multi-chain aliases point to same instance
      return [...new Set(plugins.values())];
    },

    primary(): WalletPlugin {
      const first = plugins.values().next();
      if (first.done) {
        throw new Error("No wallet plugins configured");
      }
      return first.value;
    },

    has(chain: string): boolean {
      return plugins.has(chain) || plugins.has(chainFamily(chain));
    },
  };
}
