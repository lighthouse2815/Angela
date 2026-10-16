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

This entry point provides text chat. The web and desktop applications provide avatars, voice, and visual settings.

## Checks

```sh
pnpm -F @proj-airi/airi-cli typecheck
pnpm -F @proj-airi/airi-cli test
pnpm -F @proj-airi/airi-cli build
```
