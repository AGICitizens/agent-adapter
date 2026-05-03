import type OpenAI from "openai";
import type { BuyerEventEmitter } from "./events.js";
import {
  TOOL_DEFINITIONS,
  handleRequestCapability,
  handleResolveProvider,
  type ToolEnv,
  type ResolveProviderArgs,
  type RequestCapabilityArgs,
  type ReportResultArgs,
} from "./tools.js";

export interface RunLoopInput {
  goal: string;
  defaultSubname: string;
  maxRounds: number;
  llm: OpenAI;
  model: string;
  toolEnv: ToolEnv;
  emitEvent: BuyerEventEmitter;
}

export interface RunLoopResult {
  rounds: number;
  totalLatencyMs: number;
  finalAnswer?: string;
  finalPayload?: unknown;
}

const SYSTEM_PROMPT = (defaultSubname: string) => `
You are a buyer agent for the Agent Adapter framework. Your job is to satisfy a user goal by:
1. resolving a provider's ENS subname to discover its endpoint, capabilities, and pricing
2. calling the right capability with the right parameters
3. paying any 402 challenges automatically through the escrow contract (the framework handles this)
4. reporting the final answer

Default provider: ${defaultSubname}. Use it unless the goal names a different ENS subname.

Capability hints (the framework forwards your query params to the upstream API):
- 'forecast' (weather adapter, backed by open-meteo): REQUIRED query params:
    latitude  (number, WGS84) — Tokyo: 35.6762, San Francisco: 37.7749, London: 51.5074, New York: 40.7128
    longitude (number, WGS84) — Tokyo: 139.6503, San Francisco: -122.4194, London: -0.1278, New York: -74.0060
    current=temperature_2m  (string, selects the variables returned)
  Response is JSON. Read 'current.temperature_2m' for the temperature in degrees Celsius.

Rules:
- Always call resolve_provider before request_capability.
- Call report_result exactly once when you have the answer or determine the goal is impossible.
- Prefer the simplest capability call that satisfies the goal.
- If a tool returns an empty body or error, inspect it and try corrected inputs once before giving up.
`.trim();

export async function runLoop(input: RunLoopInput): Promise<RunLoopResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT(input.defaultSubname) },
    { role: "user", content: input.goal },
  ];

  const startedAt = Date.now();
  let finalAnswer: string | undefined;
  let finalPayload: unknown;
  let round = 0;

  while (round < input.maxRounds) {
    round += 1;
    input.emitEvent({ kind: "round-start", round });

    const callStart = Date.now();
    const completion = await input.llm.chat.completions.create({
      model: input.model,
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
    });
    input.emitEvent({ kind: "thinking", round, latencyMs: Date.now() - callStart });

    const choice = completion.choices[0];
    if (!choice?.message) {
      input.emitEvent({ kind: "error", round, message: "LLM returned no choices" });
      break;
    }

    messages.push(choice.message);

    const toolCalls = choice.message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      finalAnswer = choice.message.content ?? "";
      break;
    }

    let reportCalled = false;

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") continue;
      const name = toolCall.function.name;
      let args: unknown;
      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch (err) {
        input.emitEvent({
          kind: "tool-error",
          round,
          tool: name,
          message: `arguments JSON parse failed: ${describeError(err)}`,
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: "invalid_arguments" }),
        });
        continue;
      }

      input.emitEvent({ kind: "tool-call", round, tool: name, args });

      try {
        const result = await dispatchTool(name, args, input.toolEnv, round);
        input.emitEvent({ kind: "tool-result", round, tool: name, result });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });

        if (name === "report_result") {
          const reportArgs = args as ReportResultArgs;
          finalAnswer = reportArgs.answer;
          finalPayload = reportArgs.payload;
          input.emitEvent({ kind: "result", round, payload: result });
          reportCalled = true;
        }
      } catch (err) {
        const message = describeError(err);
        input.emitEvent({ kind: "tool-error", round, tool: name, message });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: message }),
        });
      }
    }

    if (reportCalled) break;
  }

  const totalLatencyMs = Date.now() - startedAt;
  input.emitEvent({ kind: "done", rounds: round, totalLatencyMs });

  return { rounds: round, totalLatencyMs, finalAnswer, finalPayload };
}

async function dispatchTool(
  name: string,
  args: unknown,
  env: ToolEnv,
  round: number,
): Promise<unknown> {
  switch (name) {
    case "resolve_provider":
      return handleResolveProvider(args as ResolveProviderArgs, env, round);
    case "request_capability":
      return handleRequestCapability(args as RequestCapabilityArgs, env, round);
    case "report_result": {
      const a = args as ReportResultArgs;
      return { acknowledged: true, answer: a.answer };
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
