# Angela CLI

Chat with Angela from a Node.js terminal. The CLI uses AIRI's existing provider and generation runtime.

## Run

From the repository root, install workspace dependencies and build the required packages:

```sh
pnpm install
pnpm build:cli
```

## Shared local configuration

The CLI reads `~/.config/angela/config.json`, shared with desktop and locally served web.
Select a direct provider and chat model in either application's settings, then run `pnpm cli`.
No account login is required for direct providers. Account sessions stay outside the shared file.

`ANGELA_CONFIG` or `--config /path/to/config.json` selects another file.
`XDG_CONFIG_HOME` changes the default configuration directory.
Use `--provider INSTANCE_ID` to select another saved provider instance.
Flags override environment variables, which override the shared file. Overrides do not change the file.
See [the configuration package](../local-config/README.md) for its schema and storage rules.

## Environment overrides

Configure a provider without a shared file through environment variables:

```sh
export ANGELA_MODEL='your-model-id'
export ANGELA_API_KEY='your-provider-key'
export ANGELA_BASE_URL='https://your-provider.example/v1/'
pnpm cli
```

Use `ANGELA_API=responses` for a Responses endpoint. The default protocol is `chat-completions`.
Local endpoints can use an empty API key. Credentials have no command-line flag.

`pnpm cli` also reads `.env.cli.local` from the repository root when this file exists.
Store the same `ANGELA_*` variables there for later runs. Existing environment variables take priority over file values.
Git ignores this file. On POSIX systems, use `chmod 600 .env.cli.local` to restrict access.
The built executable reads the shared configuration and environment variables. To load this file with the executable, use Node's `--env-file` flag.

```sh
pnpm cli --prompt 'Giải thích async/await'
printf 'Giải thích async/await' | pnpm cli
pnpm cli --cwd ./packages/core-agent --locale en
pnpm cli --help
```

The package also builds an executable at `packages/airi-cli/dist/bin/run.mjs`.
With workspace dependencies installed and built, this executable works from another directory:

```sh
/absolute/path/to/airi/packages/airi-cli/dist/bin/run.mjs --cwd /path/to/workspace
```

The executable uses workspace packages. It is not a self-contained binary or a published npm package.

To install the `angela` command on Linux or macOS, run these commands from the repository root after the build:

```sh
mkdir -p "$HOME/.local/bin"
ln -s "$PWD/packages/airi-cli/dist/bin/run.mjs" "$HOME/.local/bin/angela"
```

Make sure that `$HOME/.local/bin` is on `PATH`. Keep this checkout and its built workspace packages available.
From any directory, run `angela`. It connects the built-in terminal tools automatically.
The current directory becomes the workspace. `--cwd` selects another directory.

The default interface language is Vietnamese.
Use `ANGELA_LOCALE=en` or `--locale en` for English.

During interactive chat, Ctrl+C cancels the current request. Use `/exit` or Ctrl+D to quit.
Use `/help` to list the chat commands and keyboard controls without contacting the model.
Type `/` at the start of the input to show command suggestions. Keep typing to filter them, then press Tab to complete.
One-shot requests return exit code 1 for errors and 130 for cancellation.

Interactive startup clears the terminal display and shows Angela's robot icon.
Angela's replies use cyan with an agent label. The input prompt uses green, and your text uses the terminal's default color.
The input area has a border. Blank lines separate requests, replies, and tool approval questions.
Terminal color settings, including `NO_COLOR`, control color support.
Piped and one-shot requests keep plain output without the startup banner or screen clearing.

Provider errors show one localized message with an HTTP status and a next step.
For example, HTTP 503 explains that the model is overloaded or unavailable. HTTP 401 asks you to check credentials.
Automatic retries show a short progress message. SDK stacks, response headers, and raw provider bodies stay out of terminal output.

During requests, the terminal shows thinking, tool discovery, and execution progress with elapsed time.
Tool results show their status and up to three lines of output, limited to 600 characters.
The model and saved conversation retain the full tool result.
Approval prompts show the complete action and working directory before execution.
Progress pauses during approval and stops before an answer, cancellation, or error.
Piped output keeps answers on stdout and plain progress messages on stderr.
An empty model answer reports an error instead of returning silently to the prompt.

## Scope

