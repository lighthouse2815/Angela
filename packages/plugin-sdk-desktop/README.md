# @angela/plugin-sdk-desktop

Desktop helpers for Angela extensions, including widgets, gamelets, and tools.
This private workspace package supplies contracts shared by the Electron host, Kirie renderer, and desktop plugins.

## Use

Import the feature from its public subpath:

```ts
import type { WidgetsIframeInitPayload } from '@angela/plugin-sdk-desktop/widgets'
```

Build and check the package from the repository root:

```sh
pnpm -F @angela/plugin-sdk-desktop build
pnpm -F @angela/plugin-sdk-desktop typecheck
pnpm -F @angela/plugin-sdk-desktop exec vitest run --maxWorkers=1
```

Use this package for desktop extension contracts.
Use [`@angela/plugin-sdk`](../plugin-sdk/README.md) for host-independent extension manifests and lifecycle APIs.
The package rename preserves existing event names, extension IDs, and manifest fields.
