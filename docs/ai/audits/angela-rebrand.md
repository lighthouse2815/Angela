# Angela namespace migration audit

Baseline: `5227709` on `main`, 2026-10-22.

## Workspace graph

The workspace contains 71 manifests, including the root, and 200 `workspace:` dependency declarations.
Every workspace dependency resolves to a manifest. No npm dependency is renamed.
Source packages keep their export paths and module boundaries.
The Kirie-only `stage-host-context` alias changes with its Vite and TypeScript mappings.

| Manifest | Package |
| --- | --- |
| `apps/desktop-kirie/package.json` | `@angela/desktop-kirie` |
| `apps/desktop/package.json` | `@angela/desktop` |
| `apps/stage-web/package.json` | `@angela/web` |
| `engines/stage-tamagotchi-godot/package.json` | `@angela/stage-tamagotchi-godot` |
| `integrations/discord-bot/package.json` | `@angela/discord-bot` |
| `integrations/minecraft/package.json` | `@angela/minecraft-bot` |
| `integrations/satori-bot/package.json` | `@angela/satori-bot` |
| `integrations/telegram-bot/package.json` | `@angela/telegram-bot` |
| `integrations/twitter-services/package.json` | `@angela/twitter-services` |
| `integrations/vscode/airi-plugin-vscode/package.json` | `@angela/plugin-vscode` |
| `integrations/vscode/vscode-airi/package.json` | `airi-vscode` |
| `package.json` | `@angela/root` |
| `packages/angela-cli/package.json` | `@angela/cli` |
| `packages/audio/package.json` | `@angela/audio` |
| `packages/better-ws/package.json` | `@angela/better-ws` |
| `packages/cap-vite/package.json` | `@angela/cap-vite` |
| `packages/ccc/package.json` | `@angela/ccc` |
| `packages/core-agent/package.json` | `@angela/core-agent` |
| `packages/core-character/package.json` | `@angela/core-character` |
| `packages/electron-eventa/package.json` | `@angela/electron-eventa` |
| `packages/electron-screen-capture/package.json` | `@angela/electron-screen-capture` |
| `packages/electron-vueuse/package.json` | `@angela/electron-vueuse` |
| `packages/font-chillroundm/package.json` | `@angela/font-chillroundm` |
| `packages/font-cjkfonts-allseto/package.json` | `@angela/font-cjkfonts-allseto` |
| `packages/font-departure-mono/package.json` | `@angela/font-departure-mono` |
| `packages/font-xiaolai/package.json` | `@angela/font-xiaolai` |
| `packages/i18n/package.json` | `@angela/i18n` |
| `packages/input-gamepad-vueuse/package.json` | `@angela/input-gamepad-vueuse` |
| `packages/input-gamepad/package.json` | `@angela/input-gamepad` |
| `packages/input-playstation-dualsense-5/package.json` | `@angela/input-playstation-dualsense-5` |
| `packages/local-config/package.json` | `@angela/local-config` |
| `packages/memory-pgvector/package.json` | `@angela/memory-pgvector` |
| `packages/model-driver-lipsync/package.json` | `@angela/model-driver-lipsync` |
| `packages/model-driver-magic-live2d/package.json` | `@angela/model-driver-magic-live2d` |
| `packages/model-driver-mediapipe/package.json` | `@angela/model-driver-mediapipe` |
| `packages/motion-driver-magic/package.json` | `@angela/motion-driver-magic` |
| `packages/pipelines-audio/package.json` | `@angela/pipelines-audio` |
| `packages/plugin-protocol/package.json` | `@angela/plugin-protocol` |
| `packages/plugin-sdk-tamagotchi/package.json` | `@angela/plugin-sdk-tamagotchi` |
| `packages/plugin-sdk/package.json` | `@angela/plugin-sdk` |
| `packages/provider-inference/package.json` | `@angela/provider-inference` |
| `packages/scenarios-stage-tamagotchi-browser/package.json` | `@angela/scenarios-stage-tamagotchi-browser` |
| `packages/scenarios-stage-tamagotchi-electron/package.json` | `@angela/scenarios-stage-tamagotchi-electron` |
| `packages/server-runtime/package.json` | `@angela/server-runtime` |
| `packages/server-sdk/package.json` | `@angela/server-sdk` |
| `packages/server-shared/package.json` | `@angela/server-shared` |
| `packages/stage-layouts/package.json` | `@angela/stage-layouts` |
| `packages/stage-pages/package.json` | `@angela/stage-pages` |
| `packages/stage-shared/package.json` | `@angela/stage-shared` |
| `packages/stage-ui-live2d/package.json` | `@angela/stage-ui-live2d` |
| `packages/stage-ui-mmd/package.json` | `@angela/stage-ui-mmd` |
| `packages/stage-ui-spine/package.json` | `@angela/stage-ui-spine` |
| `packages/stage-ui-tachie/package.json` | `@angela/stage-ui-tachie` |
| `packages/stage-ui-three/package.json` | `@angela/stage-ui-three` |
| `packages/stage-ui/package.json` | `@angela/stage-ui` |
| `packages/stream-kit/package.json` | `@angela/stream-kit` |
| `packages/testing-audio/package.json` | `@angela/testing-audio` |
| `packages/ui-loading-screens/package.json` | `@angela/ui-loading-screens` |
| `packages/ui-transitions/package.json` | `@angela/ui-transitions` |
| `packages/ui/package.json` | `@angela/ui` |
| `packages/unocss-preset-fonts/package.json` | `@angela/unocss-preset-fonts` |
| `packages/vite-plugin-sherpaw/package.json` | `@angela/vite-plugin-sherpaw` |
| `packages/vitest-plugin-fakemic/package.json` | `@angela/vitest-plugin-fakemic` |
| `plugins/airi-plugin-bilibili-laplace/package.json` | `@angela/plugin-bilibili-laplace` |
| `plugins/airi-plugin-claude-code/package.json` | `@angela/plugin-claude-code` |
| `plugins/airi-plugin-game-chess/package.json` | `@angela/plugin-game-chess` |
| `plugins/airi-plugin-web-extension/package.json` | `@angela/plugin-web-extension` |
| `server/apps/api/package.json` | `@angela/api-server` |
| `server/packages/auth-shared/package.json` | `@angela/auth-shared` |
| `server/packages/server-sdk-shared/package.json` | `@angela/server-sdk-shared` |
| `services/computer-use-mcp/package.json` | `@angela/computer-use-mcp` |

