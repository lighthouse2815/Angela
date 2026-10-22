# Angela Gateway CLI verification

Date: 2026-10-23
Environment: Linux, Node.js 26.11.1, pnpm 11.24.0.

## Delivered scope

Angela includes the provider engine as source and builds it through the `@angela/gateway` workspace package.
Neither workspace depends on a separately published upstream gateway package.
The imported registry contains 134 provider definitions, including LLM and media services.
The [source record](../../../third_party/angela-gateway/README.angela.md) identifies the pinned revision and MIT notice.

The CLI controls startup, account inspection, key-based account creation, account activation, model discovery, and shared provider selection.
OAuth and special imports use the bundled local dashboard.
Startup binds to loopback and starts token refresh without the upstream system-service bootstrap.

## Checks

| Command | Result |
| --- | --- |
| `pnpm -F @angela/gateway build` | Passed. Standalone engine and dashboard built from repository source. |
| `pnpm -F @angela/cli build` | Passed. CLI executable and lazy command modules built. |
| `pnpm -F @angela/cli typecheck` | Passed. |
| `pnpm typecheck` | Passed, 53 tasks. |
| `pnpm lint` | Passed, zero errors and 603 warnings. |
| `pnpm install --frozen-lockfile --ignore-scripts` | Passed, including supply-chain policy checks for 3,044 entries. |

CLI regression command, from the repository root:

```sh
pnpm -F @angela/cli exec vitest run --config vitest.config.ts --exclude src/gateway.test.ts --maxWorkers=1 --no-file-parallelism
```

Result: 72 files, 853 tests passed.

Gateway integration command:

```sh
pnpm -F @angela/cli exec vitest run --config vitest.config.ts src/gateway.test.ts --maxWorkers=1 --no-file-parallelism
```

Result: six tests passed. They cover private configuration, occupied ports, authentication boundaries, model routing, streaming, account persistence, and shared configuration.
The tests also pack and start the actual engine outside the checkout.
This caught package-manager symlinks missing from archives. The isolated hoisted install and standalone copy resolve that failure.

Engine unit command, from `third_party/angela-gateway`, with `DATA_DIR` set to a fresh temporary directory:

```sh
../../node_modules/.bin/vitest run --config tests/vitest.config.js tests/unit/dashboard-guard.test.js tests/unit/background-token-refresh.test.js tests/unit/token-refresh-dispatch.test.js tests/unit/token-refresh-generic.test.js tests/unit/codex-refresh-token.test.js tests/unit/key-access.test.js --maxWorkers=1 --no-file-parallelism
```

Result: six files, 77 tests passed.
The Codex test now matches the existing ten-minute registry policy. Its previous five-day expectation failed before correction.

Whitespace checks pass for Angela-owned changes. Imported upstream whitespace remains in the vendored tree.
Oxlint and ESLint exclude vendored sources from project-style autofixes. Engine compilation and unit tests remain active.

## Verification boundaries

All inference requests used a local synthetic provider. No paid model or personal AI account was accessed.
Real OAuth, provider quotas, and live availability still require account-owner verification.
The integration does not add native desktop account screens, remote exposure, or a background service installer.
Existing user deletions of the root and OpenSeeFace licenses remain outside this change.
