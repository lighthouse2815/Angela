# Angela Gateway

Angela Gateway is the local multi-account provider engine included with Angela CLI.
It provides account login, token refresh, model routing, streaming, fallback, and a shared inference key.

The complete provider implementation lives in [the vendored source](../../third_party/angela-gateway).
Users do not install a separate gateway application or registry package.

## Build

From the repository root, run `pnpm build:cli`.
The workspace dependency builds this package before the CLI.
The build installs locked engine dependencies in an isolated workspace and creates a standalone server in `dist/`.
Its React dependencies do not enter the main Vue workspace.
The build uses temporary private state, not the account directory.

`pnpm package:cli` includes this package and its built server in the portable release.
Node.js remains a runtime requirement. pnpm and the source checkout are not runtime requirements.

## Use

```sh
angela gateway start
```

In another terminal:

```sh
angela gateway login
angela gateway password --show
angela gateway accounts
angela gateway models
angela gateway use --model PROVIDER_ALIAS/MODEL_ID
angela
```

`login` prints the local dashboard address. Account authentication uses the browser when the provider requires it.
Keep the foreground gateway open. Ctrl+C stops its server.
The API endpoint is `http://127.0.0.1:20129/v1/` by default.

## Boundaries

This package is for local provider accounts. It is not Angela's hosted resource API or a memory store.
It does not configure other AI tools, install a tray, or update global applications during startup.
The inference key cannot access account management.
Remote exposure, TLS, service installation, and desktop account screens are outside this CLI-first integration.

Provider availability, subscription access, and authentication requirements remain controlled by each provider.
The included engine does not grant access to models or quotas that an account does not have.

See [provenance and local changes](../../third_party/angela-gateway/README.angela.md) for copyright and upstream details.
