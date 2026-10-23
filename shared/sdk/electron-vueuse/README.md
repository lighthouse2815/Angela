# @angela/electron-vueuse

VueUse giống các composable và các trợ giúp được chia sẻ trên các ứng dụng Angela Electron.

<a id="what-it-provides"></a>

## Những gì nó cung cấp

- renderer các composable cho các hành vi phổ biến của Electron (`mouse`, `window bounds`, `auto updater`, v.v.)
- Mẫu Eventa context/invoke có thể tái sử dụng (`useElectronEventaContext`, `useElectronEventaInvoke`)
- Công thái học Eventa context/invoke cho mã renderer
- Tiện ích vòng lặp quy trình chính (`useLoop`, `createRendererLoop`)

Đối với định nghĩa hợp đồng IPC, hãy sử dụng `@angela/electron-eventa`.

<a id="usage"></a>

## Cách sử dụng

```ts
import { electron } from '@angela/electron-eventa'
import { useElectronEventaInvoke } from '@angela/electron-vueuse'

const openSettings = useElectronEventaInvoke(electron.window.getBounds)
```

```ts
import { createRendererLoop } from '@angela/electron-vueuse/main'
```
