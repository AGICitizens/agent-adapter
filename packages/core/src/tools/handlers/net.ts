import type { HandlerGroup } from "../types.js";
import { httpRequest } from "../http-client.js";

export const createNetHandlers = (): HandlerGroup => ({
  tools: [
    {
      name: "net__http_request",
      description:
        "Make an HTTP request to an external service. Returns status, headers, body.",
      parameters: {
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          },
          url: { type: "string" },
          headers: { type: "object" },
          body: {},
          timeout: { type: "number" },
        },
        required: ["method", "url"],
      },
    },
  ],

  async execute(toolName, args) {
    switch (toolName) {
      case "net__http_request": {
        const response = await httpRequest({
          method: args.method as string,
          url: args.url as string,
          headers: args.headers as Record<string, string> | undefined,
          body: args.body,
          timeout: args.timeout as number | undefined,
        });
        return {
          status: response.status,
          headers: response.headers,
          body: response.body,
        };
      }
      default:
        throw new Error(`Unknown net tool: ${toolName}`);
    }
  },
});
