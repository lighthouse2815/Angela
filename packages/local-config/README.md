# Local Configuration

This package owns the provider configuration shared by Angela CLI, desktop, and local web applications.
Authentication sessions, account tokens, chat history, and interface preferences stay outside this file.

The default path is `~/.config/angela/config.json`.
`XDG_CONFIG_HOME` changes the configuration directory. `ANGELA_CONFIG` selects an explicit file.
CLI flags and environment variables are temporary overrides. They do not overwrite the shared file.

```json
{
  "version": 1,
  "providers": {},
  "chat": { "provider": "", "model": "" }
}
```

Each provider entry uses its stable instance ID as its key.
It contains `definitionId`, provider-specific `config`, and its existing validation `status`.
The `chat.provider` field selects that instance. `chat.model` selects its model.
Provider settings can contain API keys. The file stays outside Git and uses private file permissions.

`LocalConfigFile` reads validated snapshots and applies provider patches under an exclusive writer lock.
Each update reads the latest file before applying changes. Unrelated provider entries remain intact.
Atomic replacement prevents readers from observing partial JSON.
After a process crash, remove a stale `.lock` file only after all writers have stopped.

The browser entry contains the schema and HTTP transport without Node imports.
The `./node` entry owns filesystem access. The `./vite` entry exposes a local development and preview endpoint.
The endpoint requires a custom request header, same-origin access, and loopback host and client addresses.
It does not enable CORS or serve configuration to remote clients. Hosted configuration is outside this scope.

```sh
pnpm -F @proj-airi/local-config typecheck
pnpm -F @proj-airi/local-config test
pnpm -F @proj-airi/local-config build
```
