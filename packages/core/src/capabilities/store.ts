import { eq, and, inArray } from "drizzle-orm";
import type { Capability, PricingConfig } from "@agent-adapter/contracts";
import type { DatabaseConnection } from "../db/index.js";
import { schema } from "../db/index.js";
import { PricingRequiredError } from "./errors.js";

export interface CapabilityStore {
  list(): Capability[];
  get(name: string): Capability | undefined;
  upsert(cap: Capability): void;
  upsertBatch(caps: Capability[]): void;
  setEnabled(name: string, enabled: boolean): void;
  deleteMany(names: string[]): void;
}

type CapabilityRow = typeof schema.capabilities.$inferSelect;

const toCapability = (row: CapabilityRow): Capability => {
  let pricing: PricingConfig | null = null;
  if (row.pricingModel && row.pricingAmount !== null && row.pricingCurrency) {
    pricing = {
      model: row.pricingModel as PricingConfig["model"],
      amount: row.pricingAmount,
      currency: row.pricingCurrency,
      itemField: row.pricingItemField ?? undefined,
      floor: row.floor ?? undefined,
      ceiling: row.ceiling ?? undefined,
    };
  }

  return {
    name: row.name,
    description: row.description ?? "",
    source: row.source as Capability["source"],
    inputSchema: row.inputSchema ? JSON.parse(row.inputSchema) : {},
    outputSchema: row.outputSchema ? JSON.parse(row.outputSchema) : {},
    executionPlan: {
      method: row.executionMethod ?? "GET",
      url: row.executionUrl ?? "",
      headers: row.executionHeaders
        ? JSON.parse(row.executionHeaders)
        : undefined,
      bodyTemplate: row.executionBodyTemplate
        ? JSON.parse(row.executionBodyTemplate)
        : undefined,
    },
    enabled: row.enabled,
    pricing,
    sourceHash: row.sourceHash,
  };
};

export const createCapabilityStore = (
  conn: DatabaseConnection,
  providerId: string,
): CapabilityStore => {
  const { db } = conn;
  const { capabilities } = schema;

  return {
    list() {
      const rows = db
        .select()
        .from(capabilities)
        .where(eq(capabilities.providerId, providerId))
        .all();
      return rows.map(toCapability);
    },

    get(name) {
      const row = db
        .select()
        .from(capabilities)
        .where(
          and(
            eq(capabilities.providerId, providerId),
            eq(capabilities.name, name),
          ),
        )
        .get();
      return row ? toCapability(row) : undefined;
    },

    upsert(cap) {
      const now = new Date().toISOString();
      db.insert(capabilities)
        .values({
          providerId,
          name: cap.name,
          description: cap.description,
          enabled: cap.enabled,
          source: cap.source,
          inputSchema: JSON.stringify(cap.inputSchema),
          outputSchema: JSON.stringify(cap.outputSchema),
          executionMethod: cap.executionPlan.method,
          executionUrl: cap.executionPlan.url,
          executionHeaders: cap.executionPlan.headers
            ? JSON.stringify(cap.executionPlan.headers)
            : null,
          executionBodyTemplate: cap.executionPlan.bodyTemplate
            ? JSON.stringify(cap.executionPlan.bodyTemplate)
            : null,
          pricingModel: cap.pricing?.model ?? null,
          pricingAmount: cap.pricing?.amount ?? null,
          pricingCurrency: cap.pricing?.currency ?? null,
          pricingItemField: cap.pricing?.itemField ?? null,
          floor: cap.pricing?.floor ?? null,
          ceiling: cap.pricing?.ceiling ?? null,
          sourceHash: cap.sourceHash,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [capabilities.providerId, capabilities.name],
          set: {
            description: cap.description,
            source: cap.source,
            inputSchema: JSON.stringify(cap.inputSchema),
            outputSchema: JSON.stringify(cap.outputSchema),
            executionMethod: cap.executionPlan.method,
            executionUrl: cap.executionPlan.url,
            executionHeaders: cap.executionPlan.headers
              ? JSON.stringify(cap.executionPlan.headers)
              : null,
            executionBodyTemplate: cap.executionPlan.bodyTemplate
              ? JSON.stringify(cap.executionPlan.bodyTemplate)
              : null,
            sourceHash: cap.sourceHash,
            updatedAt: now,
            // NOTE: enabled and pricing columns are NOT updated — preserves operator overrides
          },
        })
        .run();
    },

    upsertBatch(caps) {
      db.transaction((tx) => {
        const now = new Date().toISOString();
        for (const cap of caps) {
          tx.insert(capabilities)
            .values({
              providerId,
              name: cap.name,
              description: cap.description,
              enabled: cap.enabled,
              source: cap.source,
              inputSchema: JSON.stringify(cap.inputSchema),
              outputSchema: JSON.stringify(cap.outputSchema),
              executionMethod: cap.executionPlan.method,
              executionUrl: cap.executionPlan.url,
              executionHeaders: cap.executionPlan.headers
                ? JSON.stringify(cap.executionPlan.headers)
                : null,
              executionBodyTemplate: cap.executionPlan.bodyTemplate
                ? JSON.stringify(cap.executionPlan.bodyTemplate)
                : null,
              pricingModel: cap.pricing?.model ?? null,
              pricingAmount: cap.pricing?.amount ?? null,
              pricingCurrency: cap.pricing?.currency ?? null,
              pricingItemField: cap.pricing?.itemField ?? null,
              floor: cap.pricing?.floor ?? null,
              ceiling: cap.pricing?.ceiling ?? null,
              sourceHash: cap.sourceHash,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [capabilities.providerId, capabilities.name],
              set: {
                description: cap.description,
                source: cap.source,
                inputSchema: JSON.stringify(cap.inputSchema),
                outputSchema: JSON.stringify(cap.outputSchema),
                executionMethod: cap.executionPlan.method,
                executionUrl: cap.executionPlan.url,
                executionHeaders: cap.executionPlan.headers
                  ? JSON.stringify(cap.executionPlan.headers)
                  : null,
                executionBodyTemplate: cap.executionPlan.bodyTemplate
                  ? JSON.stringify(cap.executionPlan.bodyTemplate)
                  : null,
                sourceHash: cap.sourceHash,
                updatedAt: now,
              },
            })
            .run();
        }
      });
    },

    setEnabled(name, enabled) {
      if (enabled) {
        const existing = this.get(name);
        if (!existing) return;
        if (!existing.pricing) {
          throw new PricingRequiredError(name);
        }
      }

      const now = new Date().toISOString();
      db.update(capabilities)
        .set({ enabled, updatedAt: now })
        .where(
          and(
            eq(capabilities.providerId, providerId),
            eq(capabilities.name, name),
          ),
        )
        .run();
    },

    deleteMany(names) {
      if (names.length === 0) return;

      db.delete(capabilities)
        .where(
          and(
            eq(capabilities.providerId, providerId),
            inArray(capabilities.name, names),
          ),
        )
        .run();
    },
  };
};
