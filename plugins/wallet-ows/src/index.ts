import type { WalletPlugin, WalletPluginInit } from "@agent-adapter/contracts";
import {
  createWallet,
  getWallet,
  importWalletMnemonic,
  importWalletPrivateKey,
  signMessage as owsSignMessage,
  signTransaction as owsSignTransaction,
  type WalletInfo,
} from "@open-wallet-standard/core";

// ── CAIP-2 helpers ───────────────────────────────────────────────────────

const CAIP2_PREFIXES: Record<string, string> = {
  "eip155:": "evm",
  "solana:": "solana",
  "stellar:": "stellar",
  "cosmos:": "cosmos",
  "bip122:": "bitcoin",
  "ton:": "ton",
};

function chainFamily(chainOrCaip2: string): string {
  for (const [prefix, family] of Object.entries(CAIP2_PREFIXES)) {
    if (chainOrCaip2.startsWith(prefix)) return family;
  }
  return chainOrCaip2;
}

// ── OWS Wallet Factory ──────────────────────────────────────────────────

export interface OwsWalletOpts {
  importKeyString?: string;
  encryptionKey: Uint8Array;
  vaultPath: string;
  providerId: string;
}

export async function createOwsWallet(
  opts: OwsWalletOpts,
): Promise<WalletPluginInit> {
  const { encryptionKey, vaultPath, providerId, importKeyString } = opts;

  const walletName = `agent-adapter-${providerId}`;
  const passphrase = Buffer.from(encryptionKey).toString("hex").slice(0, 32);

  // Try loading existing wallet from vault first (idempotent restart)
  let walletInfo: WalletInfo;
  try {
    walletInfo = getWallet(walletName, vaultPath);
  } catch {
    // Wallet doesn't exist in vault yet — create or import
    if (importKeyString) {
      const isLikelyMnemonic = importKeyString.includes(" ");
      if (isLikelyMnemonic) {
        walletInfo = importWalletMnemonic(
          walletName,
          importKeyString,
          passphrase,
          0,
          vaultPath,
        );
      } else {
        walletInfo = importWalletPrivateKey(
          walletName,
          importKeyString,
          passphrase,
          vaultPath,
        );
      }
    } else {
      walletInfo = createWallet(walletName, passphrase, 12, vaultPath);
    }
  }

  // Build chain → address lookup from wallet accounts
  const accountsByFamily = new Map<string, string>();
  for (const account of walletInfo.accounts) {
    accountsByFamily.set(chainFamily(account.chainId), account.address);
  }

  const supportedChains = [...accountsByFamily.keys()];
  const primaryAddress = walletInfo.accounts[0]?.address ?? "";

  const plugin: WalletPlugin = {
    id: "wallet-ows",
    chain: "ows",

    async getAddress(chain?: string) {
      const family = chain ? chainFamily(chain) : supportedChains[0]!;
      const address = accountsByFamily.get(family);
      if (!address) {
        throw new Error(
          `OWS wallet has no account for chain "${chain}". Available: ${supportedChains.join(", ")}`,
        );
      }
      return address;
    },

    async getBalance() {
      return {};
    },

    async signMessage(message: Uint8Array, chain?: string) {
      const family = chain ? chainFamily(chain) : supportedChains[0]!;
      const msgHex = Buffer.from(message).toString("hex");
      const result = owsSignMessage(
        walletName,
        family,
        msgHex,
        passphrase,
        "hex",
        0,
        vaultPath,
      );
      return Uint8Array.from(Buffer.from(result.signature, "hex"));
    },

    async signTransaction(transaction: Uint8Array, chain?: string) {
      const family = chain ? chainFamily(chain) : supportedChains[0]!;
      const txHex = Buffer.from(transaction).toString("hex");
      const result = owsSignTransaction(
        walletName,
        family,
        txHex,
        passphrase,
        0,
        vaultPath,
      );
      return Uint8Array.from(Buffer.from(result.signature, "hex"));
    },
  };

  // No secretKey — OWS vault manages its own key material
  return {
    plugin,
    publicKey: primaryAddress,
    supportedChains,
  };
}
