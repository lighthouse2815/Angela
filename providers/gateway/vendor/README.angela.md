# Angela Gateway source

This directory contains the in-repository provider engine for Angela Gateway.

## Provenance

- Upstream: https://github.com/decolua/9router
- Revision: `87a74e1bda3677193c6f71a7e2100c90311f0689`
- Upstream version: `0.5.104`
- Imported: 2026-10-23
- License: [MIT](./NOTICE), copyright 2024-2026 decolua and contributors.

The import contains `src/`, `open-sse/`, `public/`, tests, and the server build configuration.
Runtime translations remain in `src/i18n/` and `public/i18n/`. The translated upstream README files are excluded.
It excludes the upstream launcher, tray, global installers, deployment files, documentation site, and unrelated repository assets.
The provider registry, OAuth handlers, credential refresh, routing, translators, and media adapters remain together.

Angela Gateway is a derivative, not independently authored replacement code.
Retain this record and the complete MIT license with source and binary distributions.
Historical URLs, OAuth identifiers, protocol names, and external extension names identify their original systems.
Do not rename those identifiers without checking the corresponding protocol.

## Local changes

- Product labels, page metadata, icons, and application identity use Angela Gateway.
- The CLI owns a private data directory and binds the server to loopback.
- Google Analytics and build-time Google font downloads are removed.
- Registry update checks and global self-update/shutdown routes are disabled.
- Foreground startup starts token refresh without DNS, tunnel, MITM, or global process cleanup.
- Engine dependencies use a separate locked pnpm workspace with the same 72-hour release-age policy.
- Its hoisted install creates a standalone server that package archives can include without symbolic links.
- Next.js and Tailwind versions are pinned for this build.
- The Codex refresh test now matches the existing ten-minute registry policy instead of its obsolete five-day expectation.

The source includes upstream translations and their source-text dictionaries.
The product rename updates matching brand labels without translating unrelated text.

The web workspace uses violet accents, warm neutral surfaces, and horizontal navigation.
The overview shows configured accounts and today’s request and token totals from the existing APIs.
The navigation drawer retains access to all management pages. Light, dark, and mobile layouts use the same identity.
The landing and login pages share the Angela orbit illustration and app icon.
Stored protocol identifiers remain unchanged so existing integrations continue to work.

## API address

The default address is `http://127.0.0.1:1107/angela1/`.
The dashboard and Angela CLI use `/angela1` for inference requests.
`/angela1/v1` supports clients that append the OpenAI version path automatically.
`/v1` remains a supported API alias. All inference paths enforce the same API-key policy.
Upstream provider URLs and the internal `/api/v1` handlers keep their protocol paths.
CLI tool presets use the current dashboard origin and `/angela1`, including custom ports and tunnels.
Settings writers preserve explicit `/angela1` and `/v1` paths. Custom OpenAI origins still receive `/v1`.
Existing tool configurations with port 20128 remain recognized. New presets use port 1107 by default.

## Build and tests

Run `pnpm build:cli` from the repository root.
The build owner is [providers/gateway](..).
Do not start the server through an upstream launcher.

The Angela CLI integration tests run the actual standalone engine against a local HTTP provider fixture.
They do not authenticate real AI accounts or call paid models.
Upstream unit tests remain in `tests/unit/` and use `tests/vitest.config.js`.
Kimchi and Cline authentication tests use the same Vitest runner.
Registry checks retain Windsurf's hidden state and its current Codeium endpoint.
CommandCode image checks require both `mimeType` and `mediaType`.

OAuth application identifiers in the imported source are upstream protocol configuration, not user account credentials.
Never add personal access tokens, refresh tokens, account databases, or private build state to this directory.
