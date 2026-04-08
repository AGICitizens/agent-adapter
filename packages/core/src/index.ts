/**
 * @agent-adapter/core
 *
 * Runtime context factory — connects DB, loads wallet registry,
 * initializes registries, returns RuntimeContext.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AdapterConfig,
  PaymentAdapter,
  ProviderContext,
  RuntimeAPI,
  ToolPlugin,
  WalletPluginFactory,
} from "@agent-adapter/contracts";
import { createCapabilityRegistry, type CapabilityRegistry } from "./capabilities/index.js";
import { createDb, type DatabaseConnection } from "./db/index.js";
import { createJobEngine } from "./jobs/index.js";
import type { PaymentRegistry } from "./payments/index.js";
import { createPaymentRegistry } from "./payments/index.js";
import { createSecretsStore } from "./store/secrets.js";
import { createStateStore } from "./store/state.js";
import { parseEncryptionKey } from "./store/crypto.js";
import { createToolHandlers, type ToolHandlers } from "./tools/index.js";
import { createWalletRegistry, type WalletPluginInit } from "./wallet/index.js";

const DEFAULT_PROVIDER_ID = "default";
const DEFAULT_OWS_VAULT_PATH = ".agent-adapter/ows";

export interface RuntimeContext {
  readonly config: AdapterConfig;
  readonly provider: ProviderContext;
  readonly db: DatabaseConnection;
  readonly capabilities: CapabilityRegistry;
  readonly payments: PaymentRegistry;
  readonly jobs: ReturnType<typeof createJobEngine>;
  readonly wallets: Awaited<ReturnType<typeof createWalletRegistry>>;
  readonly secrets: ReturnType<typeof createSecretsStore>;
  readonly state: ReturnType<typeof createStateStore>;
  readonly tools: ToolHandlers;
  readonly api: RuntimeAPI;
  close(): Promise<void>;
}

export interface CreateRuntimeOptions {
  providerId?: string;
}

const tryImport = async (specifier: string): Promise<unknown | undefined> => {
  try {
    return await import(specifier);
  } catch {
    return undefined;
  }
};

const repoPluginEntryCandidates = (segments: string[]): [string, string] => {
  const base = resolve(import.meta.dirname, "../../../", ...segments);
  return [
    pathToFileURL(resolve(base, "dist/index.js")).href,
    pathToFileURL(resolve(base, "src/index.ts")).href,
  ];
};

const loadBundledWalletFactory = async (
  pluginName: string,
  opts: {
    providerId: string;
    encryptionKey: Uint8Array;
    importKeyString?: string;
  },
): Promise<WalletPluginFactory> => {
  const normalized = pluginName.toLowerCase();

  if (
    normalized === "wallet-solana" ||
    normalized === "@agent-adapter/wallet-solana" ||
    normalized === "solana"
  ) {
    const [solanaDistEntry, solanaSrcEntry] = repoPluginEntryCandidates([
      "plugins",
      "wallet-solana",
    ]);
    const module =
      (await tryImport("@agent-adapter/wallet-solana")) ??
      (await tryImport(solanaDistEntry)) ??
      (await tryImport(solanaSrcEntry));
    const factory = (module as { createSolanaWallet?: WalletPluginFactory } | undefined)
      ?.createSolanaWallet;
    if (!factory) {
      throw new Error('Failed to load bundled wallet plugin "wallet-solana"');
    }
    return factory;
  }

  if (
    normalized === "wallet-ows" ||
    normalized === "@agent-adapter/wallet-ows" ||
    normalized === "ows"
  ) {
    const [owsDistEntry, owsSrcEntry] = repoPluginEntryCandidates([
      "plugins",
      "wallet-ows",
    ]);
    const module =
      (await tryImport("@agent-adapter/wallet-ows")) ??
      (await tryImport(owsDistEntry)) ??
      (await tryImport(owsSrcEntry));
    const createOwsWallet = (
      module as {
        createOwsWallet?: (opts: {
          importKeyString?: string;
          encryptionKey: Uint8Array;
          vaultPath: string;
          providerId: string;
        }) => Promise<WalletPluginInit>;
      } | undefined
    )?.createOwsWallet;

    if (!createOwsWallet) {
      throw new Error('Failed to load bundled wallet plugin "wallet-ows"');
    }

    return async ({ importKeyString, secretKeyBytes }) => {
      if (secretKeyBytes) {
        throw new Error(
          "wallet-ows is vault-managed and cannot be rehydrated from registry secretKeyBytes",
        );
      }

      return createOwsWallet({
        providerId: opts.providerId,
        encryptionKey: opts.encryptionKey,
        importKeyString: importKeyString ?? opts.importKeyString,
        vaultPath: resolve(process.cwd(), DEFAULT_OWS_VAULT_PATH),
      });
    };
  }

  if (
    normalized === "wallet-hosted" ||
    normalized === "@agent-adapter/wallet-hosted" ||
    normalized === "hosted"
  ) {
    throw new Error("wallet-hosted is planned but not implemented yet");
  }

  throw new Error(
    `Unsupported wallet plugin "${pluginName}". Supported today: wallet-solana, wallet-ows`,
  );
};

const loadBundledPaymentAdapter = async (
  type: string,
): Promise<PaymentAdapter> => {
  const normalized = type.toLowerCase();

  if (
    normalized === "free" ||
    normalized === "payment-free" ||
    normalized === "@agent-adapter/payment-free"
  ) {
    const [freeDistEntry, freeSrcEntry] = repoPluginEntryCandidates([
      "plugins",
      "payment-free",
    ]);
    const module =
      (await tryImport("@agent-adapter/payment-free")) ??
      (await tryImport(freeDistEntry)) ??
      (await tryImport(freeSrcEntry));
    const factory = (module as { createFreeAdapter?: () => PaymentAdapter } | undefined)
      ?.createFreeAdapter;
    if (!factory) {
      throw new Error('Failed to load bundled payment adapter "free"');
    }
    return factory();
  }

  if (
    normalized === "x402" ||
    normalized === "payment-x402" ||
    normalized === "@agent-adapter/payment-x402"
  ) {
    throw new Error("payment-x402 is planned but not implemented yet");
  }

  throw new Error(
    `Unsupported payment adapter "${type}". Supported today: free`,
  );
};

const loadToolPlugin = async (packageName: string): Promise<ToolPlugin> => {
  const module = (await tryImport(packageName)) as
    | { default?: ToolPlugin; plugin?: ToolPlugin }
    | undefined;
  const plugin = module?.default ?? module?.plugin;

  if (!plugin) {
    throw new Error(
      `Failed to load tool plugin "${packageName}". Expected a default export or named "plugin" export.`,
    );
  }

  return plugin;
};

export const createRuntime = async (
  config: AdapterConfig,
  options: CreateRuntimeOptions = {},
): Promise<RuntimeContext> => {
  const providerId = options.providerId ?? DEFAULT_PROVIDER_ID;

  if (!config.secrets?.encryptionKey) {
    throw new Error(
      "createRuntime requires secrets.encryptionKey so wallet keys and secrets can be encrypted at rest",
    );
  }

  const provider: ProviderContext = { providerId };
  const encryptionKey = parseEncryptionKey(config.secrets.encryptionKey);

  const db = await createDb(config.database);
  await db.adapter.initialize();

  const walletFactory = await loadBundledWalletFactory(config.wallet.plugin, {
    providerId,
    encryptionKey,
    importKeyString: config.wallet.importKey,
  });
  const wallets = await createWalletRegistry({
    conn: db,
    providerId,
    encryptionKey,
    config: config.wallet,
    pluginFactory: walletFactory,
  });

  const secrets = createSecretsStore(db, providerId, encryptionKey);
  const state = createStateStore(db, providerId);
  const capabilities = createCapabilityRegistry(db, providerId, config.capabilities);
  await capabilities.refresh();

  const jobs = createJobEngine(db, providerId);
  const payments = createPaymentRegistry();
  for (const adapterConfig of config.payments) {
    payments.register(await loadBundledPaymentAdapter(adapterConfig.type));
  }

  const tools = createToolHandlers({
    provider,
    capabilities,
    wallets,
    secrets,
    state,
    jobs,
    payments,
  });

  const api: RuntimeAPI = {
    provider,
    wallets,
    secrets,
    getCapability(name) {
      return capabilities.getCapability(name);
    },
    listCapabilities() {
      return capabilities.listCapabilities();
    },
    async getJob(id) {
      return jobs.get(id);
    },
    async getState(namespace, key) {
      return state.get(namespace, key);
    },
    async setState(namespace, key, value) {
      await state.set(namespace, key, value);
    },
    async stateQuery(namespace, opts) {
      return state.query(namespace, opts);
    },
    async stateDelete(namespace, key) {
      return state.delete(namespace, key);
    },
    async stateBatchSet(namespace, entries) {
      await state.batchSet(namespace, entries);
    },
    registerTools(plugin) {
      tools.registerPlugin(plugin);
    },
  };

  const loadedPlugins: ToolPlugin[] = [];
  try {
    for (const pluginConfig of config.plugins) {
      const plugin = await loadToolPlugin(pluginConfig.package);
      await plugin.initialize(api);
      tools.registerPlugin(plugin);
      loadedPlugins.push(plugin);
    }
  } catch (error) {
    await Promise.allSettled(loadedPlugins.map((plugin) => plugin.shutdown()));
    await db.adapter.close();
    throw error;
  }

  return {
    config,
    provider,
    db,
    capabilities,
    payments,
    jobs,
    wallets,
    secrets,
    state,
    tools,
    api,
    async close() {
      await Promise.allSettled(
        loadedPlugins
          .slice()
          .reverse()
          .map((plugin) => plugin.shutdown()),
      );
      await db.adapter.close();
    },
  };
};

export { createDb } from "./db/index.js";
export { createCapabilityRegistry } from "./capabilities/index.js";
export { createPaymentRegistry } from "./payments/index.js";
export { createJobEngine } from "./jobs/index.js";
export { createSecretsStore, createStateStore } from "./store/index.js";
export { createToolHandlers } from "./tools/index.js";
export { createWalletRegistry } from "./wallet/index.js";
