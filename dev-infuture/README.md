# Future development

Angela currently prioritizes the Electron desktop and local AI.
This directory preserves deferred modules without deleting their code.
Git records the original paths as renames.

## Deferred modules

| Current path | Original path | Purpose | Resume when |
| --- | --- | --- | --- |
| `apps/stage-pocket` | `apps/stage-pocket` | Capacitor mobile app, Android and iOS projects | Mobile becomes a development target |
| `apps/ui-server-auth` | `apps/ui-server-auth` | Hosted login, account management, and Electron OIDC callback pages | Hosted accounts need development |
| `apps/component-calling` | `apps/component-calling` | Standalone component calling demo | The demo needs independent development |
| `server/apps/auth` | `server/apps/auth` | Better Auth and OIDC service | Hosted accounts and multi-user sessions become necessary |
| `server/docker-compose.yaml` | `server/docker-compose.yaml` | PostgreSQL, Redis, API, Auth, and Caddy stack | The hosted backend needs local integration tests |
| `server/dev` | `server/dev` | Caddy routing for the backend stack | The hosted backend resumes |
| `server/api-production` | `server/apps/api/production` | Railway Docker deployment | A hosted API deployment becomes necessary |
| `deploy/openpanel` | `deploy/openpanel` | OpenPanel deployment instructions | Hosted product analytics needs maintenance |

Current paths in this table are relative to `dev-infuture/`.
Original paths are relative to the repository root.
The auth UI still supports desktop cloud login when deployed remotely.
Moving its source does not change the desktop's configured remote endpoints.

## Dependencies and retained modules

The audit covered every tracked package manifest and its workspace dependencies.
It also covered imports, root scripts, pnpm, Turbo, TypeScript, Docker, tests, lint, Nix, and documentation references.
This checkout contains no `.github/` workflows.

- Mobile and auth UI consume shared UI, layouts, translations, fonts, and stage packages.
- Active desktop packages do not import either app's source or the standalone demo.
- Auth consumes `@proj-airi/auth-shared`. The active API does not import the Auth process.
- Compose uses the active API, shared schemas, and the archived Auth service.
- Railway builds the active API and shared packages. OpenPanel documents optional hosted analytics.

These modules remain active:

| Path | Reason |
| --- | --- |
| `apps/stage-tamagotchi` | Primary Electron desktop |
| `packages/core-agent`, `packages/provider-inference` | Agent execution and inference |
| Audio, pipelines, model drivers, stage packages, and UI packages | Voice, avatar, shared pages, and renderer dependencies |
| `services/computer-use-mcp`, `packages/airi-cli` | Local computer use and CLI |
| `integrations/telegram-bot` | Near-term Telegram integration |
| `packages/server-runtime`, `packages/server-sdk`, `packages/server-shared` | Desktop's local WebSocket channel and plugins |
| `server/apps/api` | `packages/stage-ui/src/composables/api.ts` imports its `AppType` |
| `server/packages/auth-shared` | API schemas depend on these auth contracts |
| `server/packages/server-sdk-shared` | Desktop chat stores and sync code consume these contracts |
| `apps/stage-web` | Audio test configuration and Nix refer directly to this app |
| `packages/memory-pgvector` | Memory remains in scope. Its name alone does not establish a cloud-only dependency |
| Kirie, engines, remaining integrations, plugins, and examples | No forced move without a complete dependency separation |
| `deploy/pitch` | Existing Angela presentation artifacts, independent of the cloud backend |

The API's type export reaches its Hono app and backend dependency graph.
Moving or excluding that package requires contract separation first.
This change keeps that boundary intact instead of redesigning it.
PostgreSQL and Redis processes are not required for local desktop development.
Backend libraries remain install dependencies because the API types still reference them.

## Default commands

Run these commands from the repository root:

```sh
pnpm install
pnpm dev:tamagotchi
```

`pnpm dev` also selects the desktop.
`pnpm dev:web` remains available for existing web and audio tooling.
The original root mobile and auth-UI shortcuts are removed from the default scripts.

`pnpm-workspace.yaml` excludes `dev-infuture/**`.
`catalog.yaml` preserves dependency versions used only by deferred packages.
It is a YAML fragment for insertion under the root `catalog` mapping.
Root build and typecheck filters select active workspace packages only.
Root Vitest omits archived Auth and auth-UI projects.
ESLint, oxlint, alint, and the root TypeScript configuration exclude this directory.
Turbo needs no extra exclusion because it uses the pnpm workspace graph.
Mobile release version paths now point here.
Agent guides distinguish active contracts from deferred modules.
Use this document for activation steps.

## Resume a deferred package

1. Review its original dependencies in `package.json`.
2. Restore its catalog entries from `dev-infuture/catalog.yaml` under the root `catalog` mapping.
3. Remove `!dev-infuture/**` from `pnpm-workspace.yaml`.
4. Add the exact package path under `packages` in that file.
5. Add the same path to root `package.json` workspaces.
6. Narrow root lint exclusions to the modules that remain deferred.
7. Run `pnpm install` to regenerate the lockfile and package links.
8. For mobile, run `pnpm -F @proj-airi/stage-pocket exec cap sync` to refresh native dependency paths.
9. Run its typecheck, build, and relevant tests.
10. Restore root shortcuts and test projects only for the selected module.

For example, add `dev-infuture/apps/stage-pocket` to resume mobile.
Then use these commands from the root:

```sh
pnpm -F @proj-airi/stage-pocket dev:ios
pnpm -F @proj-airi/stage-pocket dev:android
pnpm -F @proj-airi/stage-pocket lint:swift
pnpm -F @proj-airi/stage-pocket exec cap open ios
```

Use `pnpm -F @proj-airi/ui-server-auth dev` after activating the auth UI.
Its `VITE_WEB_APP_URL` configuration remains required.

For deferred backend edits, read [`server/AGENTS.md`](../server/AGENTS.md).
For Auth, activate `dev-infuture/server/apps/auth`.
Its schema generator writes to the active `server/packages/auth-shared` package.
Review generated schema changes with the API migration owner.

The optional backend command remains available:

```sh
pnpm dev:backend
```

Compose resolves its context and API environment files from the active repository.
The Auth Dockerfile restores the deferred catalog and opts its package into the container workspace before installation.
Archived package configurations use local TypeScript exclusions so the root archive exclusion cannot hide their source after activation.
That opt-in installation regenerates the container lockfile because archived importers are absent from the default lockfile.
Railway's Dockerfile now lives at `dev-infuture/server/api-production/railway/Dockerfile`.
Use the repository root as its Docker context.
Cloud deployment is deferred. Container builds still need separate verification before deployment.
