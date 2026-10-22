# @angela/server-sdk-shared

Eventa contracts for the hosted chat WebSocket.

## Usage

```shell
ni @angela/server-sdk-shared -D
pnpm i @angela/server-sdk-shared -D
```

```typescript
import type { WireMessage } from '@angela/server-sdk-shared'

import { newMessages, pullMessages, sendMessages } from '@angela/server-sdk-shared'
```

The package uses Eventa `1.0.0-beta.15`. Its WebSocket adapter accepts beta.13
`id/type/payload` envelopes and sends these fields with current envelopes.

`/ws/chat` keeps query-token authentication for deployed clients. `/ws/v2/chat`
authenticates after the WebSocket opens with `chat:authenticate`.

## License

[MIT](../../../LICENSE)
