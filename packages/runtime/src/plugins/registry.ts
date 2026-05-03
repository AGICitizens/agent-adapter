import type {
  ExtensionPlugin,
  PaymentAdapter,
  PaymentRail,
  Store,
  WalletPlugin,
} from "@agent-adapter/contracts";

export interface PluginRegistry {
  
  wallets: Map<number, WalletPlugin>;
  payments: Map<PaymentRail, PaymentAdapter>;
  extensions: ExtensionPlugin[];
  store: Store;
}

export function createPluginRegistry(store: Store): PluginRegistry {
  return {
    wallets: new Map(),
    payments: new Map(),
    extensions: [],
    store,
  };
}

export function registerWallet(registry: PluginRegistry, wallet: WalletPlugin): void {
  registry.wallets.set(wallet.chainId, wallet);
}

export function registerPayment(registry: PluginRegistry, adapter: PaymentAdapter): void {
  registry.payments.set(adapter.rail, adapter);
}

export function registerExtension(registry: PluginRegistry, extension: ExtensionPlugin): void {
  registry.extensions.push(extension);
}
