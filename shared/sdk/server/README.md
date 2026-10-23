# @angela/server-sdk

SDK dành cho mã phía clet để kết nối với các thành phần phía máy chủ.

<a id="usage"></a>

## Cách sử dụng

```shell
ni @angela/server-sdk -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @angela/server-sdk -D
yarn i @angela/server-sdk -D
npm i @angela/server-sdk -D
```

```typescript
import { Client } from '@angela/server-sdk'

const client = new Client({
  name: 'your airi plugin',
  autoConnect: false,
})

await client.connect()

client.onEvent('input:text', async (event) => {
  console.info(event.data.text)
})
```

`connect()` hiện giải quyết khi máy khách đã hoàn toàn sẵn sàng để sử dụng, không chỉ khi websocket transport đã mở. Trong thực tế điều đó có nghĩa là:

- socket đang mở
- xác thực thành công khi token được định cấu hình
- mô-đun đã tự thông báo thành công

Người trợ giúp runtime hữu ích:

- `client.connectionStatus` hiển thị trạng thái vòng đời hiện tại
- `client.isReady` cho bạn biết liệu máy khách đã hoàn tất xác thực + thông báo chưa
- `client.send()` trả về `false` thay vì âm thầm gửi tin nhắn khi socket không khả dụng
- `client.sendOrThrow()` khả dụng khi bạn muốn ngữ nghĩa phân phối nghiêm ngặt

<a id="read-chat-images-and-recordings"></a>

### Đọc hình ảnh và ghi âm trò chuyện

Sự kiện trò chuyện không mang byte hình ảnh hoặc âm thanh. `output:gen-ai:chat:message` liệt kê các hình ảnh và bản ghi tin nhắn của người dùng trong `gen-ai:chat.attachments`, mỗi hình ảnh có một tham chiếu như `airi-asset:<id>`. Đọc byte với `getAsset`:

```typescript
client.onEvent('output:gen-ai:chat:message', async (event) => {
  for (const attachment of event.data['gen-ai:chat']?.attachments ?? []) {
    const { mimeType, data } = await client.getAsset(attachment.ref)
    console.info(attachment.type, mimeType, data.byteLength, attachment.transcript)
  }
})
```

stage trả lời yêu cầu. `getAsset` từ chối khi nội dung bị thiếu, khi nó lớn hơn 50 MB hoặc khi không có stage trả lời trong vòng 10 giây.

stage chỉ trả lời khách hàng đã công bố mô-đun. Máy chủ cho stage biết kết nối nào được yêu cầu và câu trả lời chỉ quay lại kết nối đó.
- `client.onEvent()` trả về chức năng hủy đăng ký

<a id="license"></a>

## Giấy phép

[MIT](../../LICENSE)
