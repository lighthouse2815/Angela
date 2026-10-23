# @angela/better-ws

runtime nguyên thủy WebSocket không xác định cho các kết nối thời gian thực đáng tin cậy.

<a id="what-it-does"></a>

## Nó làm gì

- Cung cấp các nguyên hàm `createClient(...)` và `createServer(...)` runtime.
- Trạng thái và lịch trình kết nối máy khách track sẽ kết nối lại sau khi đóng bất ngờ.
- Máy chủ track ngang hàng và hỗ trợ các nhóm gửi, phát sóng và đặt tên ngang hàng.
- Gửi tin nhắn thô do người gọi sở hữu mà không áp đặt sự kiện, RPC hoặc giao thức mở rộng.

<a id="how-to-use"></a>

## Cách sử dụng

```ts
import { createClient } from '@angela/better-ws'
import { createServer } from '@angela/better-ws/server'

const client = createClient({
  url: 'ws://localhost:3000/ws',
  // Reconnect is enabled by default; pass an object to customize the policy.
  reconnect: {
    retries: Number.POSITIVE_INFINITY,
    delay: attempt => Math.min(1000 * 2 ** (attempt - 1), 30_000),
  },
})

await client.connect()
client.send('hello')

const server = createServer<string>()

server.onMessage(({ server, message }) => {
  server.broadcast(message)
})

const peer = server.accept({
  id: 'peer-1',
  send(message) {
    console.info('send to runtime', message)
    return true
  },
})

peer.receive('hello')
```

Hoạt động ngang hàng của máy chủ được chọn tham gia và điều khiển theo lịch trình. Nó có lưu lượng truy cập vào track mà không áp đặt bất kỳ hình dạng sự kiện giao thức nào. `checkLiveness()` đánh giá `peers.unhealthyTimeout` và `peers.closeTimeout`; nhịp tim phía máy chủ `mode`, `interval`, `message` và `isResponse` được dành riêng cho lập lịch điều khiển theo ứng dụng hoặc bộ điều hợp và không tự động gửi ping hoặc phân loại Responses.

```ts
const server = createServer<string>({
  peers: {
    unhealthyTimeout: 60_000,
    closeTimeout: 120_000,
  },
  heartbeat: {
    timeout: 60_000,
  },
})

server.onPeerHealthChange(({ peer, healthy, silentFor }) => {
  console.info('peer health changed', peer.id, healthy, silentFor)
})

setInterval(() => {
  server.checkLiveness()
}, 30_000)
```

Nhịp tim được chọn tham gia. Ví dụ này sử dụng nhịp tim của thông báo ở cấp ứng dụng. Chế độ nhịp tim tin nhắn yêu cầu `message` để khách hàng biết nội dung cần gửi:

```ts
const client = createClient({
  url: 'ws://localhost:3000/ws',
  heartbeat: {
    mode: 'message',
    message: 'ping',
    isResponse: message => message === 'pong',
    interval: 30_000,
    timeout: 10_000,
  },
})
```

Nhịp tim ping native chỉ được sử dụng khi đầu nối hiển thị `ping()`. Ở chế độ `auto`, máy khách sử dụng native `ping()` khi khả dụng và chỉ quay lại nhịp tim thông báo khi `message` được cung cấp. Bộ điều hợp `WebSocket` của trình duyệt tích hợp không hiển thị khung ping native.

Khi `isResponse` được cung cấp, nhịp tim sử dụng tính năng khớp phản hồi nghiêm ngặt: chỉ một tin nhắn gửi đến phù hợp mới xóa được thời gian chờ của nhịp tim đang chờ xử lý. Khi `isResponse` bị bỏ qua, mọi tin nhắn gửi đến đều được coi là có hiệu lực và xóa thời gian chờ đang chờ xử lý.

Với thông điệp không phải văn bản hoặc runtime không được hỗ trợ trực tiếp, truyền một connector. Connector quản lý việc phân tích và tuần tự hóa:

```ts
const client = createClient<string>({
  connector: {
    async connect(events) {
      const ws = new WebSocket('ws://localhost:3000/ws')
      ws.addEventListener('message', event => events.message(String(event.data)))
      ws.addEventListener('close', event => events.close({ code: event.code, reason: event.reason, wasClean: event.wasClean }))
      ws.addEventListener('error', event => events.error(event))

      await new Promise<void>((resolve) => {
        ws.addEventListener('open', () => resolve(), { once: true })
      })

      return {
        send: next => ws.send(next),
        close: (code, reason) => ws.close(code, reason),
      }
    },
  },
})

await client.connect()
client.send('hello')
```

<a id="when-to-use"></a>

## Khi nào nên sử dụng

- Bạn cần vòng đời kết nối, đăng ký ngang hàng, kết nối lại và phát sóng nguyên gốc.
- Bạn muốn giữ hình dạng tin nhắn được kiểm soát bởi ứng dụng hoặc bộ điều hợp cấp cao hơn.
- Bạn đang xây dựng một Eventa, JSON-RPC, tiện ích mở rộng hoặc bộ điều hợp giao thức tùy chỉnh ở trên cùng.

<a id="when-not-to-use"></a>

## Khi nào không nên sử dụng

- Bạn cần có một giao thức ứng dụng đầy đủ ngay lập tức.
- Bạn muốn các máy khách hoặc định dạng gói tương thích với socket.IO.
- Bạn chỉ cần một native `WebSocket` trực tiếp mà không cần kết nối lại hoặc quản lý ngang hàng.

<a id="license"></a>

## Giấy phép

[MIT](../../LICENSE)

## Build

Chạy `pnpm -F @angela/better-ws build` tại thư mục gốc.
Adapter H3 được build tại `dist/server/h3.mjs`, khớp export `@angela/better-ws/server/h3`.
Desktop và server runtime dùng export này.
