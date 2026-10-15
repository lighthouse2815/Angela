# Stage Tamagotchi

The Electron desktop app runs AIRI characters, chat, voice, and desktop tools.
Shared character behavior belongs in `packages/stage-ui`. Use `stage-web` for browser-only features.

## Development

From the repository root, run `pnpm install`, then `pnpm dev:tamagotchi`.
Run `pnpm -F @proj-airi/stage-tamagotchi build` to build the app.

## Local model files

Sherpaw downloads remote model files into the app user data directory. The main
process serves installed files to the renderer through `airi-model`. The desktop
release bundles X-ASR through `airi-sherpaw`. Sherpaw settings control
remote downloads. The Resource Status Island shows transfer progress and errors.

## Computer use

The desktop chat composer starts with **Use computer** on. Turn it off to send a request without desktop access.
The selection is local to the composer. A new composer starts with it on. While a request runs, its selection is locked.
Turn it off before sending messages that must not receive computer-use tools.

Only the current selection grants access, including retries and tool reruns. Historical messages do not grant access.
The selected request receives `computer_use`, `computer_use_read_image`, and the learning directory tools described below.
The first tool accepts AUV arguments, such as `["invoke", "window.list"]`.
Use `["invoke", "--help"]` and command-specific help to discover supported operations.
The image tool returns a screenshot as model image content. It accepts only PNG and JPEG artifacts inside the app's computer-use store.
Use a model and provider that support tool calls for visual tasks.
With **Use the vision model for tool images** on, the vision model reads the screenshot first for a chat model whose provider does not report image input.
The chat model then gets a text description. It has the visible text and layout, but no pixel positions.
Use AUV commands such as `screen.findText` to get coordinates.

Electron starts the matching AUV SDK and CLI on demand, over a private Unix socket or Windows named pipe.
It serializes commands across windows, stores artifacts under the app's user-data directory, and stops the daemon during app shutdown.
The CLI runs without a shell. Model arguments cannot change the device, endpoint, run, or storage root.
Nonzero exits retain AUV output and failure details as tool errors. A zero exit code does not prove that the intended UI change occurred.

On macOS, grant Accessibility and Screen Recording permissions to the launching app when the OS requests them.
Some application actions also need Automation permission. If `app.probePermissions` reports missing screen-recording permission, a capture can contain only the desktop background despite exit code zero. Available commands depend on the OS and AUV backend.
Use this feature for local native applications. It does not expose a remote-device gateway or replace the separate `services/computer-use-mcp` service.

### Native development build

If the bundled Linux CLI reports a missing shared library, build against the system libraries:

```sh
pnpm -F @proj-airi/stage-tamagotchi setup:computer-use
pnpm dev:tamagotchi
```

Run these commands from the repository root. Install Rust and the [native build dependencies](https://github.com/moeru-ai/auv/tree/v0.0.28#install-with-cargo) first.
The setup script builds the installed CLI version from its matching Git tag with the upstream lockfile.
It uses debug mode and one compiler process to limit memory use.
With LLVM 22 or later, follow the [isolated libclang setup](../../docs/angela-setup.md#tương-tác-laptop) for the upstream Bindgen incompatibility.

Executable selection follows this order:

1. `AUV_BINARY_PATH`, when set to an absolute path.
2. `.cache/auv/<installed-cli-version>/bin/auv` for development, when the file exists. Windows uses `auv.exe`.
3. The bundled CLI. Packaged applications use its executable outside ASAR.

The cache stays outside Git. A CLI upgrade selects a new cache directory and requires another native build.

The desktop package includes the platform CLI as an optional dependency and unpacks its executable from ASAR.
Do not omit optional dependencies when building an installer. Windows ARM64 and Linux musl do not have a matching CLI in this version.

## Learning directory

With **Use computer** on, ask Angela to read a learning document and save a Markdown summary.
`study_workspace_directory` opens the native folder picker. Only that picker grants directory access.
Its `status` action inspects the selection. Its `clear` action revokes access and invalidates a pending picker.
The selection is shared across desktop windows and expires when the app exits.

`study_workspace_list` lists subdirectories and supported documents. Listings contain at most 200 entries and scan at most 1,000 entries.
`study_workspace_read` reads UTF-8 `.md`, `.markdown`, and `.txt` files up to 256 KiB.
Both tools accept relative paths within the selected directory. Hidden paths and symbolic links are refused.
Document text goes to the selected chat provider as reference material. It is not a source of tool instructions or personal memories.
PDF, Word, and image documents are unsupported.

`study_workspace_save_note` creates new Markdown files under `Angela Notes` within that directory.
Notes contain at most 128 KiB. Existing files are never overwritten.
Successful results include the saved relative path and UTF-8 byte count.
Folder changes wait for active file operations. Clearing access preserves saved notes.
These tools use Electron IPC and Node filesystem APIs. They do not require AUV or desktop input permissions.

## Learning review reminders

Enable desktop review reminders in Long-Term Memory settings. The option defaults to off.
The main renderer checks the selected character every minute while the app runs.
Electron main accepts delivery requests only from that renderer and groups due records into one native notification.
The notification contains a count, without learning content. Clicking opens Chat.
Main groups duplicate requests and retains successful receipts across renderer leadership changes.
The learning store persists successful receipts for each due date. Reloads do not repeat a recorded reminder.
Failed and unconfirmed deliveries remain retryable. Notifications do not complete reviews or run after the app exits.

## Verification

Run the review store, settings, native delivery, and renderer timer tests from the repository root:

```sh
pnpm exec vitest run --config packages/stage-ui/vitest.config.ts --project browser learning-memory
pnpm exec vitest run --config apps/stage-tamagotchi/vitest.node.config.ts learning-reviews
pnpm exec vitest run --config apps/stage-tamagotchi/vitest.config.ts --project browser use-learning-review-reminders
```

Run the focused runtime tests:

```sh
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/main/services/airi/computer-use/runtime.test.ts
```

For learning directory access, IPC, and request selection, run from the repository root:

```sh
pnpm exec vitest run --config apps/stage-tamagotchi/vitest.node.config.ts apps/stage-tamagotchi/src/main/services/airi/study-workspace apps/stage-tamagotchi/src/renderer/stores/tools/built-in.test.ts
```

Set `AIRI_COMPUTER_USE_LIVE=1` to include the CLI/private-daemon test. Set `AUV_BINARY_PATH` to test a native development build.
It invokes help and an invalid argument, without injecting desktop input.
For renderer verification, launch with `APP_REMOTE_DEBUG=true` and an unused `APP_REMOTE_DEBUG_PORT`, then attach `agent-browser` to the chat CDP target.
