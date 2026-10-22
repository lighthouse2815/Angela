# Upstream cleanup

Baseline: `a7286bf` on `main`, 2026-10-22.

## Completed migrations

| Previous local name | Current local name |
| --- | --- |
| `apps/desktop/src/main/services/airi` | `apps/desktop/src/main/services/angela` |
| `packages/plugin-sdk-tamagotchi` | `packages/plugin-sdk-desktop` |
| `packages/scenarios-stage-tamagotchi-browser` | `packages/scenarios-desktop-browser` |
| `packages/scenarios-stage-tamagotchi-electron` | `packages/scenarios-desktop-electron` |
| `00-stage-tamagotchi.avif` | `00-desktop.avif` |
| `05-airi-card.avif` | `05-character-card.avif` |

The three private package names, workspace imports, lockfile importers, tests, scenario producers, and asset imports change together.
The public exports inside those packages retain their shape.
New `dev:desktop`, `build:desktop`, `test-desktop:run`, and `capture:desktop` commands use the current names.
Existing command aliases remain available.
Package builds during installation run one task at a time.
Two ESLint ignore entries for an absent Electron application were removed.

Four Kirie historical links now match their versions before commit `8900365`.
Their repository, pinned commit, original `apps/stage-tamagotchi-kirie` path, and line anchors remain intact.
Local Kirie links to the Electron services use the new directory.

The main README links to the root license and [third-party notices](../../../THIRD_PARTY_NOTICES.md).
The notices identify substantial derivative code and asset provenance.
All 12 existing tracked license and notice files remain byte-identical to the baseline.

## Required retention

| References | Reason |
| --- | --- |
| Upstream authors, email addresses, SPDX headers, and package licenses | Preserve authorship and license notices. |
| Historical GitHub links and dated investigation records | Preserve the original repository, commit, path, evidence, and attribution. |
| Model, font, sticker, and animation credits | Preserve asset identity and provenance. |
| `AIRI`, `@proj-airi/stage-tamagotchi`, and `.airi` data directories | Preserve existing profiles and stored data. |
| Certificate issuer names and CA filenames | Preserve trust for existing local certificates. |
| `AIRI_*`, `VITE_AIRI_*`, Eventa/IPC names, channel identities, telemetry fields, and debug globals | Preserve supported integration contracts. |
| Card schemas, storage keys, routes, sticker IDs, and their fixtures | Preserve existing data and compatibility coverage. |
| `extension.airi.json`, extension IDs, VS Code publisher IDs, commands, and settings | Preserve existing extensions and settings. |
| Existing skill invocation names | Preserve explicit skill calls. |

## External dependencies and sources

No workspace manifest declares an internal `@proj-airi/*` package.
These eight npm packages have published versions and integrity records in the existing lockfile:

- `@proj-airi/chromatic`
- `@proj-airi/drizzle-duckdb-wasm`
- `@proj-airi/duckdb-wasm` (transitive)
- `@proj-airi/iconify-meteocons`
- `@proj-airi/lobe-icons`
- `@proj-airi/unocss-preset-chromatic`
- `@proj-airi/unplugin-fetch`
- `@proj-airi/unplugin-live2d-sdk`

All external resolutions, snapshots, integrity data, catalog entries, and dependency settings match the baseline.
The lockfile importer graph changes only for the three private package renames.

The upstream documentation build script remains active in the web Dockerfile and Netlify configuration.
Its repository URL, checkout name, and environment variables retain their external meaning.
The Scoop manifest installs published upstream binaries and retains their actual executable names and release URLs.
Hosted-provider endpoints, model URLs, Player2 identifiers, and external service names retain their actual identities.

## Names that require a separate contract migration

- Native Godot project, assembly, C# namespace, and export names still contain `tamagotchi`.
  They connect to resource loading, sidecar packaging, and user directories. Cross-platform native export migration is outside this verified change.
- Some plugin, adapter, card, and E2E filenames retain old names beside supported public IDs and exported APIs.
  Their consumers require a separate contract review before a rename.
- Deferred mobile and authentication examples refer to private packages outside this Git repository.
  They are not npm dependencies. This task does not invent replacement package names or restore those workspaces.
- Local variable names and test fixture labels can still describe those old contracts.
  They do not establish upstream ownership of Angela's new work or independent authorship of derivative sources.

## Reproduce the scan

The scan covers tracked text, including hidden files and the lockfile.
It excludes `.git` history, installed dependencies, generated build output, and unrelated sibling repositories.
The combined expression counts each matching line once, even when several requested strings overlap.

```sh
git grep -n -I -E 'AIRI|airi|stage-tamagotchi'
git ls-files '*AIRI*' '*airi*' '*tamagotchi*'
```

The baseline contains 3,852 matching lines and 4,234 non-overlapping occurrences.
Filename-only matches require the second command. Binary assets retain their attribution beside the source files.

## Verification

