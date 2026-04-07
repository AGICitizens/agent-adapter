/**
 * Config loader — YAML parsing, env var resolution (${VAR_NAME} syntax),
 * Zod validation of config shape.
 */

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import {
  adapterConfigSchema,
  type AdapterConfig,
} from "@agent-adapter/contracts";

/**
 * Replace ${VAR} placeholders with process.env values.
 * Throws if a referenced variable is not set.
 */
const resolveEnvVars = (obj: unknown): unknown => {
  if (typeof obj === "string") {
    return obj.replace(/\$\{(\w+)\}/g, (_, key) => {
      const val = process.env[key];
      if (val === undefined) {
        throw new Error(`Environment variable "${key}" is not set`);
      }
      return val;
    });
  }

  if (Array.isArray(obj)) return obj.map(resolveEnvVars);

  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, resolveEnvVars(v)]),
    );
  }
  return obj;
};

/**
 * Load, resolve env vars, and validate an adapter config file.
 * Throws on missing file, unset env vars, or schema violations.
 */
export const loadConfig = (filePath: string): AdapterConfig => {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);
  const resolved = resolveEnvVars(parsed);
  return adapterConfigSchema.parse(resolved);
};
