/**
 * Lean HTTP client wrapping built-in fetch.
 * Shared by capability execution and net__http_request.
 */

const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT = 120_000;
const MAX_BODY_BYTES = 1_048_576; // 1 MB

export interface HttpRequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  responseMode?: "parsed" | "proxy";
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export async function httpRequest(
  opts: HttpRequestOptions,
): Promise<HttpResponse> {
  const timeout = Math.min(opts.timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers = new Headers(opts.headers);

  let fetchBody: string | undefined;
  if (opts.body !== undefined && opts.body !== null) {
    if (typeof opts.body === "string") {
      fetchBody = opts.body;
    } else if (opts.body instanceof Uint8Array) {
      fetchBody = undefined;
    } else {
      fetchBody = JSON.stringify(opts.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
  }

  try {
    const res = await fetch(opts.url, {
      method: opts.method,
      headers,
      body:
        opts.body instanceof Uint8Array
          ? Buffer.from(opts.body)
          : fetchBody,
      signal: controller.signal,
    });

    // Flatten response headers
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      resHeaders[key] = value;
    });

    // Read body with size guard
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.arrayBuffer();
    const truncated = raw.byteLength > MAX_BODY_BYTES;
    const sliced = truncated ? raw.slice(0, MAX_BODY_BYTES) : raw;
    const text = new TextDecoder().decode(sliced);

    if (opts.responseMode === "proxy") {
      return {
        status: res.status,
        headers: resHeaders,
        body: Uint8Array.from(new Uint8Array(sliced)),
      };
    }

    let body: unknown;
    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    } else {
      body = text;
    }

    return { status: res.status, headers: resHeaders, body };
  } finally {
    clearTimeout(timer);
  }
}