## External npm packages

These packages have registry versions and integrity records in the lockfile. They are outside this workspace.
Seven appear in the catalog. `duckdb-wasm` is a transitive npm dependency of `drizzle-duckdb-wasm`.
Their `@proj-airi` namespace, import subpaths, catalogs, and release-age policy remain unchanged.

| Package | Referencing files at baseline |
| --- | --- |
| `@proj-airi/chromatic` | 4 |
| `@proj-airi/drizzle-duckdb-wasm` | 17 |
| `@proj-airi/duckdb-wasm` | 6 translated documents and the lockfile |
| `@proj-airi/iconify-meteocons` | 6 |
| `@proj-airi/lobe-icons` | 8 |
| `@proj-airi/unocss-preset-chromatic` | 6 |
| `@proj-airi/unplugin-fetch` | 10 |
| `@proj-airi/unplugin-live2d-sdk` | 9 |

## Compatibility and external references

- MCP `Client` names that start with `@proj-airi/` are protocol metadata, not workspace dependencies.
  This includes `airi-cli`, `computer-use-mcp-*`, and `e2e-*` client names.
- Electron profiles keep `AIRI` for packaged builds and `@proj-airi/stage-tamagotchi` for development.
- `Symbol('@proj-airi/chromatic-hue')` labels a Vue injection key. It is not a package import.
- `@proj-airi/duckdb-wasm` is an external transitive npm package, also referenced in translated upstream documentation.
- Deferred `stage-pocket` and `auth-server` belong to `../dev-in-future`, outside this repository's workspace.
- External npm packages retain their upstream repository links and package names.
- AIRI env variables, IPC/Eventa names, debug globals, URL schemes, storage keys, and card schema fields remain supported contracts.
- Existing plugin IDs, `extension.airi.json`, VS Code extension IDs, commands, and settings remain compatible.
- Old release URLs, issue links, credits, third-party assets, and historical investigation evidence retain their original meaning.

