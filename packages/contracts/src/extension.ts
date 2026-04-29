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

/**
 * Extensions subscribe to runtime lifecycle events. They are optional and
 * provider-installed (notifiers, automation, custom audit logs, etc).
 * Extensions never block the main request path.
 */
export interface ExtensionPlugin {
  readonly name: string;
  init?(ctx: ExtensionContext): Promise<void> | void;
  onEvent?(event: RuntimeEvent, ctx: ExtensionContext): Promise<void> | void;
  shutdown?(ctx: ExtensionContext): Promise<void> | void;
}
