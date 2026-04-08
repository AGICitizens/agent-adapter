import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPIV3 } from "openapi-types";
import type { Capability } from "@agent-adapter/contracts";
import { CapabilityParseError } from "../errors.js";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

const nameFromPath = (method: string, path: string): string => {
  return `${method}_${path
    .replace(/[{}\/]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")}`;
};

const jsonSchema = (
  obj: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | undefined,
): Record<string, unknown> => {
  return (obj as Record<string, unknown>) ?? {};
};

export const parseOpenApiSpec = async (
  rawSpec: string,
): Promise<Capability[]> => {
  let api: OpenAPIV3.Document;
  try {
    api = (await SwaggerParser.dereference(
      JSON.parse(rawSpec),
    )) as OpenAPIV3.Document;
  } catch (err) {
    throw new CapabilityParseError(
      "openapi",
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!api.paths) {
    throw new CapabilityParseError("openapi", "Spec has no paths defined");
  }

  const baseUrl = api.servers?.[0]?.url ?? "";
  const capabilities: Capability[] = [];

  for (const [path, pathItem] of Object.entries(api.paths)) {
    if (!pathItem) continue;

    for (const method of METHODS) {
      const op = pathItem[method];
      if (!op) continue;

      const params = [
        ...((pathItem.parameters ?? []) as OpenAPIV3.ParameterObject[]),
        ...((op.parameters ?? []) as OpenAPIV3.ParameterObject[]),
      ];

      const inputProps: Record<string, unknown> = {};
      const required: string[] = [];
      for (const p of params) {
        inputProps[p.name] = p.schema ?? { type: "string" };
        if (p.required) required.push(p.name);
      }

      const body = (op.requestBody as OpenAPIV3.RequestBodyObject)?.content?.[
        "application/json"
      ]?.schema;
      if (body) {
        inputProps["body"] = jsonSchema(body);
        required.push("body");
      }

      const okResponse = Object.entries(op.responses ?? {})
        .filter(([s]) => s.startsWith("2"))
        .map(
          ([, r]) =>
            (r as OpenAPIV3.ResponseObject)?.content?.["application/json"]
              ?.schema,
        )[0];

      capabilities.push({
        name: op.operationId ?? nameFromPath(method, path),
        description: op.summary ?? op.description ?? "",
        source: "openapi",
        inputSchema: { type: "object", properties: inputProps, required },
        outputSchema: jsonSchema(okResponse),
        executionPlan: {
          method: method.toUpperCase(),
          url: baseUrl + path,
          bodyTemplate: body ? { $ref: "input.body" } : undefined,
        },
        enabled: false,
        pricing: null,
        sourceHash: null,
      });
    }
  }

  return capabilities;
};
