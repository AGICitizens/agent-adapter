import type { WalletRegistry } from "@agent-adapter/contracts";
import type { HandlerGroup } from "../types.js";

export const createWalletHandlers = (wallets: WalletRegistry): HandlerGroup => ({
  tools: [
    {
      name: "wallet__address",
      description: "Get wallet address for a chain (or primary wallet if no chain specified)",
      parameters: {
        type: "object",
        properties: { chain: { type: "string" } },
      },
    },
    {
      name: "wallet__balance",
      description: "Get wallet balance for a chain (or primary wallet)",
      parameters: {
        type: "object",
        properties: { chain: { type: "string" } },
      },
    },
    {
      name: "wallet__sign_message",
      description: "Sign an arbitrary message with a wallet",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          chain: { type: "string" },
        },
        required: ["message"],
      },
    },
  ],

  async execute(toolName, args) {
    const chain = args.chain as string | undefined;
    const plugin = chain ? wallets.get(chain) : wallets.primary();
    if (!plugin) {
      throw new Error(
        chain ? `No wallet configured for chain: ${chain}` : "No wallet configured",
      );
    }

    switch (toolName) {
      case "wallet__address": {
        const address = await plugin.getAddress();
        return { address, chain: plugin.chain };
      }
      case "wallet__balance": {
        const balance = await plugin.getBalance();
        return { balance, chain: plugin.chain };
      }
      case "wallet__sign_message": {
        const encoded = new TextEncoder().encode(args.message as string);
        const signature = await plugin.signMessage(encoded);
        // Return signature as hex
        const hex = Buffer.from(signature).toString("hex");
        return { signature: hex, chain: plugin.chain };
      }
      default:
        throw new Error(`Unknown wallet tool: ${toolName}`);
    }
  },
});
