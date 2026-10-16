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

This entry point provides text chat and a built-in terminal MCP connection.
The web and desktop applications provide avatars, voice, and visual settings.

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

## Telegram

Run `angela telegram` to start private text chat through Telegram, using grammY long polling.
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

- `/start` or `/help`: show the available commands.
- `/status`: show the model, session ID, and request status.
- `/new`: clear the current chat's stored conversation and start again.
- `/cancel`: cancel the current request.

Each private chat has a separate session, also isolated by bot ID.
Sessions live under `~/.angela/sessions/telegram` and survive restarts. Restart from the same workspace to resume them.
The bot runs one request per chat and stays responsive to cancellation while the model works.
Requests time out after five minutes. Ctrl+C cancels active requests and releases session locks.
Long replies are split into plain Telegram messages. Telegram does not interpret model output as formatting.

This first version provides text chat only. It has no terminal tools, file access, or CLI permission mode.
It does not send existing CLI conversations to Telegram. A failed delivery leaves the generated answer in the saved session.
Validate routing and authorization with local API tests before you connect a real bot.

## Checks

```sh
pnpm -F @proj-airi/airi-cli typecheck
pnpm -F @proj-airi/airi-cli test
pnpm -F @proj-airi/airi-cli build
```
