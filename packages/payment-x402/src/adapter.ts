import { erc20Abi, type Log } from "viem";
import type {
  AssetRef,
  EvmAddress,
  PaymentAdapter,
  PaymentChallenge,
  PaymentQuote,
  PaymentReceipt,
} from "@agent-adapter/contracts";
import { EvmWallet } from "@agent-adapter/wallet-evm";
import { issueChallenge, parsePaymentHeader, type IssuedChallenge } from "./challenge.js";

export interface X402AdapterConfig {
  
  wallet: EvmWallet;
  
  payTo: EvmAddress;
  
  priceLookup: (capabilityId: string) => { amount: bigint; asset: AssetRef };
  
  challengeTtlSeconds?: number;
  
  escrowAddress?: EvmAddress;
}

export class X402Adapter implements PaymentAdapter {
  readonly rail = "x402" as const;

  private readonly consumedNonces = new Set<string>();

  constructor(private readonly config: X402AdapterConfig) {}

  async quote(args: { capabilityId: string }): Promise<PaymentQuote> {
    const price = this.config.priceLookup(args.capabilityId);
    return {
      rail: this.rail,
      amount: price.amount,
      asset: price.asset,
      chainId: this.config.wallet.chainId,
    };
  }

  async challenge(args: {
    quote: PaymentQuote;
    capabilityId: string;
  }): Promise<PaymentChallenge> {
    const issued = issueChallenge({
      capabilityId: args.capabilityId,
      amount: args.quote.amount,
      asset: args.quote.asset,
      chainId: args.quote.chainId,
      payTo: this.config.payTo,
      ttlSeconds: this.config.challengeTtlSeconds,
      escrowAddress: this.config.escrowAddress,
    });
    return issued;
  }

  async verify(args: {
    challenge: PaymentChallenge;
    claim: unknown;
  }): Promise<PaymentReceipt | null> {
    const { challenge } = args;
    if (challenge.expiresAt < Date.now()) return null;
    if (this.consumedNonces.has(challenge.nonce)) return null;

    let claim: ReturnType<typeof parsePaymentHeader>;
    try {
      claim =
        typeof args.claim === "string"
          ? parsePaymentHeader(args.claim)
          : parsePaymentHeader(JSON.stringify(args.claim ?? {}));
    } catch {
      return null;
    }

    if (claim.chainId !== challenge.chainId) return null;
    if (claim.nonce.toLowerCase() !== challenge.nonce.toLowerCase()) return null;

    const verified = await this.verifyOnChain(challenge as IssuedChallenge, claim.txHash);
    if (!verified) return null;

    this.consumedNonces.add(challenge.nonce);

    return {
      rail: this.rail,
      txHash: claim.txHash,
      payer: verified.payer,
      amount: verified.amount,
      asset: challenge.asset,
      chainId: challenge.chainId,
    };
  }

  private async verifyOnChain(
    challenge: IssuedChallenge,
    txHash: `0x${string}`,
  ): Promise<{ payer: EvmAddress; amount: bigint } | null> {
    const reader = this.config.wallet.reader();
    const receipt = await reader.getTransactionReceipt({ hash: txHash }).catch(() => null);
    if (!receipt || receipt.status !== "success") return null;

    if (this.config.escrowAddress) {
      return this.verifyEscrowEvent(receipt, challenge);
    }

    const tx = await reader.getTransaction({ hash: txHash }).catch(() => null);
    if (!tx) return null;

    if (challenge.asset === "native") {
      if (!tx.to || tx.to.toLowerCase() !== challenge.payTo.toLowerCase()) return null;
      if (tx.value < challenge.amount) return null;
      return { payer: tx.from as EvmAddress, amount: tx.value };
    }

    if (!tx.to || tx.to.toLowerCase() !== challenge.asset.toLowerCase()) return null;

    const iface = erc20Abi.find((entry) => entry.type === "function" && entry.name === "transfer");
    if (!iface) return null;

    const transferLog = receipt.logs.find(
      (log: Log) =>
        log.address.toLowerCase() === challenge.asset.toLowerCase() &&
        log.topics[0] === TRANSFER_TOPIC,
    );
    if (!transferLog) return null;

    const recipient = ("0x" + (transferLog.topics[2] ?? "").slice(26)).toLowerCase();
    if (recipient !== challenge.payTo.toLowerCase()) return null;

    const valueHex = transferLog.data;
    const transferred = BigInt(valueHex);
    if (transferred < challenge.amount) return null;

    const sender = ("0x" + (transferLog.topics[1] ?? "").slice(26)) as EvmAddress;
    return { payer: sender, amount: transferred };
  }

  private verifyEscrowEvent(
    receipt: { logs: readonly Log[] },
    challenge: IssuedChallenge,
  ): { payer: EvmAddress; amount: bigint } | null {
    const escrow = this.config.escrowAddress;
    if (!escrow) return null;

    const paidLog = receipt.logs.find(
      (log) =>
        log.address.toLowerCase() === escrow.toLowerCase() &&
        log.topics[0] === PAID_TOPIC &&
        (log.topics[1] ?? "").toLowerCase() === challenge.nonce.toLowerCase(),
    );
    if (!paidLog) return null;

    const payerTopic = paidLog.topics[2] ?? "";
    const payeeTopic = paidLog.topics[3] ?? "";
    if (!payerTopic || !payeeTopic) return null;

    const payer = ("0x" + payerTopic.slice(26)) as EvmAddress;
    const payee = ("0x" + payeeTopic.slice(26)).toLowerCase();
    if (payee !== challenge.payTo.toLowerCase()) return null;

    const amount = BigInt(paidLog.data);
    if (amount < challenge.amount) return null;

    return { payer, amount };
  }
}

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as `0x${string}`;

const PAID_TOPIC =
  "0x37db9851b6c9a32f8ddcf4734e6526de7c85268ef735f7883ea70dc8a39c9c85" as `0x${string}`;