## Reproduce the inventory

```sh
pnpm list --recursive --depth -1
rg --hidden --glob '!.git' --glob '!node_modules' '@proj-airi/'
rg --hidden --glob '!.git' --glob '!node_modules' -i 'airi|moeru-ai/airi|airi\.moeru\.ai'
```

The first command lists actual workspace packages. The other commands also include protocol identifiers and upstream evidence.
Classify each result before changing it.

## Namespace verification

- `pnpm install --frozen-lockfile --ignore-scripts --network-concurrency=1 --child-concurrency=1`: passed.
- `pnpm --workspace-concurrency=1 --filter './packages/**' run build`: passed.
- `pnpm --filter @angela/cli... --workspace-concurrency=1 run build`: passed, including Discord and the MCP service.
- Root `pnpm typecheck --concurrency=1 --continue`: 46 tasks passed, then `stage-ui` exceeded a 2048 MiB heap.
- CLI, core-agent, and Discord tests: 75 files passed, 623 tests passed, one skipped.
- Desktop plugin/profile tests: 2 files and 68 tests passed.
- Plugin SDK tests: 13 files and 113 tests passed.
- Server runtime tests: 8 files and 52 tests passed.
- Server SDK tests: 3 files and 21 tests passed.
- The full Node test run was stopped during API database tests to limit RAM. Focused suites replace that run.

The local pnpm launcher lacks a shebang. Turbo uses the cached pnpm shim on `PATH` during checks.
Checks set `pnpm_config_verify_deps_before_run=false` after explicit installation.
This prevents pnpm from running the full postinstall during each formatting change.

- Root `pnpm lint`: passed, zero errors. Existing warnings remain.

## Structural paths

| Previous directory | Current directory |
| --- | --- |
| `packages/airi-cli` | `packages/angela-cli` |
| `apps/stage-tamagotchi` | `apps/desktop` |
| `apps/stage-tamagotchi-kirie` | `apps/desktop-kirie` |

The CLI, web, and desktop build graph retains all 50 tasks and every dependency edge.
The lockfile importer paths change in the same commit. No external resolution changes.

- Frozen installation passed after the moves.
- CLI build, typecheck, and built `--help` passed.
- CLI path/configuration/MCP/perception checks: 8 files and 58 tests passed.
- Desktop plugin/profile checks: 2 files and 68 tests passed.
- ESLint on modified configuration and source files passed with zero errors.

## Product branding and supported old identifiers

UI labels, localized product text, prompts, package descriptions, repository metadata, OpenRouter attribution, and updater fixtures use Angela.
The original authors, copyright notices, historical posts, third-party assets, and upstream npm projects retain their attribution.
Translated READMEs identify the upstream project and send product downloads to Angela's release page.

These identifiers remain supported without conversion:

- Electron `AIRI` and `@proj-airi/stage-tamagotchi` profile directories preserve user data.
- The stored main-window record still uses the title `AIRI` as its lookup key. Its visible window title is Angela.
- Godot's `config/name="AIRI"` keeps existing `user://` microphone permissions and spotlight settings.
- Local certificate issuer `AIRI`, its organization, and CA filenames remain trusted.
- `AIRI_*` and `VITE_AIRI_*` env names, Eventa/IPC names, WebSocket identities, telemetry attributes, and debug globals remain stable.
- `airi-*` URL schemes, card/module IDs, `engines.airi`, `extension.airi.json`, sticker IDs, and exported adapter names remain stable.
- VS Code publisher/package IDs, command IDs, and configuration keys preserve existing extension settings.
- External hosted-provider endpoints, Player2 game keys, model asset locations, and documentation URLs remain upstream addresses.
- `bucket/airi.json` remains an installer for published upstream AIRI binaries. It does not pretend to install Angela.
- `scripts/build-airi-docs.sh` builds the external `moeru-ai/airi-docs` repository and retains its env contract.

Computer-use denies both `airi` and `angela`. Debug target selection accepts both visible titles.
No external dependency versions, snapshots, integrity data, catalogs, overrides, or patches changed from baseline `5227709`.

