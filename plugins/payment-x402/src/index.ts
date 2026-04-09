import type {
  PaymentAdapter,
  PaymentChallenge,
  PaymentReceipt,
  WalletRegistry,
} from "@agent-adapter/contracts";
import {
  decodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type {
  Network,
  PaymentPayload,
  PaymentRequired,
  ResourceInfo,
} from "@x402/core/types";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { recoverMessageAddress } from "viem";

const DEFAULT_NETWORKS = ["eip155:8453", "solana:mainnet"];
const DEFAULT_TIMEOUT_SECONDS = 300;

type AcceptedRequirement = {
  scheme: string;
  network: Network;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};

type AdapterPayload = {
  payer: string;
  signature: string;
  message: string;
};

export interface X402AdapterOptions {
  wallets: WalletRegistry;
  networks?: string[];
  maxTimeoutSeconds?: number;
}

export interface X402FetchOptions {
  adapter: PaymentAdapter;
  fetchImpl?: typeof fetch;
  input: string | URL | Request;
  init?: RequestInit;
}

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

const chainFamily = (chainOrCaip2: string): string => {
  if (chainOrCaip2.startsWith("eip155:")) return "evm";
  if (chainOrCaip2.startsWith("solana:")) return "solana";
  return chainOrCaip2;
};

const defaultNetworkForFamily = (family: string): string => {
  switch (family) {
    case "evm":
      return "eip155:8453";
    case "solana":
      return "solana:mainnet";
    default:
      return family;
  }
};

const normalizeNetworks = (wallets: WalletRegistry, configured?: string[]): string[] => {
  const raw = configured?.length ? configured : DEFAULT_NETWORKS;
  const normalized = raw.map((network) => defaultNetworkForFamily(chainFamily(network)));
  return normalized.filter(
    (network, index) =>
      (wallets.has(network) || wallets.has(chainFamily(network))) &&
      normalized.indexOf(network) === index,
  );
};

const normalizeScheme = (scheme: string): string =>
  scheme === "exact" || scheme === "upto" ? scheme : "exact";

const toAcceptedRequirement = (
  challenge: PaymentChallenge,
): AcceptedRequirement => ({
  scheme: normalizeScheme(challenge.scheme),
  network: challenge.network as Network,
  amount: challenge.amount,
  asset: challenge.currency,
  payTo: challenge.payTo,
  maxTimeoutSeconds:
    typeof challenge.extra?.maxTimeoutSeconds === "number"
      ? challenge.extra.maxTimeoutSeconds
      : DEFAULT_TIMEOUT_SECONDS,
  extra: challenge.extra ?? {},
});

const resourceInfoForChallenge = (challenge: PaymentChallenge): ResourceInfo => ({
  url: challenge.resource,
});

const canonicalMessage = (
  accepted: AcceptedRequirement,
  resource: ResourceInfo,
  payer: string,
): string =>
  JSON.stringify({
    x402Version: 2,
    accepted: {
      scheme: accepted.scheme,
      network: accepted.network,
      amount: accepted.amount,
      asset: accepted.asset,
      payTo: accepted.payTo,
    },
    resource,
    payer,
  });

const bytesToHex = (bytes: Uint8Array): `0x${string}` =>
  `0x${Buffer.from(bytes).toString("hex")}`;

const decodeSignature = (value: string): Uint8Array => {
  if (value.startsWith("0x")) {
    return Uint8Array.from(Buffer.from(value.slice(2), "hex"));
  }
  return Uint8Array.from(Buffer.from(value, "base64"));
};

const acceptedRequirementsForChallenge = (
  challenge: PaymentChallenge,
): AcceptedRequirement[] => {
  const accepts = challenge.extra?.accepts;
  if (Array.isArray(accepts)) {
    return accepts.filter(
      (value): value is AcceptedRequirement =>
        !!value &&
        typeof value === "object" &&
        typeof (value as AcceptedRequirement).scheme === "string" &&
        typeof (value as AcceptedRequirement).network === "string" &&
        typeof (value as AcceptedRequirement).amount === "string" &&
        typeof (value as AcceptedRequirement).asset === "string" &&
        typeof (value as AcceptedRequirement).payTo === "string",
    );
  }
  return [toAcceptedRequirement(challenge)];
};

const acceptedMatches = (
  left: AcceptedRequirement,
  right: AcceptedRequirement,
): boolean =>
  left.scheme === right.scheme &&
  left.network === right.network &&
  left.amount === right.amount &&
  left.asset === right.asset &&
  left.payTo === right.payTo;

const isAdapterPayload = (value: unknown): value is AdapterPayload =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as AdapterPayload).payer === "string" &&
  typeof (value as AdapterPayload).signature === "string" &&
  typeof (value as AdapterPayload).message === "string";

