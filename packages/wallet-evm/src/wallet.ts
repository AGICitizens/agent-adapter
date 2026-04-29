import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type TransactionRequest,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type {
  ChainId,
  EvmAddress,
  SignTypedDataArgs,
  TxRequest,
  WalletPlugin,
} from "@agent-adapter/contracts";

export interface EvmWalletConfig {
  chainId: ChainId;
  rpcUrl: string;
  privateKey: Hex;
  /** Optional human-readable name; defaults to `chain-${chainId}`. */
  name?: string;
  /** Optional native symbol; defaults to "ETH". */
  symbol?: string;
}

/**
 * Build a `WalletPlugin` backed by viem. One instance signs on a single chain;
 * register multiple instances (one per chain) with the runtime to support
 * multichain flows like 0G Galileo for payments + Sepolia for ENS.
 */
export function createEvmWallet(config: EvmWalletConfig): EvmWallet {
  return new EvmWallet(config);
}

export class EvmWallet implements WalletPlugin {
  readonly chainId: ChainId;
  readonly address: EvmAddress;

  private readonly account: Account;
  private readonly chain: Chain;
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;

  constructor(config: EvmWalletConfig) {
    this.account = privateKeyToAccount(config.privateKey);
    this.address = this.account.address as EvmAddress;
    this.chainId = config.chainId;

    this.chain = defineChain({
      id: config.chainId,
      name: config.name ?? `chain-${config.chainId}`,
      nativeCurrency: {
        decimals: 18,
        name: config.symbol ?? "ETH",
        symbol: config.symbol ?? "ETH",
      },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(config.rpcUrl),
    });

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl),
    });
  }

  async signMessage(message: string | Uint8Array): Promise<Hex> {
    const payload = typeof message === "string" ? message : { raw: toHex(message) };
    return this.walletClient.signMessage({
      account: this.account,
      message: payload,
    });
  }

  async signTypedData(args: SignTypedDataArgs): Promise<Hex> {
    return this.walletClient.signTypedData({
      account: this.account,
      domain: args.domain,
      // viem's typed-data API expects the types and primaryType directly.
      types: args.types as Parameters<WalletClient["signTypedData"]>[0]["types"],
      primaryType: args.primaryType,
      message: args.message,
    });
  }

  async sendTransaction(tx: TxRequest): Promise<Hex> {
    const request: TransactionRequest = {
      to: tx.to as Address | undefined,
      data: tx.data,
      value: tx.value,
      gas: tx.gas,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    };
    return this.walletClient.sendTransaction({
      ...request,
      account: this.account,
      chain: this.chain,
    });
  }

  /** Read-only client for verification — exposed so payment adapters can verify tx state. */
  reader(): PublicClient {
    return this.publicClient;
  }
}

function toHex(bytes: Uint8Array): Hex {
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex as Hex;
}