This entry point provides text chat, Linux voice, and a built-in terminal MCP connection.
The web and desktop applications provide avatars and visual settings.

## Local voice service commands

```sh
angela voice start
angela voice status
angela voice stop
```

These commands work from any directory and do not need a chat model or provider credentials.
`start` builds and starts the local Docker service, then waits for readiness.
It creates private local voice defaults only when `voice.env` does not exist. Existing configuration stays unchanged.
`status` shows the container state, configured endpoint health, and availability of PipeWire commands.
It does not record audio. The actual microphone is checked when capture starts.
`stop` stops the service and retains downloaded models and history.
Docker with Compose and a running daemon are required. Keep this source checkout available.
`ANGELA_VOICE_COMPOSE` selects another Compose file when the service has moved.

## Voice in the current session

Type `/voice` during interactive chat to start automatic listening.
Speak normally. About 1.2 seconds of silence ends your utterance and sends it automatically.
Angela reads the answer. With interruption enabled, you can speak during replies. Enter is not required.
The terminal shows when the microphone is on, when speech starts, and when transcription or playback starts.
Type `/chat` to discard the current capture and return to text chat.
Ctrl+C stops the current operation and returns to text mode. `/voice` starts listening again.
By default, `/voice` creates a private PipeWire WebRTC echo filter and enables voice interruption.
If the filter is unavailable, Angela reports this and uses separate listening and speaking turns.
With voice interruption enabled, a separate capture listens during replies without reading terminal input.
Spoken text goes only to the model. Only typed commands can change tool permissions.
The conversation and tool permissions stay in the same session.

Automatic listening requires the local voice service's `audio/listen` WebSocket endpoint.
The CLI streams 16 kHz mono PCM directly from PipeWire. Captures stay in memory and are discarded after each turn.
Silero detects speech using the ONNX model already bundled with Faster Whisper.
Idle audio uses a three-second rolling window. Utterances are limited to 30 seconds.
Service or microphone failures return to text mode instead of restarting in a loop.

For a free setup without an API key, use [the local voice service](../../services/voice-local/README.md).

Linux voice uses the existing PipeWire commands `pw-record` and `pw-play`.
Configure an OpenAI-compatible audio service in `.env.cli.local` or environment variables:

```dotenv
ANGELA_VOICE_BASE_URL=http://localhost:8000/v1/
ANGELA_STT_MODEL=whisper-1
ANGELA_TTS_MODEL=tts-1
ANGELA_TTS_VOICE=alloy
```

`~/.config/angela/voice.env` stores audio configuration for the installed CLI from any directory.
`ANGELA_VOICE_ENV` selects another file. Environment variables override file values.
`ANGELA_VOICE_API_KEY` supplies an optional audio credential, separate from the chat credential.
The audio service must support `audio/transcriptions` and `audio/speech` with WAV output.
Model and voice names must match your service. A chat-only router does not supply audio automatically.
Audio goes to the configured service. Temporary audio files are deleted after each operation.
Angela starts reading complete sentences while the model continues its reply.
Text waiting for audio is bounded. Slow playback applies backpressure to model event processing.
Only one audio request and playback run at a time. Ctrl+C cancels all remaining speech.
Completed replies are saved before the final audio drains. A cancelled generation keeps the existing interrupted-session behavior.
Audio failures stop speech for that reply while text generation and history continue. Failed playback keeps the answer visible in chat. Voice mode requires an interactive terminal.

## Terminal tools

Build the service before the first run. The CLI connects its terminal tools automatically:

```sh
pnpm -F @proj-airi/computer-use-mcp build
angela --cwd ./packages/core-agent
```

The model discovers tools through `builtIn_mcpListTools` and calls them through `builtIn_mcpCallTool`.
The built-in connection exposes terminal tools only. File reads and edits use terminal commands.
`--computer-use` remains accepted. An explicit `--mcp-command` selects another server instead of the built-in service.
The CLI supplies the selected workspace when a terminal call omits `cwd`.
The workspace is a working directory, not a filesystem sandbox.