const isPaymentPayload = (value: unknown): value is PaymentPayload =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as PaymentPayload).x402Version === "number" &&
  !!(value as PaymentPayload).accepted &&
  typeof (value as PaymentPayload).accepted === "object" &&
  !!(value as PaymentPayload).payload &&
  typeof (value as PaymentPayload).payload === "object";

const parsePaymentPayload = (proof: string): PaymentPayload | null => {
  try {
    return decodePaymentSignatureHeader(proof);
  } catch {
    try {
      const parsed = JSON.parse(proof);
      return isPaymentPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
};

const resourceFromPayload = (
  payload: PaymentPayload,
  fallbackResource: string,
): ResourceInfo => ({
  url:
    payload.resource && typeof payload.resource.url === "string"
      ? payload.resource.url
      : fallbackResource,
});

const matchesAnyAcceptedRequirement = (
  payload: PaymentPayload,
  challenge: PaymentChallenge,
): AcceptedRequirement | null => {
  const accepted = payload.accepted as AcceptedRequirement;
  for (const candidate of acceptedRequirementsForChallenge(challenge)) {
    if (acceptedMatches(candidate, accepted)) {
      return candidate;
    }
  }
  return null;
};

const verifySignature = async (
  accepted: AcceptedRequirement,
  resource: ResourceInfo,
  payload: AdapterPayload,
): Promise<boolean> => {
  const message = canonicalMessage(accepted, resource, payload.payer);
  if (payload.message !== message) {
    return false;
  }

  if (accepted.network.startsWith("solana:")) {
    return nacl.sign.detached.verify(
      utf8(message),
      decodeSignature(payload.signature),
      bs58.decode(payload.payer),
    );
  }

  if (accepted.network.startsWith("eip155:")) {
    const recovered = await recoverMessageAddress({
      message,
      signature: payload.signature as `0x${string}`,
    });
    return recovered.toLowerCase() === payload.payer.toLowerCase();
  }

  return false;
};

const buildAccepts = async (
  wallets: WalletRegistry,
  challenge: PaymentChallenge,
  networks: string[],
  maxTimeoutSeconds: number,
): Promise<AcceptedRequirement[]> => {
  const accepts: AcceptedRequirement[] = [];

  for (const network of networks) {
    if (!wallets.has(network) && !wallets.has(chainFamily(network))) {
      continue;
    }

    const wallet = wallets.get(network);
    const payTo = await wallet.getAddress(network);
    accepts.push({
      scheme: normalizeScheme(challenge.scheme),
      network: network as Network,
      amount: challenge.amount,
      asset: challenge.currency,
      payTo,
      maxTimeoutSeconds,
      extra: challenge.extra ?? {},
    });
  }

  return accepts;
};

export const parseX402PaymentRequiredResponse = (input: {
  body?: unknown;
  paymentRequiredHeader?: string | null;
}): PaymentChallenge[] => {
  let required: PaymentRequired | null = null;

  if (input.paymentRequiredHeader) {
    required = decodePaymentRequiredHeader(input.paymentRequiredHeader);
  } else if (
    input.body &&
    typeof input.body === "object" &&
    !Array.isArray(input.body) &&
    Array.isArray((input.body as { accepts?: unknown[] }).accepts)
  ) {
    required = input.body as PaymentRequired;
  }

  if (!required) {
    return [];
  }

  const resource =
    required.resource && typeof required.resource.url === "string"
      ? required.resource.url
      : "";

  return required.accepts.map((accepted) => ({
    type: "x402",
    network: accepted.network,
    payTo: accepted.payTo,
    amount: accepted.amount,
    currency: accepted.asset,
    resource,
    scheme: accepted.scheme,
    extra: {
      x402Version: required?.x402Version ?? 2,
      accepted,
    },
  }));
};

export const createX402Adapter = (
  opts: X402AdapterOptions,
): PaymentAdapter => {
  const { wallets } = opts;
  const networks = normalizeNetworks(wallets, opts.networks);
  const maxTimeoutSeconds = opts.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  return {
    id: "x402",

    canHandle(challenge) {
      return challenge.type === "x402";
    },

    async pay(challenge): Promise<PaymentReceipt> {
      const wallet = wallets.get(challenge.network);
      const accepted = toAcceptedRequirement(challenge);
      const resource = resourceInfoForChallenge(challenge);
      const payer = await wallet.getAddress(challenge.network);
      const message = canonicalMessage(accepted, resource, payer);
      const signature = await wallet.signMessage(utf8(message), challenge.network);

      const paymentPayload: PaymentPayload = {
        x402Version: 2,
        accepted,
        resource,
        payload: {
          payer,
          signature: bytesToHex(signature),
          message,
        },
      };

      return {
        protocol: "x402",
        network: challenge.network,
        amount: challenge.amount,
        currency: challenge.currency,
        txHash: null,
        proof: encodePaymentSignatureHeader(paymentPayload),
        timestamp: new Date().toISOString(),
      };
    },

    async verify(proof, challenge): Promise<boolean> {
      const paymentPayload = parsePaymentPayload(proof);
      if (!paymentPayload) {
        return false;
      }

      const accepted = matchesAnyAcceptedRequirement(paymentPayload, challenge);
      if (!accepted) {
        return false;
      }

      const payload = paymentPayload.payload;
      if (!isAdapterPayload(payload)) {
        return false;
      }

      const resource = resourceFromPayload(paymentPayload, challenge.resource);
      if (resource.url !== challenge.resource) {
        return false;
      }

      return verifySignature(accepted, resource, payload);
    },

    async buildPaymentRequired(challenge) {
      const accepts = await buildAccepts(wallets, challenge, networks, maxTimeoutSeconds);
      const paymentRequired: PaymentRequired = {
        x402Version: 2,
        error: "payment_required",
        accepts,
        resource: resourceInfoForChallenge(challenge),
      };

      return {
        headers: {
          "payment-required": encodePaymentRequiredHeader(paymentRequired),
        },
        body: paymentRequired,
      };
    },
  };
};

export const fetchWithX402 = async (
  opts: X402FetchOptions,
): Promise<Response> => {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const initialResponse = await fetchImpl(opts.input, opts.init);
  if (initialResponse.status !== 402) {
    return initialResponse;
  }

  const paymentRequiredHeader = initialResponse.headers.get("payment-required");
  let body: unknown = null;
  try {
    body = await initialResponse.clone().json();
  } catch {
    body = null;
  }

  const challenges = parseX402PaymentRequiredResponse({
    body,
    paymentRequiredHeader,
  });
  if (challenges.length === 0) {
    return initialResponse;
  }

  const receipt = await opts.adapter.pay(challenges[0]!);
  if (!receipt.proof) {
    return initialResponse;
  }

  const headers = new Headers(opts.init?.headers);
  headers.set("payment-signature", receipt.proof);

  return fetchImpl(opts.input, {
    ...opts.init,
    headers,
  });
};