Checks use one workspace task or test worker at a time.
Node processes use a 2560 MiB heap limit. Rust build tools use `RAYON_NUM_THREADS=1`.
The local pnpm launcher lacks a shebang. A temporary shell shim invokes the same installed pnpm version for subprocesses.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --network-concurrency=1 --child-concurrency=1` | Passed, including all 38 postinstall build tasks. |
| `pnpm exec vitest run --config apps/desktop/vitest.node.config.ts --maxWorkers=1` | Passed: 89 files, 671 tests, two existing skips. |
| `pnpm -F @angela/plugin-sdk-desktop exec vitest run --config vitest.config.ts --maxWorkers=1 --no-file-parallelism` | Passed: one file, 16 tests. |
| `pnpm -F @angela/scenarios-desktop-electron exec vitest run --maxWorkers=1 --no-file-parallelism` | Passed: three files, 11 tests. |
| `pnpm -F @angela/desktop-kirie test:unit --maxWorkers=1 --no-file-parallelism` | Passed: 12 files, 38 tests. |
| `pnpm typecheck --concurrency=1 --continue` | Passed: 53 of 53 tasks. |
| `pnpm lint` | Passed: zero errors, 603 existing warnings. |
| `pnpm --filter @angela/cli... --workspace-concurrency=1 run build` | Passed. |
| `pnpm --filter @angela/web... --workspace-concurrency=1 run build` | Passed. |
| `pnpm -F @angela/desktop build` | Passed: main, preload, and renderer. |
| `pnpm -F @angela/desktop-kirie build` | Passed: renderer and .NET assembly. |
| Scenario checks after the asset renames | Passed: 10 browser tests, 11 Electron tests, both typechecks, browser scenario build, and targeted lint. |

These builds do not establish Windows/macOS installer acceptance or interactive native behavior.
All historical and external URLs remained unchanged across the 253 text files initially modified or moved in the path migration.

## Final inventory

The [line inventory](./upstream-reference-inventory.csv) classifies every matching source line with its location, occurrence count, category, and reason.
The snapshot excludes that generated CSV from its own input. Its copied paths are audit metadata, not additional application dependencies.
All other tracked text remains in scope, including this report and earlier audits.

| Category | Matching source lines | Retention or remaining work |
| --- | ---: | --- |
| Required retention | 2,946 | Authorship, licenses, historical evidence, existing data, and supported integration contracts. |
| External dependency | 195 | Published packages, hosted providers, external documentation, and upstream installer identities. |
| Unresolved naming | 584 | Native project names, adapter/API names, implementation identifiers, fixtures, and tooling names that require separate review. |
| Total | 3,725 | 4,109 non-overlapping occurrences. |

The unresolved category does not claim that every old implementation name is legally required.
Those names remain unchanged because this cleanup does not establish a safe migration for all consumers or native exports.
The detailed rows make that limit visible instead of classifying uncertain names as mandatory notices.

To exclude the generated snapshot from the source count, run:

```sh
git grep -n -I -E 'AIRI|airi|stage-tamagotchi' -- . ':!docs/ai/audits/upstream-reference-inventory.csv'
```

The final display-label checks passed: 11 CLI MCP tests, CLI typecheck and build, 20 glossary tests, and the Kirie build.
The updater helper passed `bash -n`. Targeted lint passed. Scene files use the native build because ESLint has no scene parser.
The final source state also passed the web build, Electron desktop build, and built CLI `--help` command.
Four updated skills passed the bundled skill validator using the existing workspace YAML parser.
Their documented scenario path and built Electron entrypoint exist. Existing invocation IDs remain stable.

The standalone backend shortcut and the mobile package example were removed from active documentation.
Deferred mobile guidance now requires workspace restoration before its commands can run.

The full tracked-text scan, including the CSV, contains 4,208 matching lines and 4,630 occurrences.
The generated snapshot contributes 483 matching metadata lines. These copied paths belong to the historical audit record.

The filename scan finds 321 tracked paths:

| Path family | Paths | Reason |
| --- | ---: | --- |
| Native engine tree | 173 | Project, resource, assembly, and export migration remains separate. |
| Plugin and VS Code extension trees | 67 | Install layouts remain beside supported public extension identities. |
| Card modules, pages, stores, and stickers | 43 | Supported routes, exports, data, and asset identities remain stable. |
| Runtime certificates | 10 | Preserve existing certificate paths and trust. |
| Exported adapters and bridge modules | 9 | Preserve public APIs until consumer migration is reviewed. |
| Skill resources | 8 | Preserve stable invocation names and their references. |
| E2E entrypoints | 4 | Preserve existing caller and report conventions pending a tooling migration. |
| Desktop extension manifests | 3 | Preserve the supported manifest filename. |
| Animation source assets | 2 | Preserve source attribution and asset imports. |
| External installer and documentation helper | 2 | Preserve the identities of actual upstream artifacts. |
