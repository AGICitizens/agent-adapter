import type { ExecutionPlan } from "@agent-adapter/contracts";

const PATH_PARAM_RE = /\{([^}]+)\}/g;
const FULL_INPUT_REF_RE = /^{{\s*input\.([^}]+)\s*}}$/;
const INLINE_INPUT_REF_RE = /{{\s*input\.([^}]+)\s*}}/g;

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const QUERY_ONLY_METHODS = new Set(["GET", "DELETE", "HEAD"]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Uint8Array);

const getInputValue = (
  input: Record<string, unknown>,
  ref: string,
): unknown => {
  const path = ref.replace(/^input\./, "").split(".");
  let current: unknown = input;

  for (const segment of path) {
    if (!isPlainObject(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
};

const stringifyTemplateValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
};

export const resolveTemplate = (
  template: unknown,
  input: Record<string, unknown>,
): unknown => {
  if (Array.isArray(template)) {
    return template.map((entry) => resolveTemplate(entry, input));
  }

  if (isPlainObject(template)) {
    if (
      Object.keys(template).length === 1 &&
      typeof template.$ref === "string"
    ) {
      return getInputValue(input, template.$ref);
    }

    return Object.fromEntries(
      Object.entries(template).map(([key, value]) => [
        key,
        resolveTemplate(value, input),
      ]),
    );
  }

  if (typeof template === "string") {
    const fullRef = template.match(FULL_INPUT_REF_RE);
    if (fullRef) {
      return getInputValue(input, `input.${fullRef[1]}`);
    }

    return template.replace(INLINE_INPUT_REF_RE, (_, refPath: string) =>
      stringifyTemplateValue(getInputValue(input, `input.${refPath}`)),
    );
  }

  return template;
};

const appendQueryValue = (
  params: URLSearchParams,
  key: string,
  value: unknown,
): void => {
  if (value === undefined || value === null) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(params, key, item);
    }
    return;
  }

  if (typeof value === "string") {
    params.append(key, value);
    return;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    params.append(key, String(value));
    return;
  }

  params.append(key, JSON.stringify(value));
};

export interface BuiltCapabilityRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

export const buildCapabilityRequest = (
  executionPlan: ExecutionPlan,
  input: Record<string, unknown>,
  opts?: { fallbackBody?: unknown },
): BuiltCapabilityRequest => {
  const usedKeys = new Set<string>();
  const method = executionPlan.method.toUpperCase();

  const resolvedUrl = executionPlan.url.replace(
    PATH_PARAM_RE,
    (_, rawParam: string) => {
      const param = rawParam.trim();
      const value = input[param];
      if (value === undefined || value === null) {
        throw new Error(`Missing path parameter "${param}"`);
      }
      usedKeys.add(param);
      return encodeURIComponent(String(value));
    },
  );

  const url = new URL(resolvedUrl);

  let body: unknown;
  if (executionPlan.bodyTemplate !== undefined) {
    body = resolveTemplate(executionPlan.bodyTemplate, input);
    usedKeys.add("body");
  } else if (
    opts?.fallbackBody !== undefined &&
    !QUERY_ONLY_METHODS.has(method)
  ) {
    body = opts.fallbackBody;
  } else if (BODY_METHODS.has(method) && Object.keys(input).length > 0) {
    body = input;
    for (const key of Object.keys(input)) {
      usedKeys.add(key);
    }
  }

  const shouldAppendQuery =
    executionPlan.bodyTemplate !== undefined || QUERY_ONLY_METHODS.has(method);

  if (shouldAppendQuery) {
    for (const [key, value] of Object.entries(input)) {
      if (usedKeys.has(key)) continue;
      appendQueryValue(url.searchParams, key, value);
      usedKeys.add(key);
    }
  }

  return {
    method,
    url: url.toString(),
    headers: { ...(executionPlan.headers ?? {}) },
    body,
  };
};
