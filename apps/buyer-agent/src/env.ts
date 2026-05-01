import { z } from "zod";

const HEX_PRIVATE_KEY = /^0x[a-fA-F0-9]{64}$/;
const HEX_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  AI_PROVIDER: z.string().default("openrouter"),
  LLM_MODEL: z.string().default("google/gemini-2.0-flash-001"),

  ZG_RPC_URL: z.string().url("ZG_RPC_URL must be a URL"),
  ZG_ESCROW_ADDRESS: z
    .string()
    .regex(HEX_ADDRESS, "ZG_ESCROW_ADDRESS must be a 0x-prefixed 20-byte address"),

  SEPOLIA_RPC_URL: z.string().url("SEPOLIA_RPC_URL must be a URL"),

  /**
   * Buyer's signing key. Distinct from `PRIVATE_KEY` (the seller's) so the demo
   * shows two distinct wallets. Falls back to PRIVATE_KEY for single-wallet runs.
   */
  BUYER_PRIVATE_KEY: z.string().regex(HEX_PRIVATE_KEY).optional(),
  PRIVATE_KEY: z.string().regex(HEX_PRIVATE_KEY).optional(),

  BUYER_PAYMENT_CHAIN_ID: z.coerce.number().int().positive().default(16602),
  BUYER_IDENTITY_CHAIN_ID: z.coerce.number().int().positive().default(11155111),

  BUYER_MAX_ROUNDS: z.coerce.number().int().positive().default(30),
  BUYER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type BuyerEnv = z.infer<typeof EnvSchema> & { BUYER_PRIVATE_KEY: `0x${string}` };

export function loadEnv(): BuyerEnv {
  const parsed = EnvSchema.parse(process.env);
  const buyerKey = parsed.BUYER_PRIVATE_KEY ?? parsed.PRIVATE_KEY;
  if (!buyerKey) {
    throw new Error(
      "buyer-agent: set BUYER_PRIVATE_KEY (or fall back PRIVATE_KEY) to a 0x-prefixed 32-byte private key",
    );
  }
  return { ...parsed, BUYER_PRIVATE_KEY: buyerKey as `0x${string}` };
}
