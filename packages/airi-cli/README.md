# Angela CLI

Chat with Angela from a Node.js terminal. The CLI uses AIRI's existing provider and generation runtime.

## Run

From the repository root, install workspace dependencies and build the required packages:

```sh
pnpm install
pnpm -F @proj-airi/airi-cli... build
```

Configure the provider through environment variables:

```sh
export ANGELA_MODEL='your-model-id'
export ANGELA_API_KEY='your-provider-key'
export ANGELA_BASE_URL='https://your-provider.example/v1/'
pnpm cli
```

Use `ANGELA_API=responses` for a Responses endpoint. The default protocol is `chat-completions`.
Local endpoints can use an empty API key. Credentials have no command-line flag.

```sh
pnpm cli --prompt 'Giải thích async/await'
printf 'Giải thích async/await' | pnpm cli
pnpm cli --cwd ./packages/core-agent --locale en
pnpm cli --help
```

Flags override environment configuration. The default interface language is Vietnamese.
Use `ANGELA_LOCALE=en` or `--locale en` for English.

During interactive chat, Ctrl+C cancels the current request. Use `/exit` or Ctrl+D to quit.
One-shot requests return exit code 1 for errors and 130 for cancellation.

## Scope

This entry point provides text chat and an optional MCP connection.
The web and desktop applications provide avatars, voice, and visual settings.

## Terminal tools

Build the service, then connect its terminal tools:

```sh
pnpm -F @proj-airi/computer-use-mcp build
pnpm cli --computer-use --cwd ./packages/core-agent
```

The model discovers tools through `builtIn_mcpListTools` and calls them through `builtIn_mcpCallTool`.
The built-in connection exposes terminal tools only. File reads and edits use terminal commands.
The CLI supplies the selected workspace when a terminal call omits `cwd`.
The workspace is a working directory, not a filesystem sandbox.

Before each tool call, the CLI shows its name and arguments. Type `yes` to allow that exact call.
Server-side pending actions require a second confirmation of the returned action.
The model cannot call approval endpoints directly. Without a terminal reader, tool calls are denied.
Cancellation stops the model request and MCP wait. Completed or running external actions can retain side effects.

To connect another trusted stdio MCP server, supply its executable and arguments separately:

```sh
pnpm cli --mcp-command pnpm --mcp-arg=-F --mcp-arg=@proj-airi/computer-use-mcp --mcp-arg=start
```

The server starts in `--cwd`. Its stderr goes to the terminal. CLI output never mixes with the server protocol.
The child process does not receive `ANGELA_API_KEY`. Other environment variables remain available to the server.

## Checks

```sh
pnpm -F @proj-airi/airi-cli typecheck
pnpm -F @proj-airi/airi-cli test
pnpm -F @proj-airi/airi-cli build
```
