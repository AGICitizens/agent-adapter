import boxen from "boxen";
import chalk from "chalk";

const RULE_WIDTH = 60;

export function banner(title: string): void {
  process.stdout.write(
    boxen(chalk.magenta.bold(title), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: "round",
      borderColor: "magenta",
    }) + "\n",
  );
}

export function sectionRule(title: string): void {
  const dashes = "─".repeat(Math.max(2, RULE_WIDTH - title.length - 4));
  process.stdout.write(`\n${chalk.cyan(`── ${title} ${dashes}`)}\n\n`);
}

export function step(num: number, message: string): void {
  process.stdout.write(`  ${chalk.dim(`[${pad2(num)}]`)} ${message}\n`);
}

export function detail(label: string, value: string): void {
  process.stdout.write(`        ${chalk.dim(label + ":")} ${chalk.bold(value)}\n`);
}

export function note(message: string): void {
  process.stdout.write(`        ${chalk.dim(message)}\n`);
}

export function success(message: string): void {
  process.stdout.write(`        ${chalk.green("✓")} ${message}\n`);
}

export function warn(message: string): void {
  process.stdout.write(`        ${chalk.yellow("!")} ${chalk.yellow(message)}\n`);
}

export function fail(message: string): void {
  process.stdout.write(`        ${chalk.red("✗")} ${chalk.red(message)}\n`);
}

export function roundHeader(round: number, latencyMs?: number, toolCalls?: number): void {
  const latency = latencyMs !== undefined ? chalk.dim(` ${(latencyMs / 1000).toFixed(1)}s`) : "";
  const calls =
    toolCalls !== undefined
      ? chalk.dim(` → ${toolCalls} tool call${toolCalls === 1 ? "" : "s"}`)
      : "";
  process.stdout.write(`\n${chalk.bold(`Round ${round}`)}${latency}${calls}\n`);
}

export type ActionKind = "NET" | "KEY" | "SEC" | "DB" | "CAP" | "JOB" | "SYS";

const TAG_COLOR: Record<ActionKind, (s: string) => string> = {
  NET: chalk.yellow,
  KEY: chalk.magenta,
  SEC: chalk.red,
  DB: chalk.blue,
  CAP: chalk.green,
  JOB: chalk.hex("#a78bfa"),
  SYS: chalk.gray,
};

export function tag(kind: ActionKind, message: string, body?: string, latency?: string): void {
  const tagText = TAG_COLOR[kind](kind);
  const tail = latency ? chalk.dim(` ${latency}`) : "";
  process.stdout.write(`  ${chalk.cyan("▸")} ${tagText} ${message}${tail}\n`);
  if (body) process.stdout.write(`    ${chalk.dim(body)}\n`);
}

export function tagResponse(message: string, body?: string, latency?: string): void {
  const tail = latency ? chalk.dim(` ${latency}`) : "";
  process.stdout.write(`  ${chalk.cyan("◂")} ${message}${tail}\n`);
  if (body) process.stdout.write(`    ${chalk.dim(body)}\n`);
}

export function bullet(message: string): void {
  process.stdout.write(`  ${chalk.green("●")} ${message}\n`);
}

export function plain(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function blank(): void {
  process.stdout.write("\n");
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function shortHash(hex: string, leading = 10, trailing = 6): string {
  if (hex.length <= leading + trailing + 1) return hex;
  return `${hex.slice(0, leading)}…${hex.slice(-trailing)}`;
}

export function shortAddr(addr: string): string {
  return shortHash(addr, 6, 4);
}
