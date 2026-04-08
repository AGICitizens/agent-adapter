import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpenApiSpec } from "../parsers/openapi.js";
import { CapabilityParseError } from "../errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(resolve(__dirname, "fixtures", name), "utf-8");

describe("parseOpenApiSpec", () => {
  it("parses operations with operationIds", async () => {
    const caps = await parseOpenApiSpec(fixture("petstore.json"));
    const names = caps.map((c) => c.name);
    expect(names).toContain("listPets");
    expect(names).toContain("createPet");
  });

  it("parses YAML OpenAPI specs", async () => {
    const caps = await parseOpenApiSpec(fixture("petstore.yaml"));
    expect(caps.map((c) => c.name)).toContain("listPets");
    expect(caps.map((c) => c.name)).toContain("createPet");
  });

  it("generates name from method_path when no operationId", async () => {
    const caps = await parseOpenApiSpec(fixture("petstore.json"));
    const getPet = caps.find((c) => c.name === "get_pets_petId");
    expect(getPet).toBeDefined();
    expect(getPet!.description).toBe("Get a pet by ID");
  });

  it("extracts inputSchema from parameters", async () => {
    const caps = await parseOpenApiSpec(fixture("petstore.json"));
    const listPets = caps.find((c) => c.name === "listPets")!;
    expect(listPets.inputSchema).toEqual({
      type: "object",
      properties: { limit: { type: "integer" } },
      required: [],
    });
  });

  it("extracts inputSchema from requestBody", async () => {
    const caps = await parseOpenApiSpec(fixture("petstore.json"));
    const createPet = caps.find((c) => c.name === "createPet")!;
    const props = (createPet.inputSchema as any).properties;
    expect(props.body).toBeDefined();
    expect(props.body.properties.name).toEqual({ type: "string" });
  });

  it("extracts outputSchema from 2xx response", async () => {
    const caps = await parseOpenApiSpec(fixture("petstore.json"));
    const listPets = caps.find((c) => c.name === "listPets")!;
    expect(listPets.outputSchema).toHaveProperty("type", "array");
  });

  it("builds execution plan with server URL + path", async () => {
    const caps = await parseOpenApiSpec(fixture("petstore.json"));
    const listPets = caps.find((c) => c.name === "listPets")!;
    expect(listPets.executionPlan).toEqual({
      method: "GET",
      url: "https://petstore.example.com/v1/pets",
      bodyTemplate: undefined,
    });
  });

  it("sets bodyTemplate for POST operations", async () => {
    const caps = await parseOpenApiSpec(fixture("petstore.json"));
    const createPet = caps.find((c) => c.name === "createPet")!;
    expect(createPet.executionPlan.bodyTemplate).toEqual({
      $ref: "input.body",
    });
  });

  it("all capabilities have enabled: false and pricing: null", async () => {
    const caps = await parseOpenApiSpec(fixture("petstore.json"));
    for (const cap of caps) {
      expect(cap.enabled).toBe(false);
      expect(cap.pricing).toBeNull();
      expect(cap.source).toBe("openapi");
    }
  });

  it("throws CapabilityParseError on invalid JSON", async () => {
    await expect(parseOpenApiSpec("not json")).rejects.toThrow(
      CapabilityParseError,
    );
  });

  it("throws CapabilityParseError when paths missing", async () => {
    const spec = JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Empty", version: "1.0.0" },
    });
    await expect(parseOpenApiSpec(spec)).rejects.toThrow(CapabilityParseError);
  });
});
