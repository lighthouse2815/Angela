# Stage Tamagotchi

The Electron desktop app runs AIRI characters, chat, voice, and desktop tools.
Shared character behavior belongs in `packages/stage-ui`. Use `stage-web` for browser-only features.

## Shared local configuration

Desktop shares direct provider settings and the chat model with CLI and locally served web through `~/.config/angela/config.json`.
Set `ANGELA_CONFIG` before starting the application to select another file.
The main process owns file access through Eventa IPC. Only the Pinia leader persists completed settings actions.
Existing direct providers import once per profile. External edits refresh every 1.5 seconds.
Account sessions and interface preferences remain with their current stores.
See [local configuration](../../packages/local-config/README.md) for the file contract.

## Development

From the repository root, run `pnpm install`, then `pnpm dev:tamagotchi`.
Run `pnpm -F @angela/desktop build` to build the app.

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
The selected request receives `computer_use`, `computer_use_press_key`, `computer_use_paste_text`, `computer_use_windows`, `computer_use_read_image`, and the learning directory tools described below.
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

### Literal text and Vietnamese

Use `computer_use_paste_text` for literal text, including Vietnamese, after focusing the intended input.
On Niri with `AUV_LINUX_INPUT_BACKEND=uinput`, wl-clipboard supplies the system selection and AUV sends Ctrl+V.
Install `wl-copy` and `wl-paste` from [wl-clipboard](https://github.com/bugaevc/wl-clipboard). Text travels through stdin, outside process arguments.
Other Linux uinput desktops retain the Electron clipboard adapter.
This path does not need the RemoteDesktop clipboard portal. Other backends use native AUV paste.
Desktop operations share one queue, so another tool call cannot interrupt the paste sequence.
Host clipboard adapters accept only plain text formats. It refuses images, HTML, and custom formats before input.
It restores the previous text unless the clipboard changes during delivery. A new user copy takes precedence.
The tool reports delivery without claiming that the application received the text. Inspect the resulting UI.

### Native window selection on Niri

On Linux Niri, `computer_use_windows` lists native compositor windows and focuses an exact returned ID.
Use a title substring to limit the results to the intended application. Results contain at most 200 matches.
The host enables this backend only when the Niri socket is present. Other desktops use their existing AUV commands.
Niri IDs differ from AUV accessibility IDs. Never pass a Niri ID as an AUV `--target`.
After focus, pass `windowId` to `computer_use_press_key`, `computer_use` input commands, and `computer_use_paste_text`.
The key tool accepts a key or shortcut such as `ctrl+1`, `ctrl+a`, or `ctrl+s`, without CLI arguments.
The host checks compositor focus immediately before native input, after daemon startup. A changed focus rejects input.
Guarded paste also checks focus before touching the clipboard. Calls share the same desktop queue.
Focus confirms the selected window, without verifying its document contents. Inspect the resulting application state.
Existing calls without `windowId` retain their current foreground behavior.

### Native development build

If the bundled Linux CLI reports a missing shared library, build against the system libraries:

```sh
pnpm -F @angela/desktop setup:computer-use
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
It also extracts text from `.pdf` files up to 10 MiB and 1,000 pages through [unpdf](https://github.com/unjs/unpdf).
PDF results contain the relative path, total page count, numbered page text, and a `truncated` flag.
PDF page numbers start at 1 and refer to physical pages, independent of printed labels.
Optional `startPage` and `endPage` select an inclusive range of at most 20 pages.
The default range contains 10 pages from `startPage`, or page 1 when absent, capped at the document end.
Each PDF read returns at most 256 KiB of extracted text. Request fewer pages if this limit prevents a read.
Read further ranges before a complete document summary. Partial ranges set `truncated` to true.
Both tools accept relative paths within the selected directory. Hidden paths and symbolic links are refused.
Document text goes to the selected chat provider as reference material. It is not a source of tool instructions or personal memories.
Scanned pages require OCR, which is unsupported. Pages without extractable text produce an explicit error when the whole requested range is empty.
Password-protected documents, legacy `.doc` files, and image documents are unsupported.

DOCX extraction uses [Mammoth](https://github.com/mwilliamson/mammoth.js) with a pinned document-transform API and disabled external file access.
DOCX files support up to 10 MiB compressed, 20 MiB expanded, and 1,000 ZIP entries.
The result has `format: "docx"`, numbered `paragraphs`, and extraction `warnings`.
Paragraphs contain body text, including standard headings and table-cell paragraphs. Empty paragraphs are excluded from the numbering.
Each paragraph includes the nearest standard Heading 1–9 or Title text when available. Numbered Heading styles also include their level.
Paragraph data fits within 256 KiB and 10,000 paragraphs. Oversized output produces an error rather than a partial read.
Headers, footers, footnotes, endnotes, comments, and image text are outside the extracted body.
DOCX paragraph numbers refer to the extraction order. They are not Word page numbers or numbered-list labels.

`study_workspace_search` finds a literal phrase in a document or recursively within a directory. Use `path: "."` for the selected directory.
Matches ignore letter case, preserve accents, and accept whitespace across line breaks. Regular expression characters remain literal.
Each text file, PDF page, or DOCX paragraph contributes at most one excerpt, with its relative path and position.
DOCX results include a paragraph number and the nearest heading when available. Phrases do not span separate DOCX paragraphs.
Excerpts contain at most 600 characters. Search reads current local files and sends paths, excerpts, and scan status to the chat provider.
One call inspects at most 200 queued paths, 50 directories, 50 documents, 100 PDF pages, and 500 DOCX paragraphs.
Search text has a 2 MiB budget. Each directory retains the existing listing limits.
Limits and unreadable files set `truncated`. Inspect `skipped` before a claim that content is absent.
The `pending` array contains scopes to search next with the same query.
Its `startPage` resumes a single PDF. Its `startParagraph` resumes a single DOCX.
The `pending` and `skipped` arrays contain at most 20 entries each, so these lists can also be incomplete.
Search excerpts do not grant note citations. Read the matched document or page before a full explanation or a saved source citation.

`study_workspace_save_note` creates new Markdown files under `Angela Notes` within that directory.
Notes contain at most 128 KiB. Existing files are never overwritten.
The optional `sources` array accepts up to 20 references with a relative `path` and a PDF `page` or DOCX `paragraph`.
Omit both position fields for text files. Only documents and positions read during the current folder selection can become source citations.
The tool appends relative Markdown links with PDF page anchors.
DOCX citation labels contain paragraph numbers and recorded headings. Their links open the source file without a paragraph jump.
Citations count toward the note size limit.
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
pnpm exec vitest run --config apps/desktop/vitest.node.config.ts learning-reviews
pnpm exec vitest run --config apps/desktop/vitest.config.ts --project browser use-learning-review-reminders
```

Run the focused runtime tests:

```sh
pnpm -F @angela/desktop exec vitest run src/main/services/airi/computer-use/runtime.test.ts
```

For learning directory access, IPC, and request selection, run from the repository root:

```sh
pnpm exec vitest run --config apps/desktop/vitest.node.config.ts apps/desktop/src/main/services/airi/study-workspace apps/desktop/src/renderer/stores/tools/built-in.test.ts
```

Set `AIRI_COMPUTER_USE_LIVE=1` to include the CLI/private-daemon test. Set `AUV_BINARY_PATH` to test a native development build.
It invokes help and an invalid argument, without injecting desktop input.
For renderer verification, launch with `APP_REMOTE_DEBUG=true` and an unused `APP_REMOTE_DEBUG_PORT`, then attach `agent-browser` to the chat CDP target.

### Live Linux input verification

Run the smoke on an unlocked Wayland session with one output and temporary uinput access:

```sh
AUV_BINARY_PATH="$PWD/.cache/auv/0.0.28/bin/auv" AUV_LINUX_INPUT_BACKEND=uinput pnpm -F @angela/desktop smoke:computer-use-input
```

If the shell sets `ELECTRON_RUN_AS_NODE`, unset it before launch. The script never grants device permissions.
It opens a separate fullscreen fixture with an isolated temporary profile. It needs no API key or application build.
Native AUV input must click a button, focus the control, type ASCII, and paste an exact Vietnamese sentence.
The fixture counts trusted events and reads the resulting value. DOM code never supplies clicks or input text.
The smoke preserves text and HTML clipboard content around its plain text test. It refuses other initial formats.
A new user copy during delivery takes precedence. Avoid changing focus while this input test runs.
The report and fixture-only screenshot go into `.cache`. Set `SMOKE_REPORT_DIR` to choose the output directory.
The test stops its private daemon and removes its temporary profile. Revoke temporary uinput access after the run.
This proves native execution against the fixture. It does not prove model planning or arbitrary application control.

### Model-driven VS Code verification

Configure a chat model with tool calling in the local development profile. Build desktop before this smoke.
Run on Linux Niri with temporary uinput access:

```sh
AUV_BINARY_PATH="$PWD/.cache/auv/0.0.28/bin/auv" AUV_LINUX_INPUT_BACKEND=uinput pnpm exec tsx apps/desktop/scripts/computer-use-model-smoke.ts
```

The smoke copies only Local Storage into a private temporary profile. It requires a local-only account state.
Set `SMOKE_SOURCE_PROFILE` to choose a different source profile. Set `SMOKE_CODE_BINARY` for a different native VS Code binary.
The default editor binary is `/usr/share/code/code`. The smoke launches separate editor data and extension directories.
Two temporary documents appear in separate windows. The model must select the target, paste Vietnamese, and save it.
The harness permits native input only to its two editor windows. It forwards allowed calls to the registered production executors.
The test reads the saved target, checks that the other file stayed intact, and verifies every input target ID.
This proves a keyboard workflow with native window selection. It does not prove visual grounding or arbitrary application support.
The test requires an empty or plain text clipboard. Rich formats remain untouched.
It checks the real Wayland selection, stops its process groups, and removes temporary profiles and provider logs.
Set `SMOKE_DIAGNOSTICS=1` to record fixture tool calls and editor state for failure diagnosis.
The report contains verification flags and tool names, without credentials or document contents. Revoke uinput access after the run.

The 2026-10-16 Niri run passed with Gemini 3.1 Flash Lite and real VS Code.
The saved document matched the requested Vietnamese text. The other file stayed intact and the native clipboard returned to its initial state.
