import { describe, it, expect, vi } from "vitest";
import { CapabilityParseError } from "../errors.js";

// Mock the MCP SDK before importing parseMcpSource
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn(),
}));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parseMcpSource } from "../parsers/mcp.js";

const MockClient = vi.mocked(Client);

function setupMockClient(
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>,
) {
  const mockInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  MockClient.mockImplementation(() => mockInstance as any);
  return mockInstance;
}

describe("parseMcpSource", () => {
  it("discovers tools and maps to capabilities", async () => {
    setupMockClient([
      {
        name: "get_weather",
        description: "Get current weather",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string" } },
        },
      },
      {
        name: "search_web",
        description: "Search the web",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
        },
      },
    ]);

    const caps = await parseMcpSource("http://localhost:3001/mcp");
    expect(caps).toHaveLength(2);
    expect(caps[0]!.name).toBe("get_weather");
    expect(caps[0]!.description).toBe("Get current weather");
    expect(caps[0]!.source).toBe("mcp");
    expect(caps[0]!.inputSchema).toEqual({
      type: "object",
      properties: { city: { type: "string" } },
    });
    expect(caps[1]!.name).toBe("search_web");
  });

  it("all capabilities have enabled: false and pricing: null", async () => {
    setupMockClient([{ name: "tool1" }]);
    const caps = await parseMcpSource("http://localhost:3001/mcp");
    expect(caps[0]!.enabled).toBe(false);
    expect(caps[0]!.pricing).toBeNull();
  });

  it("sets executionPlan.method to POST and url to MCP server", async () => {
    setupMockClient([{ name: "tool1" }]);
    const caps = await parseMcpSource("http://localhost:3001/mcp");
    expect(caps[0]!.executionPlan.method).toBe("POST");
    expect(caps[0]!.executionPlan.url).toBe("http://localhost:3001/mcp");
  });

  it("handles empty tool list", async () => {
    setupMockClient([]);
    const caps = await parseMcpSource("http://localhost:3001/mcp");
    expect(caps).toEqual([]);
  });

  it("throws CapabilityParseError on connection failure", async () => {
    const mockInstance = {
      connect: vi.fn().mockRejectedValue(new Error("Connection refused")),
      close: vi.fn().mockResolvedValue(undefined),
    };
    MockClient.mockImplementation(() => mockInstance as any);

    await expect(
      parseMcpSource("http://bad-host:9999/mcp"),
    ).rejects.toThrow(CapabilityParseError);
  });

  it("throws CapabilityParseError on listTools failure", async () => {
    const mockInstance = {
      connect: vi.fn().mockResolvedValue(undefined),
      listTools: vi.fn().mockRejectedValue(new Error("Protocol error")),
      close: vi.fn().mockResolvedValue(undefined),
    };
    MockClient.mockImplementation(() => mockInstance as any);

    await expect(
      parseMcpSource("http://localhost:3001/mcp"),
    ).rejects.toThrow(CapabilityParseError);
  });
});
