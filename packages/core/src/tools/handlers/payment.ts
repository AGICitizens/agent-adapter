import type { PaymentChallenge } from "@agent-adapter/contracts";
import type { PaymentRegistry } from "../../payments/index.js";
import type { HandlerGroup } from "../types.js";

// TODO: Full payment resolution flow (retry with proof, 402 handling) comes in tasks 2.5/2.8

export const createPaymentHandlers = (
  payments: PaymentRegistry,
): HandlerGroup => ({
  tools: [
    {
      name: "pay__resolve_challenge",
      description:
        "Resolve a payment challenge — find an adapter and pay",
      parameters: {
        type: "object",
        properties: {
          challenge: {
            type: "object",
            properties: {
              type: { type: "string" },
              network: { type: "string" },
              payTo: { type: "string" },
              amount: { type: "string" },
              currency: { type: "string" },
              resource: { type: "string" },
              scheme: { type: "string" },
            },
            required: [
              "type",
              "network",
              "payTo",
              "amount",
              "currency",
              "resource",
              "scheme",
            ],
          },
        },
        required: ["challenge"],
      },
    },
  ],

  async execute(toolName, args) {
    switch (toolName) {
      case "pay__resolve_challenge": {
        const challenge = args.challenge as PaymentChallenge;
        const adapter = payments.resolve(challenge);
        if (!adapter) {
          throw new Error(
            `No payment adapter found for challenge type: ${challenge.type}`,
          );
        }
        const receipt = await adapter.pay(challenge);
        return { receipt };
      }
      default:
        throw new Error(`Unknown payment tool: ${toolName}`);
    }
  },
});
