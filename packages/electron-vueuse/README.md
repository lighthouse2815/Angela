# @angela/electron-vueuse

VueUse-like composables and helpers shared across AIRI Electron apps.

## What it provides

- Renderer composables for common Electron behaviors (`mouse`, `window bounds`, `auto updater`, etc.)
- A reusable Eventa context/invoke pattern (`useElectronEventaContext`, `useElectronEventaInvoke`)
- Eventa context/invoke ergonomics for renderer code
- Main-process loop utilities (`useLoop`, `createRendererLoop`)

For IPC contract definitions, use `@angela/electron-eventa`.

## Usage

```ts
import { electron } from '@angela/electron-eventa'
import { useElectronEventaInvoke } from '@angela/electron-vueuse'

const openSettings = useElectronEventaInvoke(electron.window.getBounds)
```

```ts
import { createRendererLoop } from '@angela/electron-vueuse/main'
```
