import { describe, expect, it } from "vitest";
import { buildCapabilityRequest, resolveTemplate } from "./capability-request.js";

describe("resolveTemplate", () => {
  it("resolves full $ref objects and inline placeholders", () => {
    const input = {
      body: { text: "hello" },
      target: "es",
      meta: { provider: "demo" },
    };

    expect(resolveTemplate({ $ref: "input.body" }, input)).toEqual({
      text: "hello",
    });
    expect(
      resolveTemplate(
        {
          prompt: "Translate {{input.body.text}} to {{input.target}}",
          provider: "{{input.meta.provider}}",
        },
        input,
      ),
    ).toEqual({
      prompt: "Translate hello to es",
      provider: "demo",
    });
  });
});

describe("buildCapabilityRequest", () => {
  it("maps OpenAPI-style path params, query params, and body refs", () => {
    const request = buildCapabilityRequest(
      {
        method: "POST",
        url: "https://api.example.com/pets/{petId}",
        bodyTemplate: { $ref: "input.body" },
      },
      {
        petId: 123,
        verbose: true,
        body: { name: "Milo" },
      },
    );

    expect(request.url).toBe("https://api.example.com/pets/123?verbose=true");
    expect(request.body).toEqual({ name: "Milo" });
  });

  it("uses leftover args as query params for GET requests", () => {
    const request = buildCapabilityRequest(
      {
        method: "GET",
        url: "https://api.example.com/search",
      },
      {
        q: "cats",
        page: 2,
      },
    );

    expect(request.url).toBe("https://api.example.com/search?q=cats&page=2");
    expect(request.body).toBeUndefined();
  });

  it("uses fallback body for raw proxy requests", () => {
    const raw = new Uint8Array([1, 2, 3]);
    const request = buildCapabilityRequest(
      {
        method: "POST",
        url: "https://api.example.com/upload",
      },
      {},
      { fallbackBody: raw },
    );

    expect(request.body).toBe(raw);
  });

  it("throws when a required path parameter is missing", () => {
    expect(() =>
      buildCapabilityRequest(
        {
          method: "GET",
          url: "https://api.example.com/pets/{petId}",
        },
        {},
      ),
    ).toThrow('Missing path parameter "petId"');
  });
});