By default, the CLI shows each tool call and asks for confirmation. Type `yes` to allow that exact call.
Server-side pending actions require a second confirmation in this mode.
Use `/permistion` to see the current mode, `/permistion full` for full access, and `/permistion ask` to restore confirmation.
`/permission` is an alias. `on` selects full access, and `off` restores confirmation.
Full access automatically approves tool calls and pending server actions. The CLI still displays each action and its result.
The mode lasts for the current process. New and resumed sessions start with confirmation required.
Permission commands run locally, without contacting the model. They do not connect an MCP server or override server policy denials.
The model cannot call approval endpoints directly. Without a terminal reader, tool calls are denied.
Cancellation stops the model request and MCP wait. Completed or running external actions can retain side effects.

To connect another trusted stdio MCP server, supply its executable and arguments separately:

```sh
pnpm cli --mcp-command pnpm --mcp-arg=-F --mcp-arg=@proj-airi/computer-use-mcp --mcp-arg=start
```

The server starts in `--cwd`. Its stderr goes to the terminal. CLI output never mixes with the server protocol.
The child process does not receive `ANGELA_API_KEY`. Other environment variables remain available to the server.
Built-in service audit files go under the CLI session directory, outside the workspace.
An explicit `COMPUTER_USE_SESSION_ROOT` overrides this location.

## Sessions

Each run saves a session in `~/.angela/sessions`. Use `ANGELA_DATA_DIR` or `--data-dir` to change this directory.
The CLI prints its session ID to stderr. Session files use private permissions and atomic replacement.

```sh
pnpm cli --list-sessions
pnpm cli --resume SESSION_ID
```

Resume requires the same provider configuration as a new chat. Credentials and provider configuration are not stored in session files.
The saved workspace remains active unless `--cwd` specifies the same directory.
A session lock prevents two CLI processes from writing the same session.
After a crash, remove its `.lock` file only after you confirm that the previous process stopped.

History preserves text and correlated tool calls and results through the core runtime's portable message projection.
Native provider continuation and reasoning metadata remain in memory for the current process.
Interrupted requests are marked. The CLI does not fabricate an assistant answer or undo external actions.

## Data maintenance

```sh
angela sessions list
angela sessions usage
angela sessions delete SESSION_ID
angela sessions cleanup-audio
```

These commands do not need a chat provider. `--data-dir` selects another CLI session directory.
Usage reports CLI history JSON bytes. Telegram history, model caches, and tool audit files are not included.
Deletion shows the selected history metadata and requires its full ID again in an interactive terminal.
An open or locked session cannot be deleted. No history is deleted automatically.

Chat startup removes recognized audio directories older than 24 hours, unless their owner process is still alive.
Unknown content is preserved. `cleanup-audio` runs the same cleanup explicitly.
Normal playback deletes its temporary WAV immediately. Automatic microphone capture stays in memory.

## Telegram

Run `angela telegram` to chat and use local terminal tools through Telegram, using grammY long polling.
This host reuses Angela's shared provider configuration and session storage. It needs no database, public port, or webhook.
The existing integration in `integrations/telegram-bot` remains a separate service with its own database and media features.

Create a bot through Telegram's `@BotFather` and get your numeric Telegram user ID.
Store the bot token and allowed user IDs in `~/.config/angela/telegram.env`:

```dotenv
ANGELA_TELEGRAM_BOT_TOKEN=<your-bot-token>
ANGELA_TELEGRAM_ALLOWED_USER_IDS=<your-numeric-user-id>
```

Use `chmod 600 ~/.config/angela/telegram.env` to restrict access. Keep this file outside Git.
Environment variables override file values. `ANGELA_TELEGRAM_ENV` selects another environment file.
`XDG_CONFIG_HOME` changes the configuration directory. Separate multiple allowed IDs with commas.
The bot refuses to start without a token and a nonempty list of numeric IDs.
Unauthorized users, groups, and channels receive no response and cannot access sessions or the model.

```sh
angela telegram
angela telegram --cwd /path/to/project --model your-model-id
angela telegram --help
```

Keep this process and your provider, such as local 9router, running while you use Telegram.
Only one polling process can use the bot token. An existing webhook prevents startup instead of being silently removed.

Telegram commands:

- `/start`: introduce Angela.
- `/help`: list Telegram commands and describe each command.
- `/status`: show the model, session ID, workspace, permissions, and request status.
- `/new`: clear the current chat's stored conversation, close its tools, and restore confirmation mode.
- `/cancel`: cancel the current request, including a pending tool confirmation.
- `/permistion`: show permissions. Use `/permistion full` for automatic approval or `/permistion ask` for confirmation.
- `/permission`: alias for `/permistion`.

Each private chat has a separate session, also isolated by bot ID.
Sessions live under `~/.angela/sessions/telegram` and survive restarts. Restart from the same workspace to resume them.
The bot runs one request per chat and stays responsive to cancellation while the model works.
Requests time out after five minutes. Ctrl+C cancels active requests and releases session locks.
Long replies are split into plain Telegram messages. Telegram does not interpret model output as formatting.

Each chat connects the same MCP terminal tools as the CLI. File reads and edits use terminal commands.
Tools run on the machine hosting the bot, in the selected workspace. The workspace is not a filesystem sandbox.
`--mcp-command` and repeated `--mcp-arg` flags select another trusted stdio server.
Each chat owns a separate MCP connection. Normal requests retain its terminal state until reset, cancellation, or shutdown.
The tool child process does not receive the provider key or Telegram bot token through their Angela environment variables.

Confirmation mode is the default. The bot sends the complete action and workspace before showing Allow and Deny buttons.
Each button authorizes one action in its original private chat. Cancelled, completed, and replaced buttons cannot authorize another action.
Server-side pending actions require a second confirmation. Full access automatically handles both confirmation stages.
Full access belongs to one chat and lasts until `/new`, an explicit permission change, or a process restart.
Only an authorized Telegram command can change permissions. Model output and saved conversations cannot change them.

The bot edits one progress message with thinking, tool status, and compact results.
Tool previews reuse the CLI's three-line, 600-character limit. The model and saved session retain the full result.
Actions that already ran can retain side effects after cancellation. Cancellation closes that chat's MCP connection.
It does not send existing CLI conversations to Telegram. A failed delivery leaves the generated answer in the saved session.
Validate routing and authorization with local API tests before you connect a real bot.

## Checks

```sh
pnpm -F @proj-airi/airi-cli typecheck
pnpm -F @proj-airi/airi-cli test
pnpm -F @proj-airi/airi-cli build
```

## Audio device selection

Set these optional values in `~/.config/angela/voice.env` to select devices for Angela:

```dotenv
ANGELA_VOICE_SOURCE=angela_echo_source
ANGELA_VOICE_SINK=angela_echo_sink
```

Values accept PipeWire node names or serial numbers. Without overrides, Angela creates a private echo-filtered source and sink.
The filter uses the current system microphone and speakers. Each voice session gets unique device names.
Use `wpctl status -n` to inspect device names. Restart voice mode after changing the configuration.
Device selection affects only Angela. It does not change system defaults.