Nix hash update helpers now use the `angela` flake output. This machine has no Nix executable.
Nix dependency and asset hashes cannot be regenerated or verified here.

## Final build and regression checks

All builds used one workspace task at a time and `RAYON_NUM_THREADS=1`.
CLI tests used one worker and a 1536 MiB heap. Frontend builds used a 2048 MiB heap.
The final full typecheck used a 2560 MiB heap with one task at a time.

| Check | Result |
| --- | --- |
| Packages and CLI dependency graph build | Passed |
| CLI final build, typecheck, and built `--help` | Passed |
| `pnpm --filter @angela/web... --workspace-concurrency=1 run build` | Passed |
| `pnpm -F @angela/desktop build` | Passed, main/preload/renderer |
| `pnpm -F @angela/desktop-kirie build` | Passed, renderer and .NET assembly |
| Desktop Node suite | 89 files passed, 671 tests passed, 2 skipped |
| Kirie Node suite | 10 files and 32 tests passed |
| Provider inference Node suite | 18 files and 186 tests passed |
| Plugin SDK suite after branding | 13 files and 113 tests passed |
| Computer-use configuration, debug targets, policy, and executor | 4 files and 32 tests passed |
| Core-agent, Discord, and locale scripts after branding | 29 files passed, 259 tests passed, 1 skipped |
| i18n glossary build and tests | Passed, 20 tests |
| Static updater fixture filenames, sizes, and SHA-512 | Passed |
| Final frozen installation with scripts disabled | Passed |
| Final root `pnpm lint` | Passed, zero errors and 603 existing warnings |
| Root `pnpm typecheck --concurrency=1 --continue` at 2560 MiB | Passed, 53 of 53 tasks |

Kirie required its documented `kirie doctor --fix plugin:core` setup before the native build.
The CEF archive exceeds the free tmpfs space in `/tmp`. Setup completed with `TMPDIR` on the checkout's disk cache.
No addon or backend dependency was added to Git or changed in version.

## Checks outside the root filter

`turbo run typecheck` with `./integrations/**`, `./plugins/**`, and `./engines/**` completed with 38 successful tasks and six failures.
The root typecheck above remains fully successful.

| Workspace | Remaining result |
| --- | --- |
| `@angela/satori-bot` | Existing optional event/channel and response-field type errors |
| `@angela/telegram-bot` | Existing optional fields, control-flow returns, and unassigned-variable errors |
| `@angela/twitter-services` | Existing unused function/parameter diagnostics |
| `@angela/minecraft-bot` | Existing array inference and incompatible `vec3` versions in the locked graph |
| `@angela/plugin-game-chess` | Existing script refers to absent `tsconfig.json` |
| `@angela/plugin-claude-code` | Exceeds the 2560 MiB typecheck heap limit |

Source comparison against `5227709` found 101 TypeScript diagnostics across 22 files.
Twenty-one files are byte-identical to baseline. The remaining Telegram file differs only by `AIRI` to `Angela` product text.
The game-chess `tsconfig.json` is also absent in baseline. The external dependency graph is unchanged.
These checks expose existing integration debt and a memory limit. This migration does not change that business logic or dependency graph.

The targeted API schema and WebSocket contract checks passed: two files, six tests.
The README release-link CLI uses the root repository metadata for download destinations.
An isolated real-CLI check passed for old AIRI links, new Angela links, and OSS mirror inputs on Windows and macOS.
Historical issue URLs remained unchanged. ESLint passed for this final release-helper change.

## Agent configuration

A separate commit updates 27 agent configuration files across 14 existing skills.
Package filters and local app paths match the migrated workspace.
Skill invocation IDs keep their existing names, including `use-agent-browser-for-airi` and `use-vishot-for-airi`.
Descriptions and UI labels use Angela.
The IO-trace guide retains the actual `AIRI` and `@proj-airi/stage-tamagotchi` profile paths.

All 14 changed skills passed the bundled skill validator with the workspace's existing YAML parser.
Changed `agents/openai.yaml` files parsed successfully and retained their invocation names and metadata length limits.
`git diff --check` passed. No skill activation policy changed.
