import type { JobEngine } from "@agent-adapter/contracts";
import type { HandlerGroup } from "../types.js";

export const createJobsHandlers = (jobs: JobEngine): HandlerGroup => ({
  tools: [
    {
      name: "jobs__create",
      description: "Create a new job in pending status",
      parameters: {
        type: "object",
        properties: {
          capabilityName: { type: "string" },
          platform: { type: "string" },
          platformRef: { type: "string" },
          inputHash: { type: "string" },
        },
        required: ["capabilityName", "platform", "platformRef"],
      },
    },
    {
      name: "jobs__get",
      description: "Get a job by ID",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
    {
      name: "jobs__list",
      description: "List jobs with optional filters and pagination",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "executing", "completed", "failed"],
          },
          capabilityName: { type: "string" },
          platform: { type: "string" },
          limit: { type: "number" },
          offset: { type: "number" },
        },
      },
    },
    {
      name: "jobs__execute",
      description: "Transition a job from pending to executing",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
    {
      name: "jobs__complete",
      description: "Transition a job from executing to completed",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          outputHash: { type: "string" },
        },
        required: ["id"],
      },
    },
    {
      name: "jobs__fail",
      description: "Transition a job from executing to failed",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
    {
      name: "jobs__pending",
      description: "List all active (pending + executing) jobs",
      parameters: { type: "object", properties: {} },
    },
  ],

  async execute(toolName, args) {
    switch (toolName) {
      case "jobs__create": {
        const job = await jobs.create({
          capabilityName: args.capabilityName as string,
          platform: args.platform as string,
          platformRef: args.platformRef as string,
          inputHash: args.inputHash as string | undefined,
        });
        return { job };
      }
      case "jobs__get": {
        const job = await jobs.get(args.id as string);
        return { job: job ?? null };
      }
      case "jobs__list": {
        const list = await jobs.list({
          status: args.status as "pending" | "executing" | "completed" | "failed" | undefined,
          capabilityName: args.capabilityName as string | undefined,
          platform: args.platform as string | undefined,
          limit: args.limit as number | undefined,
          offset: args.offset as number | undefined,
        });
        return { jobs: list };
      }
      case "jobs__execute": {
        const job = await jobs.transition(args.id as string, "executing");
        return { job };
      }
      case "jobs__complete": {
        const job = await jobs.transition(args.id as string, "completed", {
          outputHash: args.outputHash as string | undefined,
        });
        return { job };
      }
      case "jobs__fail": {
        const job = await jobs.transition(args.id as string, "failed");
        return { job };
      }
      case "jobs__pending": {
        const active = await jobs.listActive();
        return { jobs: active };
      }
      default:
        throw new Error(`Unknown jobs tool: ${toolName}`);
    }
  },
});
