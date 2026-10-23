import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTOML } from "confbox";
import { gatewayApiBase, normalizeApiBase } from "../../src/shared/utils/gateway-endpoint";
import { POST as applyCodex } from "../../src/app/api/cli-tools/codex-settings/route";
import { POST as applyClaude } from "../../src/app/api/cli-tools/claude-settings/route";

describe("gateway endpoints", () => {
  it("uses Angela's default port and path", () => {
    expect(gatewayApiBase()).toBe("http://127.0.0.1:1107/angela1");
    expect(gatewayApiBase("http://127.0.0.1:9011/")).toBe("http://127.0.0.1:9011/angela1");
    expect(gatewayApiBase("https://tunnel.example")).toBe("https://tunnel.example/angela1");
    expect(gatewayApiBase("")).toBe("");
  });

  it.each(["http://127.0.0.1:1107/angela1", "https://custom.example/v1", "https://custom.example/proxy/v1"])("preserves the explicit API path in %s", (url) => {
    expect(normalizeApiBase(`${url}/`)).toBe(url);
    expect(gatewayApiBase(`${url}/`)).toBe(url);
  });

  it("keeps OpenAI normalization for custom origins", () => {
    expect(normalizeApiBase("https://custom.example/")).toBe("https://custom.example/v1");
    expect(normalizeApiBase("")).toBe("");
  });
});

describe("CLI tool settings", () => {
  let home;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "angela-endpoint-test-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
  });

  it.each(["http://127.0.0.1:1107/angela1", "https://custom.example/v1"])("writes the selected endpoint unchanged for Codex and Claude: %s", async (baseUrl) => {
    const codex = await applyCodex(new Request("http://localhost/api/cli-tools/codex-settings", {
      method: "POST",
      body: JSON.stringify({ baseUrl, apiKey: "test-key", model: "test/model" }),
    }));
    expect(codex.status).toBe(200);
    const config = parseTOML(await readFile(join(home, ".codex/config.toml"), "utf8"));
    expect(config.model_providers["9router"].base_url).toBe(baseUrl);

    const claude = await applyClaude(new Request("http://localhost/api/cli-tools/claude-settings", {
      method: "POST",
      body: JSON.stringify({ env: { ANTHROPIC_BASE_URL: baseUrl } }),
    }));
    expect(claude.status).toBe(200);
    const settings = JSON.parse(await readFile(join(home, ".claude/settings.json"), "utf8"));
    expect(settings.env.ANTHROPIC_BASE_URL).toBe(baseUrl);
  });
});
