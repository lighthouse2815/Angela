# @angela/server-sdk-shared

Hợp đồng sự kiện cho trò chuyện hosted WebSocket.

<a id="usage"></a>

## Cách sử dụng

```shell
ni @angela/server-sdk-shared -D
pnpm i @angela/server-sdk-shared -D
```

```typescript
import type { WireMessage } from '@angela/server-sdk-shared'

import { newMessages, pullMessages, sendMessages } from '@angela/server-sdk-shared'
```

Gói sử dụng Eventa `1.0.0-beta.15`. Bộ điều hợp WebSocket của nó chấp nhận các phong bì `id/type/payload` beta.13 và gửi các trường này cùng với các phong bì hiện tại.

`/ws/chat` giữ xác thực truy vấn-token cho các máy khách đã triển khai. `/ws/v2/chat` xác thực sau khi WebSocket mở bằng `chat:authenticate`.

<a id="license"></a>

## Giấy phép

[MIT](../../../LICENSE)
