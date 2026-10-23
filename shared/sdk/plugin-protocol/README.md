# @angela/plugin-protocol

Hợp đồng giao thức dùng chung cho giao tiếp plugin-module ở Angela.

<a id="what-it-does"></a>

## Nó làm gì

- Xác định tên sự kiện websocket và loại tải trọng để điều phối module/plugin.
- Hiển thị các định nghĩa sự kiện Eventa được liên kết với tên sự kiện giao thức.
- Cung cấp các loại tiện ích transport/event được chia sẻ được sử dụng bởi máy chủ và plugin runtime.

<a id="how-to-use"></a>

## Cách sử dụng

```ts
import type { WebSocketEvent, WebSocketEventOf, WebSocketEvents } from '@angela/plugin-protocol/types'

import { moduleAnnounce, moduleAuthenticate } from '@angela/plugin-protocol/types'
```

<a id="when-to-use"></a>

## Khi nào nên sử dụng

- Bạn cần các hợp đồng giao thức chuẩn cho giao tiếp <-> host của plugin.
- Bạn cần sự ổn định của tên sự kiện và định nghĩa tải trọng phù hợp trên runtime.

<a id="when-not-to-use"></a>

## Khi nào không nên sử dụng

- Bạn chỉ cần API máy khách runtime cấp cao hơn từ các gói SDK.
- Bạn đang triển khai trạng thái UI chỉ dành cho ứng dụng và không thuộc hợp đồng plugin/server transport.

<a id="license"></a>

## Giấy phép

[MIT](../../LICENSE)
