import type { RuntimeEvent } from "./events.js";

export interface ExtensionLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface ExtensionContext {
  emit(event: RuntimeEvent): void;
  log: ExtensionLogger;
}

export interface ExtensionPlugin {
  readonly name: string;
  init?(ctx: ExtensionContext): Promise<void> | void;
  onEvent?(event: RuntimeEvent, ctx: ExtensionContext): Promise<void> | void;
  shutdown?(ctx: ExtensionContext): Promise<void> | void;
}