For echo cancellation, PipeWire provides [module-echo-cancel](https://docs.pipewire.org/page_pulse_module_echo_cancel.html).
Angela creates and removes its own filter automatically. For a manually managed filter, use the PulseAudio compatibility service:

```sh
pactl load-module module-echo-cancel source_name=angela_echo_source sink_name=angela_echo_sink aec_method=webrtc
```

The command prints a module ID. Keep that ID to remove this module later:

```sh
pactl unload-module MODULE_ID
```

Route Angela through both names above so the filter receives microphone audio and the playback reference.
With both device values configured, voice interruption starts automatically.
Use an echo-filtered source and sink pair for speaker playback. Device selection alone does not cancel echo.
For headphones, set `ANGELA_VOICE_BARGE_IN=1` without a virtual source or sink.
Set `ANGELA_VOICE_BARGE_IN=0` to disable interruption regardless of device selection.

When speech starts, Angela cancels generation, queued speech, playback, and pending tool approval.
The interrupting capture stays alive through transcription. The next turn starts after the previous turn settles and saves.
Already completed tool actions remain in effect. Interrupted generations keep their existing session recovery behavior.
A completed text reply stays saved even when its playback is interrupted.
An empty transcript starts listening again. Ctrl+C discards the capture and returns to text mode.
Spoken text never acts as a CLI command or grants tool permission.
`/chat`, Ctrl+C, service failures, normal exit, and SIGTERM remove the filter that Angela created.
User-configured devices and manually loaded filters stay unchanged.
Explicit headphone mode (`ANGELA_VOICE_BARGE_IN=1`) skips automatic echo cancellation.
Disabling interruption (`ANGELA_VOICE_BARGE_IN=0`) also skips automatic echo cancellation.
If only one device override is set, Angela keeps separate listening and speaking turns.
A forced process kill or machine crash prevents cleanup. Restarting the audio service removes remaining modules.

## Personal memory

Personal memory stores facts and preferences across CLI sessions that use the same data directory.
It works for text and voice. Desktop learning memory and Telegram memory stay separate.
No extra model, embeddings, database, or service is required.

Use these interactive commands:

```text
/remember Tôi thích câu trả lời ngắn bằng tiếng Việt
/memory
/memory edit ID Tôi thích giải thích chi tiết bằng tiếng Việt
/forget ID
/memory auto off
/memory auto on
/memory off
/memory on
```

`/memory` shows the record count, full record IDs, texts, and enabled state. Replace `ID` with one listed ID.
Direct save and edit commands show the saved text and ID after the write succeeds. They do not call the AI provider.
Automatic memory is on by default. Clear statements such as “Tôi tên là Đăng” can be saved without a remember request.
The existing chat model selects durable first-person facts and writes them through its native tool. No separate extraction request is added.
Use `/memory auto off` for explicit-request-only edits while keeping saved facts available. `/memory auto on` restores automatic selection.
`/memory off` disables all saved context and model memory tools. Turning memory back on preserves your automatic-selection setting.
Temporary moods, task commands, quotes, hypothetical examples, and inferred traits are excluded by the model instructions.
Repeated behavior alone does not establish a lasting preference. Angela asks before turning an inference into a saved fact.
Clear self-corrections update matching records. Ambiguous conflicts require clarification, and equivalent facts reuse an existing record.
These semantic decisions depend on the selected model. Inspect `/memory` to check what it actually saved.
Model saves require a verbatim excerpt from your current message. Paraphrased or inferred facts are rejected.
The CLI shows a memory notification after each successful model tool write, including voice turns.
Saved and updated notifications show the text and record ID. Deleted notifications show the record ID.
Rejected edits show a failure notice and reason. These notices appear in terminal output, outside spoken replies.
A failed or cancelled reply does not undo completed memory writes. Notifications do not depend on the model confirming success.
Use `/memory` to inspect saved records.
Voice transcripts go to the model. Only typed slash commands directly edit memory.

Memory holds at most 50 records, with 500 characters per record. Exact duplicate saves reuse the existing record.
It is stored as private plaintext at `<data-dir>/memory/personal.json`. The default data directory is `~/.angela/sessions`.
Saved facts are sent to the currently selected chat provider. Do not save credentials or secrets.
Enabled memory is refreshed before each CLI request. Disabling it removes saved context and tools from later requests.
Earlier conversation messages, tool results, and saved session history remain unchanged after disabling or forgetting a fact.
A new session avoids previous conversation context. Resuming an old session can still expose its earlier messages.
Deleting a chat session does not delete personal memory.

Parallel tool edits in one CLI process are serialized. Each write locks the memory file and replaces it atomically. Other writers report a lock error instead of losing edits.
Unreadable data stays untouched. Chat continues without memory for that reply and shows a warning.
Memory edits remain blocked until the data is repaired.
After a process crash, an abandoned `memory/personal.lock` can block edits.
Before removing that lock manually, make sure no CLI process is writing memory.

Personal memory design follows bounded core context in [Letta memory blocks](https://docs.letta.com/v1-sdk/memory/memory-blocks),
selective extraction in [Mem0](https://docs.mem0.ai/core-concepts/memory-operations/add),
and separation of durable facts from transcripts in [OpenClaw](https://docs.openclaw.ai/concepts/memory-architecture).
Angela uses its existing local store and tool runtime. It does not add these frameworks as dependencies.
Record IDs and text enter model context. Storage timestamps stay on disk to reduce repeated prompt overhead.
Assistant identity and behavior stay in the base system prompt. User memories cannot change tool approval settings.

## Project memory

Project memory keeps one compact work checkpoint across CLI sessions: goal, status, decisions, reported completed work, blockers, and next step.
It is independent of personal memory, chat history, and the computer-use service's in-process task tracker.
Nested folders in one Git repository share a checkpoint. Without Git, the canonical working directory defines the project.
Separate clones and worktrees have separate checkpoints. Symlink aliases resolve to the same canonical directory.

```text
/project
/project off
/project on
/project clear
```

`/project` shows the selected project, saved checkpoint, revision, and source session.
`/project off` removes its context and tools from subsequent requests without deleting saved work.
`/project clear` clears this checkpoint only. Project files, chat history, and personal memory remain unchanged.
Spoken text goes to the model. Only typed commands directly disable or clear project memory.

The chat model uses `project_memory` after meaningful progress. No additional model or background extraction request is required.
Each save replaces the bounded checkpoint and checks its expected revision under the shared memory file lock.
Concurrent sessions receive the current checkpoint on conflict so they can merge newer work before retrying.
The tool requires a source quote from the current user message or host-observed MCP output in that turn.
Model answers and memory-tool results cannot serve as observed MCP evidence. Evidence establishes provenance, not proof of every summary claim.
The model must distinguish plans, user reports, failures, and completed tool actions. These semantic decisions depend on the selected model.
Older checkpoints are untrusted historical reports. Angela must check live files, Git state, and relevant tests before relying on prior completion claims.
Interrupted turns can already have saved a checkpoint. Verify actual tool effects before repeating work.

Private checkpoint files live under `<data-dir>/memory/projects/`, indexed by a hash of the canonical project path.
They contain up to eight decisions, ten completed items, five blockers, and bounded goal and next-step text.
Enabled checkpoints are sent to the selected model. Do not store secrets or raw transcripts.
Unreadable checkpoint files remain untouched. Chat continues without project context and shows a warning.
Personal and project memories reuse the same atomic file writer, private permissions, and per-process write queue.
After a crash, remove an abandoned project `.lock` only after checking that its writer has stopped.

## Long conversation context

The CLI keeps full conversation history on disk and prepares a smaller request view when older turns exceed its context budget.
`/context` shows the configured budget, estimated input tokens, output reserve, summarized turns, and compaction count.
Set `ANGELA_CONTEXT_TOKENS` before starting Angela to select a budget from 4096 to 2000000 (default: 32000).
Choose a budget that fits your selected model. This setting does not discover or change its context-window capacity.

Input estimates use UTF-8 byte length divided by three, including projected messages and custom tool schemas.
They are heuristic estimates, not provider token counts. Multimodal payloads and provider-specific overhead can differ.
The CLI reserves up to 4096 estimated tokens for output, or one quarter of smaller budgets.
The reserve is accounting headroom, not a provider output-token cap.

When needed, Angela calls the configured model without tools to summarize older complete turns.
Each summary retains requirements, decisions, paths, reported outcomes, failures, and unresolved work within 3000 characters.
The latest user turn, system and memory context, and subsequent tool rounds remain intact.
Tool calls and results within retained assistant turns stay together.
Summaries are untrusted historical reports, not tool permissions or proof that earlier actions still match the workspace.
They can lose detail. Full session history remains available for recovery.

Summarization adds API requests only when compaction is needed. The process caches its rolling summary for later turns.
Summaries are not saved as history or personal memory. Resuming a large session reconstructs the summary and can incur new requests.
Cancellation, empty summaries, and oversized summaries stop the request without replacing history.
If the current input, required system context, or a single historical turn cannot fit, shorten it or start a new session.
Context preparation runs before a generation stream. Tool output accumulated inside that stream can still exceed the provider window.
This release does not truncate active tool output or automatically retry provider context-limit errors.

## Diagnose a CLI setup

Run `angela doctor` before starting chat, or `angela doctor --json` for structured results.
Use `--locale en|vi`, `--config`, `--data-dir`, `--cwd`, `--model` and `--base-url`
with the same meanings as in chat. `angela doctor --help` lists these options.

The command checks provider configuration, context budget, directory permissions,
personal and project memory, saved sessions, lock files, voice health, audio commands
and available audio devices. Missing memory or history is normal on a new setup.
It preserves corrupt files and locks. A lock can belong to a running writer;
inspect that process before removing a lock yourself.

For OpenAI-compatible providers, it sends a bounded GET request to the configured
`/models` endpoint with the configured API key. It refuses redirects and does not
print credentials or provider error bodies. It sends no prompts or memory and
makes no generation request. Providers without this check receive a warning.
A listed model does not prove that generation works or that its permissions are sufficient.

Doctor does not write files, start services, record audio, play sound or load echo
cancellation modules. Directory permission checks do not test actual writes or free
space. Voice health and device listings do not verify transcription, speech or
microphone quality. Use `/voice` for a real conversation to check those and echo
cancellation. The echo check always reports this limitation as a warning.

Exit code 1 means at least one error; warnings alone return 0. JSON contains
`healthy` (no errors) and `checks`, each with `id`, `status` and a localized `message`.


## Memory stores and reusable skills

Personal facts remain in `memory/personal.json`. Optional `core` and `source` fields describe pinned facts and evidence for each edit.
Unclassified facts have no core designation. Direct commands record their text as evidence. Model writes also record the source session.
Use `/memory pin ID` and `/memory unpin ID` to control the core profile, limited to 4000 characters.

Reusable workflows live in `memory/skills/NAME/SKILL.md` with YAML `name` and `description` fields.
Skill instructions describe when to use the workflow, its steps, pitfalls, and verification.
The header records the latest verification quote and update time. File hashes identify versions for conflict detection.
Explicit imports and model saves use atomic replacement and exclusive per-skill locks.
Imports create new skills. Updating an existing skill requires its current version.
Agent-discovered project files do not automatically join this trusted store.
A skill is reusable guidance, never proof that the current task succeeded or permission to run a tool.

## Recall index

The CLI maintains a private derived index at `memory/recall.sqlite` using Node.js SQLite and FTS5.
Node.js 22.13 or newer is required for this feature. The index never replaces authoritative source files.
FTS5 ranks keyword matches with BM25. Vietnamese keywords support accents and common unaccented spelling, including `đ`.

Personal facts, enabled skills, and prior CLI user/assistant messages have distinct source identities.
Raw tool payloads, system prompts, Telegram histories and provider configuration are excluded from this index.
History normally stays within the current workspace. Explicit cross-workspace searches can find other CLI sessions in the same data directory.
Current-session messages remain under the existing context manager and are not duplicated into recall.
Excerpts carry their source, version and update time. Session dates describe session updates, not individual message timestamps.

File notifications schedule incremental history updates. Periodic reconciliation detects missed notifications.
Unchanged sources retain cached vectors. Background embedding batches yield between requests.
Every read rechecks the authoritative source and its enable switch before returning data.
Invalid files remain untouched and generate partial-recall status. Atomic updates and exclusive writer locks continue protecting source files.

Semantic retrieval is opt-in through `ANGELA_EMBEDDING_MODEL`.
`ANGELA_EMBEDDING_BASE_URL` selects an OpenAI-compatible embedding endpoint. Otherwise the chat base URL is used.
`ANGELA_EMBEDDING_API_KEY` selects its credential. Chat credentials are inherited only for the same origin.
Enabling embeddings sends indexed text, including historical user/assistant messages, to that endpoint.
The CLI installs no local model. Missing configuration uses keyword search. Failed requests report degraded semantic status and retain keyword access.
Requests reject redirects and bound response sizes, vector dimensions and execution time.
Keyword and cosine rankings combine through reciprocal rank fusion. Duplicate excerpts and repeated source hits are limited before context selection.

The excerpt budget is separate from fixed memory instructions and the bounded skill catalog.
Core facts take priority. Long documents remain readable through explicit recall tools.
`/memory used` reports supplied sources, not proof that the model relied on every source or that old outcomes remain true.

## Task domain

`Tasks` owns everyday todos, reminders, deadlines, routines, and follow-ups across CLI sessions.
It reuses `MemoryFile` for validated, private, atomic storage at `tasks/tasks.json` under the CLI data directory.
The store holds at most 100 tasks, including completed and cancelled history. Invalid files remain untouched.

The service exposes create, list, find, update, complete, cancel, and snooze operations.
Date-only tasks retain their date without an alarm time. Snooze preserves the task ID and original due time.
Daily and weekly routines use local calendar time. Selected weekdays use Sunday as 0 and Saturday as 6.
Routine completion records a check-in and retains the series. Cancellation stops the series.
