import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadConfig } from "./index.js";

const fixture = (name: string) => join(__dirname, "fixtures", name);

describe("loadConfig", () => {
  // ── Valid configs ──

  it("parses minimal config and applies defaults", () => {
    const cfg = loadConfig(fixture("valid-minimal.yaml"));

    expect(cfg.name).toBe("test-adapter");
    expect(cfg.mode).toBe("self-hosted");
    expect(cfg.database.driver).toBe("sqlite");
    expect(cfg.server.host).toBe("127.0.0.1");
    expect(cfg.server.port).toBe(3000);
    expect(cfg.server.dashboard).toBe(false);
    expect(cfg.agent.enabled).toBe(false);
    expect(cfg.agent.maxToolRounds).toBe(10);
    expect(cfg.agent.llmProvider).toBeUndefined();
    expect(cfg.agent.llmModel).toBeUndefined();
    expect(cfg.agent.llmApiKey).toBeUndefined();
    expect(cfg.capabilities).toEqual([]);
    expect(cfg.payments).toEqual([]);
    expect(cfg.plugins).toEqual([]);
    expect(cfg.drivers).toEqual([]);
  });

  it("parses full config with all fields", () => {
    const cfg = loadConfig(fixture("valid-full.yaml"));

    expect(cfg.mode).toBe("self-hosted");
    expect(cfg.database.driver).toBe("sqlite");
    expect(cfg.database.path).toBe("./adapter.db");
    expect(cfg.wallet.chains).toEqual(["eip155:1", "eip155:137"]);
    expect(cfg.server.port).toBe(8080);
    expect(cfg.agent.enabled).toBe(true);
    expect(cfg.agent.maxToolRounds).toBe(5);
    expect(cfg.agent.promptMode).toBe("append");
    expect(cfg.capabilities).toHaveLength(1);
    expect(cfg.capabilities[0]!.type).toBe("openapi");
    expect(cfg.payments).toHaveLength(1);
    expect(cfg.plugins).toHaveLength(1);
    expect(cfg.drivers).toHaveLength(1);
  });

  it("resolves ${VAR} placeholders from env", () => {
    process.env.TEST_LLM_KEY = "sk-from-env";
    try {
      const cfg = loadConfig(fixture("valid-env.yaml"));
      expect(cfg.agent.llmApiKey).toBe("sk-from-env");
    } finally {
      delete process.env.TEST_LLM_KEY;
    }
  });

  // ── Invalid configs ──

  it("throws on unset env var", () => {
    delete process.env.TEST_LLM_KEY;
    expect(() => loadConfig(fixture("valid-env.yaml"))).toThrowError(
      'Environment variable "TEST_LLM_KEY" is not set',
    );
  });

  it("throws when required field 'name' is missing", () => {
    expect(() => loadConfig(fixture("invalid-missing-name.yaml"))).toThrow();
  });

  it("throws when required 'wallet' is missing", () => {
    expect(() => loadConfig(fixture("invalid-missing-wallet.yaml"))).toThrow();
  });

  it("throws when agent is enabled without required LLM settings", () => {
    expect(() => loadConfig(fixture("invalid-agent-missing-llm.yaml"))).toThrow(
      "agent.llmProvider is required when agent.enabled is true",
    );
  });

  it("throws on invalid enum value for mode", () => {
    expect(() => loadConfig(fixture("invalid-bad-enum.yaml"))).toThrow();
  });

  it("throws when hosted/postgres mode is requested before implementation", () => {
    expect(() =>
      loadConfig(fixture("invalid-hosted-not-implemented.yaml")),
    ).toThrow('Hosted mode is planned but not implemented yet');
  });

  it("throws on invalid port type", () => {
    expect(() => loadConfig(fixture("invalid-bad-port.yaml"))).toThrow();
  });

  it("throws when file does not exist", () => {
    expect(() => loadConfig(fixture("nope.yaml"))).toThrow();
  });
});
