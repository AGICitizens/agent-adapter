import { Capability, CapabilitySourceConfig } from "@agent-adapter/contracts";
import { readFileSync } from "node:fs";
import { parseOpenApiSpec } from "./parsers/openapi.js";
import { parseManualDefinitions } from "./parsers/manual.js";
import { parseMcpSource } from "./parsers/mcp.js";
import { parseInferredSource } from "./parsers/inferred.js";
import { DatabaseConnection } from "../db/index.js";
import { CapabilityStore, createCapabilityStore } from "./store.js";
import { computeSourceHash } from "./hash.js";

export interface SyncResult {
  added: string[];
  updated: string[];
  unchanged: string[];
  stale: string[];
}

export interface CapabilityRegistry {
  refresh(): Promise<SyncResult>;
  getCapability(name: string): Capability | undefined;
  listCapabilities(): Capability[];
}

const fetchSource = async (
  source: CapabilitySourceConfig,
): Promise<{ capabilities: Capability[]; rawContent: string }> => {
  switch (source.type) {
    case "openapi": {
      let raw: string;
      if (source.url) {
        const res = await fetch(source.url);
        if (!res.ok)
          throw new Error(`Failed to fetch ${source.url}: ${res.status}`);

        raw = await res.text();
      } else if (source.path) {
        raw = readFileSync(source.path, "utf-8");
      } else {
        throw new Error("OpenAPI source requires url or path");
      }

      const caps = await parseOpenApiSpec(raw);
      return { capabilities: caps, rawContent: raw };
    }

    case "manual": {
      if (!source.definitions?.length) {
        return { capabilities: [], rawContent: "[]" };
      }
      const raw = JSON.stringify(source.definitions);
      const caps = parseManualDefinitions(source.definitions);
      return { capabilities: caps, rawContent: raw };
    }

    case "mcp": {
      if (!source.url) throw new Error("MCP source requires url");
      const caps = await parseMcpSource(source.url);
      // Use the tool list JSON as raw content for hashing
      const raw = JSON.stringify(
        caps.map((c) => ({ name: c.name, inputSchema: c.inputSchema })),
      );
      return { capabilities: caps, rawContent: raw };
    }

    case "inferred":
      parseInferredSource(); // throws
      // unreachable, but satisfies TS
      throw new Error("unreachable");
  }
};

export const createCapabilityRegistry = (
  conn: DatabaseConnection,
  providerId: string,
  sources: CapabilitySourceConfig[],
): CapabilityRegistry => {
  const store: CapabilityStore = createCapabilityStore(conn, providerId);
  let cache: Map<string, Capability> = new Map();

  // Load existing capabilities into cache
  for (const cap of store.list()) {
    cache.set(cap.name, cap);
  }

  return {
    async refresh() {
      const parsed = new Map<string, Capability>();

      for (const source of sources) {
        const { capabilities, rawContent } = await fetchSource(source);
        const hash = computeSourceHash(rawContent);

        for (const cap of capabilities) {
          parsed.set(cap.name, { ...cap, sourceHash: hash });
        }
      }

      const existing = new Map<string, Capability>();
      for (const cap of store.list()) {
        existing.set(cap.name, cap);
      }

      const added: string[] = [];
      const updated: string[] = [];
      const unchanged: string[] = [];

      for (const [name, cap] of parsed) {
        const prev = existing.get(name);
        if (!prev) {
          added.push(name);
        } else if (prev.sourceHash !== cap.sourceHash) {
          updated.push(name);
        } else {
          unchanged.push(name);
        }
      }

      const stale = [...existing.keys()].filter((n) => !parsed.has(n));

      // Persist new and updated
      const toUpsert = [...added, ...updated].map((n) => parsed.get(n)!);
      if (toUpsert.length > 0) {
        store.upsertBatch(toUpsert);
      }
      if (stale.length > 0) {
        store.deleteMany(stale);
      }

      // Reload cache from DB
      cache = new Map();
      for (const cap of store.list()) {
        cache.set(cap.name, cap);
      }

      return { added, updated, unchanged, stale };
    },

    getCapability(name) {
      return cache.get(name) ?? store.get(name);
    },

    listCapabilities() {
      if (cache.size > 0) return [...cache.values()];
      return store.list();
    },
  };
};
