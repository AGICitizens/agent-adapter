import type { AdapterIdentity, EvmAddress, Hex } from "@agent-adapter/contracts";

export type BuyerEvent =
  | { kind: "boot"; goal: string; subname: string; model: string; buyerAddress: EvmAddress }
  | { kind: "round-start"; round: number }
  | { kind: "thinking"; round: number; latencyMs: number }
  | { kind: "tool-call"; round: number; tool: string; args: unknown }
  | { kind: "tool-result"; round: number; tool: string; result: unknown }
  | { kind: "tool-error"; round: number; tool: string; message: string }
  | { kind: "ens-resolved"; round: number; subname: string; identity: AdapterIdentity }
  | { kind: "x402-challenge"; round: number; capability: string; amount: string; nonce: Hex }
  | {
      kind: "x402-paid";
      round: number;
      capability: string;
      txHash: Hex;
      nonce: Hex;
      escrowAddress?: EvmAddress;
    }
  | { kind: "x402-verified"; round: number; capability: string }
  | { kind: "result"; round: number; payload: unknown }
  | { kind: "error"; round: number; message: string }
  | { kind: "done"; rounds: number; totalLatencyMs: number };

export type BuyerEventEmitter = (event: BuyerEvent) => void;

export const stdoutEmitter: BuyerEventEmitter = (event) => {
  process.stdout.write(`${JSON.stringify({ ts: Date.now(), ...event })}\n`);
};
