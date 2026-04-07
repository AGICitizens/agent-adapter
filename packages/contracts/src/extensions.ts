/**
 * Extension and lifecycle hook interfaces.
 */

export type RuntimeEvent =
  | "runtime:started"
  | "runtime:stopping"
  | "capability:discovered"
  | "capability:enabled"
  | "capability:disabled"
  | "job:created"
  | "job:executing"
  | "job:completed"
  | "job:failed"
  | "payment:received"
  | "payment:sent";

export interface Extension {
  readonly id: string;
  readonly name: string;

  /** Called when the extension is loaded. */
  initialize(): Promise<void>;

  /** Called on runtime events. */
  onEvent(event: RuntimeEvent, data: unknown): Promise<void>;

  /** Called when the runtime is shutting down. */
  dispose(): Promise<void>;
}
