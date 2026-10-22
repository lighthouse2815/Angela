# Include Angela Gateway in the CLI

Status: Accepted

## Context

The user requested every provider and account flow from the selected upstream engine, behind one API key.
They require an in-repository implementation, an Angela identity, and a CLI-first delivery.
A separately installed gateway application does not meet that requirement.

## Decision

Vendor the complete provider engine under `third_party/angela-gateway` with its MIT license and pinned provenance.
Use the product name Angela Gateway. Preserve external protocol identifiers and copyright records.
Keep the imported engine in an isolated dependency workspace.
Build it into `@angela/gateway`, which Angela CLI includes as a workspace dependency.

```text
Angela CLI gateway commands
  -> @angela/gateway standalone server, loopback only
    -> provider registry and account credentials
    -> token refresh and routing
    -> upstream provider APIs

Angela chat -> shared local configuration -> gateway /v1 -> the same accounts
```

The CLI starts the server, lists accounts and models, adds key-based accounts, and selects a shared provider.
OAuth and special account imports use the bundled local dashboard, not an external gateway application.
The existing local configuration package owns atomic provider updates.
The initial dashboard password and management token stay separate from the shared inference key.

Interactive `angela` starts with GPT, Gemini, Claude, Custom, Continue, and Exit choices.
The custom menu exposes account controls, model selection, key inspection, and the full bundled dashboard.
OAuth remains in the browser. The menu never collects provider passwords.
The menu owns a gateway child only when it starts that child. Chat shutdown releases that owned child.
An explicit model selection overrides provider environment values for that session and saves the shared local configuration.
Automation, explicit provider flags, and `--no-menu` retain their existing behavior.

The foreground owner stops only its child. It refuses occupied ports and never kills unrelated listeners.
Disable the upstream updater and telemetry. Keep the full provider graph rather than copying a login subset.

## Consequences

Portable Angela releases contain the built engine. Users do not download or install another gateway product.
Source builds require pnpm and download ordinary locked framework dependencies.
The imported dashboard retains its separate React/Next.js implementation. Angela's main Vue applications do not change frameworks.

The initial delivery does not add a desktop account screen, system service, or remotely exposed gateway.
Real OAuth, quotas, and model availability require provider accounts and manual verification.
Automated integration checks cover the real engine with a local synthetic provider.
