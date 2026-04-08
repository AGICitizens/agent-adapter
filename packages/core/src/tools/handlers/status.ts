import type { ProviderContext, WalletRegistry } from "@agent-adapter/contracts";
import type { CapabilityRegistry } from "../../capabilities/registry.js";
import type { HandlerGroup } from "../types.js";

export const createStatusHandlers = (
  provider: ProviderContext,
  capabilities: CapabilityRegistry,
  wallets: WalletRegistry,
): HandlerGroup => ({
  tools: [
    {
      name: "status__whoami",
      description:
        "Returns provider identity, capability summary, and wallet info",
      parameters: { type: "object", properties: {} },
    },
  ],

  async execute(toolName) {
    switch (toolName) {
      case "status__whoami": {
        const allCaps = capabilities.listCapabilities();
        const enabled = allCaps.filter((c) => c.enabled);

        const walletList = wallets.list();
        const walletInfo = [];
        for (const plugin of walletList) {
          walletInfo.push({
            chain: plugin.chain,
            address: await plugin.getAddress(),
          });
        }

        return {
          providerId: provider.providerId,
          capabilities: {
            total: allCaps.length,
            enabled: enabled.length,
            names: enabled.map((c) => c.name),
          },
          wallets: walletInfo,
        };
      }
      default:
        throw new Error(`Unknown status tool: ${toolName}`);
    }
  },
});
