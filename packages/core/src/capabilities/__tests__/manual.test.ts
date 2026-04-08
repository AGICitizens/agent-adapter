import { describe, it, expect } from "vitest";
import { parseManualDefinitions } from "../parsers/manual.js";
import { CapabilityParseError } from "../errors.js";

const validDef = {
  name: "translate",
  description: "Translate text between languages",
  method: "POST",
  url: "https://api.example.com/translate",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" }, target: { type: "string" } },
  },
  outputSchema: {
    type: "object",
    properties: { translated: { type: "string" } },
  },
};

describe("parseManualDefinitions", () => {
  it("parses a valid definition", () => {
    const caps = parseManualDefinitions([validDef]);
    expect(caps).toHaveLength(1);
    expect(caps[0]!.name).toBe("translate");
    expect(caps[0]!.executionPlan.method).toBe("POST");
    expect(caps[0]!.executionPlan.url).toBe(
      "https://api.example.com/translate",
    );
  });

  it("all capabilities have enabled: false and pricing: null", () => {
    const caps = parseManualDefinitions([validDef]);
    expect(caps[0]!.enabled).toBe(false);
    expect(caps[0]!.pricing).toBeNull();
    expect(caps[0]!.source).toBe("manual");
  });

  it("parses multiple definitions", () => {
    const second = {
      ...validDef,
      name: "summarize",
      description: "Summarize text",
      method: "POST" as const,
      url: "https://api.example.com/summarize",
    };
    const caps = parseManualDefinitions([validDef, second]);
    expect(caps).toHaveLength(2);
    expect(caps.map((c) => c.name)).toEqual(["translate", "summarize"]);
  });

  it("defaults inputSchema and outputSchema to empty objects", () => {
    const minimal = {
      name: "ping",
      description: "Health check",
      method: "GET",
      url: "https://api.example.com/ping",
    };
    const caps = parseManualDefinitions([minimal]);
    expect(caps[0]!.inputSchema).toEqual({});
    expect(caps[0]!.outputSchema).toEqual({});
  });

  it("includes headers and bodyTemplate in executionPlan", () => {
    const withHeaders = {
      ...validDef,
      headers: { "X-Api-Key": "test" },
      bodyTemplate: { text: "{{input.text}}" },
    };
    const caps = parseManualDefinitions([withHeaders]);
    expect(caps[0]!.executionPlan.headers).toEqual({ "X-Api-Key": "test" });
    expect(caps[0]!.executionPlan.bodyTemplate).toEqual({
      text: "{{input.text}}",
    });
  });

  it("throws CapabilityParseError when name is missing", () => {
    const bad = { description: "No name", method: "GET", url: "http://x.com" };
    expect(() => parseManualDefinitions([bad])).toThrow(CapabilityParseError);
  });

  it("throws CapabilityParseError when method is invalid", () => {
    const bad = {
      name: "x",
      description: "Bad method",
      method: "YEET",
      url: "http://x.com",
    };
    expect(() => parseManualDefinitions([bad])).toThrow(CapabilityParseError);
  });

  it("error message includes index and field details", () => {
    const bad = {
      description: "Missing name",
      method: "GET",
      url: "http://x.com",
    };
    expect(() => parseManualDefinitions([validDef, bad])).toThrow(/index 1/);
  });
});
