import type { WalletPlugin, WalletPluginFactory } from "@agent-adapter/contracts";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

export const createSolanaWallet: WalletPluginFactory = async (opts) => {
  let keypair: Keypair;

  if (opts.secretKeyBytes) {
    keypair = Keypair.fromSecretKey(opts.secretKeyBytes);
  } else if (opts.importKeyString) {
    const decoded = bs58.decode(opts.importKeyString);
    keypair = Keypair.fromSecretKey(decoded);
  } else {
    keypair = Keypair.generate();
  }

  const plugin: WalletPlugin = {
    id: "wallet-solana",
    chain: "solana",

    async getAddress() {
      return keypair.publicKey.toBase58();
    },

    async getBalance() {
      return {};
    },

    async signMessage(message: Uint8Array) {
      return nacl.sign.detached(message, keypair.secretKey);
    },

    async signTransaction(transaction: Uint8Array) {
      return nacl.sign.detached(transaction, keypair.secretKey);
    },
  };

  return {
    plugin,
    publicKey: keypair.publicKey.toBase58(),
    secretKey: keypair.secretKey,
  };
};
