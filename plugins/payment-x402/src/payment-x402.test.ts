import { describe, expect, it, vi } from "vitest";
import type { PaymentChallenge, WalletPlugin, WalletRegistry } from "@agent-adapter/contracts";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { Network, PaymentRequired } from "@x402/core/types";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  createX402Adapter,
  fetchWithX402,
  parseX402PaymentRequiredResponse,
} from "./index.js";

const baseChallenge: PaymentChallenge = {
  type: "x402",
  network: "solana:mainnet",
  payTo: "provider-address",
  amount: "1000",
  currency: "USDC",
  resource: "/proxy/translate",
  scheme: "exact",
};

const createWalletRegistry = (
  entries: Record<string, WalletPlugin>,
): WalletRegistry => ({
  get(chain: string) {
    const plugin = entries[chain] ?? entries[chain.startsWith("eip155:") ? "evm" : "solana"];
    if (!plugin) {
      throw new Error(`No wallet configured for chain: ${chain}`);
    }
    return plugin;
  },
  list() {
    return [...new Set(Object.values(entries))];
  },
  primary() {
    return Object.values(entries)[0]!;
  },
  has(chain: string) {
    return !!entries[chain] || !!entries[chain.startsWith("eip155:") ? "evm" : "solana"];
  },
});

describe("payment-x402 adapter", () => {
  it("parses a multi-chain payment required response", () => {
    const paymentRequired: PaymentRequired = {
      x402Version: 2 as const,
      error: "payment_required",
      resource: { url: "/proxy/translate" },
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453" as Network,
          amount: "1000",
          asset: "USDC",
          payTo: "0xabc",
          maxTimeoutSeconds: 300,
          extra: {},
        },
        {
          scheme: "exact",
          network: "solana:mainnet" as Network,
          amount: "1000",
          asset: "USDC",
          payTo: "sol-address",
          maxTimeoutSeconds: 300,
          extra: {},
        },
      ],
    };

    const parsed = parseX402PaymentRequiredResponse({
      paymentRequiredHeader: encodePaymentRequiredHeader(paymentRequired),
    });

    expect(parsed).toEqual([
      expect.objectContaining({
        type: "x402",
        network: "eip155:8453",
        payTo: "0xabc",
        amount: "1000",
        currency: "USDC",
        resource: "/proxy/translate",
        scheme: "exact",
      }),
      expect.objectContaining({
        type: "x402",
        network: "solana:mainnet",
        payTo: "sol-address",
      }),
    ]);
  });

  it("resolves the correct wallet by challenge chain", async () => {
    const solanaKeypair = nacl.sign.keyPair();
    const calls: string[] = [];

    const registry = createWalletRegistry({
      evm: {
        id: "evm-wallet",
        chain: "evm",
        async getAddress() {
          calls.push("evm:getAddress");
          return "0x1111111111111111111111111111111111111111";
        },
        async getBalance() {
          return {};
        },
        async signMessage() {
          calls.push("evm:signMessage");
          return new Uint8Array([1, 2, 3]);
        },
        async signTransaction() {
          return new Uint8Array();
        },
      },
      solana: {
        id: "sol-wallet",
        chain: "solana",
        async getAddress() {
          calls.push("solana:getAddress");
          return bs58.encode(solanaKeypair.publicKey);
        },
        async getBalance() {
          return {};
        },
        async signMessage(message) {
          calls.push("solana:signMessage");
          return nacl.sign.detached(message, solanaKeypair.secretKey);
        },
        async signTransaction() {
          return new Uint8Array();
        },
      },
    });

    const adapter = createX402Adapter({ wallets: registry, networks: ["eip155:8453", "solana:mainnet"] });

    await adapter.pay({
      ...baseChallenge,
      network: "eip155:8453",
      payTo: "0xprovider",
    });
    await adapter.pay({
      ...baseChallenge,
      network: "solana:mainnet",
      payTo: "sol-provider",
    });

    expect(calls).toContain("evm:getAddress");
    expect(calls).toContain("evm:signMessage");
    expect(calls).toContain("solana:getAddress");
    expect(calls).toContain("solana:signMessage");
  });

  it("signs and verifies a Solana payment proof", async () => {
    const keypair = nacl.sign.keyPair();
    const payerAddress = bs58.encode(keypair.publicKey);
    const registry = createWalletRegistry({
      solana: {
        id: "sol-wallet",
        chain: "solana",
        async getAddress() {
          return payerAddress;
        },
        async getBalance() {
          return {};
        },
        async signMessage(message) {
          return nacl.sign.detached(message, keypair.secretKey);
        },
        async signTransaction() {
          return new Uint8Array();
        },
      },
    });

    const adapter = createX402Adapter({ wallets: registry, networks: ["solana:mainnet"] });
    const unpaid = await adapter.buildPaymentRequired!(baseChallenge);
    const accepts = (unpaid.body as { accepts: unknown[] }).accepts;
    const receipt = await adapter.pay({
      ...baseChallenge,
      ...(accepts[0] as { network: string; payTo: string; amount: string; asset: string; scheme: string }),
      currency: ((accepts[0] as { asset: string }).asset),
    });

    expect(
      await adapter.verify(receipt.proof!, {
        ...baseChallenge,
        extra: { accepts },
      }),
    ).toBe(true);
  });

  it("handles a 402 challenge, signs payment, and retries with PAYMENT-SIGNATURE", async () => {
    const keypair = nacl.sign.keyPair();
    const payerAddress = bs58.encode(keypair.publicKey);
    const adapter = createX402Adapter({
      wallets: createWalletRegistry({
        solana: {
          id: "sol-wallet",
          chain: "solana",
          async getAddress() {
            return payerAddress;
          },
          async getBalance() {
            return {};
          },
          async signMessage(message) {
            return nacl.sign.detached(message, keypair.secretKey);
          },
          async signTransaction() {
            return new Uint8Array();
          },
        },
      }),
      networks: ["solana:mainnet"],
    });

    const unpaid = await adapter.buildPaymentRequired!(baseChallenge);
    const accepts = (unpaid.body as { accepts: unknown[] }).accepts;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(unpaid.body), {
          status: 402,
          headers: unpaid.headers,
        }),
      )
      .mockImplementationOnce(async (_input, init) => {
        const proof = new Headers(init?.headers).get("payment-signature");
        const verified = await adapter.verify(proof ?? "", {
          ...baseChallenge,
          extra: { accepts },
        });
        return new Response(JSON.stringify({ ok: verified }), {
          status: verified ? 200 : 402,
          headers: { "content-type": "application/json" },
        });
      });

    const response = await fetchWithX402({
      adapter,
      fetchImpl,
      input: "https://example.com/proxy/translate",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
