import type { StateBackend } from "@agent-adapter/contracts";
import type { HandlerGroup } from "../types.js";

export const createStateHandlers = (state: StateBackend): HandlerGroup => ({
  tools: [
    {
      name: "state__get",
      description: "Get a JSON value from the state store",
      parameters: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          key: { type: "string" },
        },
        required: ["namespace", "key"],
      },
    },
    {
      name: "state__set",
      description: "Set a JSON value in the state store",
      parameters: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          key: { type: "string" },
          value: {},
        },
        required: ["namespace", "key", "value"],
      },
    },
    {
      name: "state__query",
      description:
        "Query state entries with optional prefix, pagination, ordering",
      parameters: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          prefix: { type: "string" },
          limit: { type: "number" },
          offset: { type: "number" },
          orderBy: { type: "string", enum: ["key", "updatedAt"] },
          order: { type: "string", enum: ["asc", "desc"] },
        },
        required: ["namespace"],
      },
    },
    {
      name: "state__delete",
      description: "Delete a state entry",
      parameters: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          key: { type: "string" },
        },
        required: ["namespace", "key"],
      },
    },
    {
      name: "state__batch_set",
      description: "Set multiple state entries atomically",
      parameters: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          entries: {
            type: "array",
            items: {
              type: "object",
              properties: { key: { type: "string" }, data: {} },
              required: ["key", "data"],
            },
          },
        },
        required: ["namespace", "entries"],
      },
    },
  ],

  async execute(toolName, args) {
    switch (toolName) {
      case "state__get": {
        const value = await state.get(
          args.namespace as string,
          args.key as string,
        );
        return { value };
      }
      case "state__set": {
        await state.set(
          args.namespace as string,
          args.key as string,
          args.value,
        );
        return { ok: true };
      }
      case "state__query": {
        const results = await state.query(args.namespace as string, {
          prefix: args.prefix as string | undefined,
          limit: args.limit as number | undefined,
          offset: args.offset as number | undefined,
          orderBy: args.orderBy as "key" | "updatedAt" | undefined,
          order: args.order as "asc" | "desc" | undefined,
        });
        return { results };
      }
      case "state__delete": {
        const deleted = await state.delete(
          args.namespace as string,
          args.key as string,
        );
        return { deleted };
      }
      case "state__batch_set": {
        await state.batchSet(
          args.namespace as string,
          args.entries as Array<{ key: string; data: unknown }>,
        );
        return { ok: true };
      }
      default:
        throw new Error(`Unknown state tool: ${toolName}`);
    }
  },
});
