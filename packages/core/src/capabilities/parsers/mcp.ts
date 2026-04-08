import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Capability } from "@agent-adapter/contracts";
import { CapabilityParseError } from "../errors.js";

export const parseMcpSource = async (url: string): Promise<Capability[]> => {
  let client: Client;
  try {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    client = new Client({ name: "agent-adapter", version: "0.1.0" });
    await client.connect(transport);
  } catch (err) {
    throw new CapabilityParseError(
      "mcp",
      `Failed to connect to MCP server at ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const { tools } = await client.listTools();

    return (tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      source: "mcp" as const,
      inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
      outputSchema: {},
      executionPlan: {
        method: "POST",
        url,
      },
      enabled: false,
      pricing: null,
      sourceHash: null, // set by registry
    }));
  } catch (err) {
    throw new CapabilityParseError(
      "mcp",
      `Failed to list tools from MCP server: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await client.close().catch(() => {});
  }
};
