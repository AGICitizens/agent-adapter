import { z } from "zod";
import { Capability, HTTP_METHODS } from "@agent-adapter/contracts";
import { CapabilityParseError } from "../errors.js";

const manualDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  method: z.enum(HTTP_METHODS),
  url: z.string(),
  inputSchema: z.record(z.unknown()).default({}),
  outputSchema: z.record(z.unknown()).default({}),
  headers: z.record(z.string()).optional(),
  bodyTemplate: z.record(z.unknown()).optional(),
});

export const parseManualDefinitions = (
  definitions: Record<string, unknown>[],
): Capability[] => {
  return definitions.map((def, i) => {
    const result = manualDefinitionSchema.safeParse(def);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");
      throw new CapabilityParseError(
        "manual",
        `Invalid definition at index ${i}: ${issues}`,
      );
    }

    const d = result.data;
    return {
      name: d.name,
      description: d.description,
      source: "manual" as const,
      inputSchema: d.inputSchema,
      outputSchema: d.outputSchema,
      executionPlan: {
        method: d.method,
        url: d.url,
        headers: d.headers,
        bodyTemplate: d.bodyTemplate,
      },
      enabled: false,
      pricing: null,
      sourceHash: null, // set by registry
    };
  });
};
