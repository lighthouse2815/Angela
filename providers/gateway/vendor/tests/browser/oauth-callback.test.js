import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

let browser;
let server;
let closed;
let directory;
let port;
const password = randomBytes(32).toString("hex");

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "angela-oauth-browser-"));
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  port = listener.address().port;
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));

  server = spawn(process.execPath, [fileURLToPath(new URL("../../../dist/custom-server.js", import.meta.url))], {
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      DATA_DIR: directory,
      JWT_SECRET: randomBytes(32).toString("hex"),
      INITIAL_PASSWORD: password,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  closed = once(server, "close");
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) break;
    const response = await fetch(`http://127.0.0.1:${port}/api/health`).catch(() => null);
    if (response?.ok) {
      ready = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Build @angela/gateway before the browser tests. The standalone server did not start.");
  browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    const timeout = setTimeout(() => server.kill("SIGKILL"), 5000);
    await closed;
    clearTimeout(timeout);
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

// Report: http://127.0.0.1:1107/dashboard/providers/antigravity
// ROOT CAUSE:
// A localhost callback cannot relay to a dashboard on 127.0.0.1 because their origins differ.
// Local authorization must use the dashboard origin for both authorization and token exchange.
it.each(["127.0.0.1", "localhost"])("completes Antigravity OAuth once from %s", async hostname => {
  const origin = `http://${hostname}:${port}`;
  const context = await browser.newContext({ locale: "en-US" });
  try {
    const login = await context.request.post(`${origin}/api/auth/login`, { data: { password } });
    expect(login.status()).toBe(200);
    const exchanges = [];
    let authorization;
    await context.route("**/api/oauth/antigravity/exchange", async route => {
      exchanges.push(route.request().postDataJSON());
      await route.fulfill({ json: { success: true } });
    });
    // Only the external Google flow and token exchange are fixtures. The dashboard and callback are real pages.
    await context.route("https://accounts.google.com/**", async route => {
      authorization = new URL(route.request().url());
      const callback = new URL(authorization.searchParams.get("redirect_uri"));
      callback.searchParams.set("state", authorization.searchParams.get("state"));
      callback.searchParams.set("code", "browser-regression-code");
      await route.fulfill({ status: 302, headers: { location: callback.href }, body: "" });
    });

    const page = await context.newPage();
    await page.goto(`${origin}/dashboard/providers/antigravity`);
    await page.getByRole("button", { name: /Add Connection/ }).first().click();
    await page.getByRole("button", { name: /I Understand, Continue/ }).click();

    await expect.poll(() => exchanges.length, { timeout: 5000 }).toBe(1);
    expect(authorization.searchParams.get("redirect_uri")).toBe(`${origin}/callback`);
    expect(exchanges[0]).toMatchObject({
      code: "browser-regression-code",
      state: authorization.searchParams.get("state"),
      redirectUri: `${origin}/callback`,
    });
    await expect.poll(() => page.getByRole("heading", { name: "Connect Antigravity", exact: true }).count()).toBe(0);
    // The callback also sends BroadcastChannel and storage events. They must not exchange the code again.
    await page.waitForTimeout(500);
    expect(exchanges).toHaveLength(1);
  } finally {
    await context.close();
  }
}, 20_000);
