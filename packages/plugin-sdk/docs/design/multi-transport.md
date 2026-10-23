<a id="multi-transport-plugin-contexts"></a>

# Bối cảnh plugin đa transport

- [Tóm tắt](#summary)
- [Nền](#background)
- [Mục tiêu](#goals)
- [Không có mục tiêu](#non-goals)
- [Đề xuất](#proposal)
- [Chi tiết thiết kế](#design-Details)
  - [Context và transport Model](#context-and-transport-model)
  - [Vị trí vòng đời](#lifecycle-placement)
  - Bố cục [Host runtime](#host-runtime-layout)
  - Chiến lược ràng buộc [API](#api-binding-strategy)
  - [Local và Remote Plugin](#local-vs-remote-plugins)
  - [Cách ly đa plugin](#multi-plugin-isolation)
- [Xác minh và kiểm tra](#verify--test)
  - [Tiêu chí](#criteria)
  - [Test & QA](#test--qa)
- [Tiến trình](#progress)
  - [Trạng thái](#status)
  - [Các bước tiếp theo](#next-steps)
- [Đánh giá](#reviews)
  - [Q&A](#qa)
  - [Tài liệu liên quan](#related-documentations)

<a id="summary"></a>

## Bản tóm tắt

Giới thiệu ngữ cảnh nhận biết transport phía host hàm tạo cung cấp một ngữ cảnh Eventa cho mỗi phiên bản plugin. API SDK của plugin trở thành hàm tạo theo ngữ cảnh, cho phép các plugin cục bộ (in-memory/worker) và từ xa (WebSocket) chia sẻ cùng một bề mặt API trong khi sử dụng các phương thức vận chuyển khác nhau. Điều này cho phép nhiều plugin trong một Plugin host duy nhất mà không cần ghép kênh chéo hoặc kênh toàn cầu.

<a id="background"></a>

## Lý lịch

`plugin-sdk` hiện hiển thị các API (ví dụ `providers.listProviders`) gọi `defineInvoke` trên kênh được nhập toàn cầu. Điều này kết hợp các plugin vào một ngữ cảnh được chia sẻ duy nhất và ngăn host cách ly nhiều plugin hoặc sử dụng các phương thức vận chuyển khác nhau cho mỗi plugin. Chúng tôi cũng cần một đường dẫn để hỗ trợ các plugin cục bộ (đang xử lý hoặc worker) và các plugin từ xa (WebSocket) với công thái học nhất quán.

Eventa hướng theo ngữ cảnh: các ngữ cảnh được tạo trên mỗi transport (trong bộ nhớ, WebSocket, worker, electron) và các API invoke/handler đính kèm với ngữ cảnh đó. Nhiều bối cảnh có thể cùng tồn tại trong cùng một quá trình.

<a id="goals"></a>

## Bàn thắng

- Cung cấp một ngữ cảnh cho mỗi phiên bản plugin, trong phạm vi transport.
- Cho phép cùng một bề mặt API hoạt động cho các plugin cục bộ và từ xa.
- Giữ lựa chọn transport dưới sự kiểm soát của Plugin host, không phải kiểm soát plugin.
- Hỗ trợ nhiều plugin trong một host mà không bị xung đột kênh.
- Giữ công thái học API dành cho tác giả plugin đơn giản và rõ ràng.

## Non-goals

- Thiết kế điều phối vòng đời plugin đầy đủ (chuyển pha, cấu hình khả năng, v.v.).
- Triển khai ngăn xếp transport mới ngoài bộ điều hợp Eventa (trừ khi được yêu cầu bởi các khoảng trống runtime).
- Xác định các định dạng phân phối hoặc đóng gói mở rộng ngoài các điểm vào `ExtensionManifestV2`.

<a id="proposal"></a>

## Đề xuất

1. Thêm hàm tạo `createPluginContext(transport)` phía host, trả về ngữ cảnh Eventa gắn với transport của plugin.
2. Chuyển đổi API SDK của plugin thành hàm tạo (`createApis(ctx)`) theo ngữ cảnh, thay thế việc sử dụng kênh toàn cầu.
3. Giải quyết transport trên mỗi phiên bản plugin trong quá trình thiết lập host và chuyển ngữ cảnh đã tạo vào plugin `init()`.
4. Thêm các triển khai dành riêng cho runtime trong `plugin-host/runtimes/node` và `plugin-host/runtimes/web` để xử lý các bộ điều hợp transport khác nhau.
5. Tùy chọn: giới thiệu những người trợ giúp WebSocket đáng tin cậy được chia sẻ nếu cần, nhưng trước tiên hãy ưu tiên bộ điều hợp Eventa.

<a id="design-details"></a>

## Chi tiết thiết kế

Bối cảnh nhận biết transport cho nhiều plugin host bị cô lập.

<a id="context-and-transport-model"></a>

### Bối cảnh và transport mô hình

Xác định loại cấu hình transport nhỏ do Plugin host sở hữu:

```ts
export type PluginTransport
  = | { kind: 'in-memory' }
    | { kind: 'websocket', url: string, protocols?: string[] }
    | { kind: 'web-worker', worker: Worker }
    | { kind: 'node-worker', worker: import('node:worker_threads').Worker }
    | { kind: 'electron', target: 'main' | 'renderer', webContentsId?: number }
```

`createPluginContext(transport)` tạo và trả về bối cảnh Eventa dựa trên bộ điều hợp transport (trong bộ nhớ, WebSocket, worker, electron).

<a id="lifecycle-placement"></a>

### Vị trí vòng đời

Việc tạo bối cảnh diễn ra trong quá trình thiết lập host, trước khi bất kỳ phương thức vòng đời plugin nào được gọi.

1. Tải mô-đun plugin (FileSystemLoader / UrlLoader).
2. Giải quyết transport cho plugin (tệp kê khai + cấu hình host).
3. Tạo bối cảnh thông qua `createPluginContext(transport)`.
4. Liên kết API với `createApis(ctx)`.
5. Gọi `plugin.init({ host: ctx, apis })`.

<a id="host-runtime-layout"></a>

### Bố cục host runtime

- `packages/plugin-sdk/src/plugin-host/transports/`:
  - Định nghĩa và trợ giúp loại transport
- `packages/plugin-sdk/src/plugin-host/runtimes/node/`:
  - trong bộ nhớ, Node-worker, triển khai websocket
- `packages/plugin-sdk/src/plugin-host/runtimes/web/`:
  - web-worker, triển khai websocket
- `packages/plugin-sdk/src/plugin-host/index.ts`:
  - xuất khẩu `createPluginContext` phù hợp với runtime thông qua xuất khẩu có điều kiện

<a id="api-binding-strategy"></a>

### Chiến lược ràng buộc API

Thay thế việc sử dụng kênh trực tiếp bằng hàm tạo theo ngữ cảnh:

```ts
export function createProviders(ctx: EventaContext) {
  return {
    listProviders() {
      return defineInvoke(ctx, protocolListProviders)()
    },
  }
}

export function createApis(ctx: EventaContext) {
  return { providers: createProviders(ctx) }
}
```

Các plugin gọi `createApis(ctx)` do host cung cấp thay vì nhập các đơn vị toàn cầu.

<a id="local-vs-remote-plugins"></a>

### Plugin cục bộ và từ xa

- Các plugin cục bộ:
  - `in-memory` cho trường hợp đơn giản nhất
  - `node-worker` hoặc `web-worker` để cách ly
- Các plugin từ xa:
  - `websocket` transport được liên kết với một URL hoặc kết nối cụ thể

Lựa chọn transport là mối quan tâm của host; các plugin là transport-bất khả tri.

<a id="multi-plugin-isolation"></a>

### Cách ly nhiều plugin

Mỗi plugin có ngữ cảnh và transport riêng. Các API bị ràng buộc với bối cảnh đó, ngăn chặn việc trao đổi chéo. host giữ plugin ánh xạ đăng ký ID vào ngữ cảnh của nó, transport và mô-đun được tải để quản lý vòng đời.

<a id="verify--test"></a>

## Xác minh & Kiểm tra

<a id="criteria"></a>

### Tiêu chuẩn

- Nhiều plugin có thể được tải trong một host mà không cần chia sẻ các kênh toàn cầu và không có rò rỉ invoke/handler plugin chéo.
- Lệnh gọi plugin cục bộ sử dụng ngữ cảnh trong bộ nhớ hoặc worker mà không cần nối dây thủ công trong mã plugin.
- Cuộc gọi plugin từ xa sử dụng ngữ cảnh WebSocket và không ảnh hưởng đến plugin cục bộ.
- Các quá trình chuyển đổi vòng đời được host xác thực bằng trạng thái rõ ràng mô hình (các quá trình chuyển đổi không hợp lệ sẽ bị từ chối do lỗi đánh máy).
- Khả năng grant/revoke được thực thi ở ranh giới host và được bao phủ bởi các thử nghiệm về hành vi từ chối theo mặc định.
- Hành vi đáng tin cậy của transport được xác định và kiểm tra (nhịp tim, kết nối lại, xử lý sự kiện trùng lặp, đảm bảo đặt hàng).
- Khả năng tương thích giao thức được phiên bản và thương lượng (phiên bản host/plugin không khớp tạo ra kết quả xác định).
- Các trường khả năng quan sát bắt buộc (id tương quan, id plugin, loại transport, phase/status) có trong các sự kiện trên mặt phẳng điều khiển.

<a id="test--qa"></a>

### Kiểm tra & QA

- Kiểm tra đơn vị: tạo hai bối cảnh plugin trong cùng một quy trình, xác minh các cặp invoke/handler bị cô lập.
- Kiểm tra đơn vị: FileSystemLoader + bối cảnh trong bộ nhớ liên kết chính xác với `createApis(ctx)`.
- Kiểm tra tích hợp (tùy chọn): Chuyến đi khứ hồi bộ chuyển đổi WebSocket bằng máy chủ stub.

<a id="progress"></a>

## Tiến triển

<a id="status"></a>

### Trạng thái

- Đã lên kế hoạch.
- Kiến trúc cơ bản đã được xác thực; yêu cầu làm cứng trước khi sử dụng sản xuất.

<a id="next-steps"></a>

### Các bước tiếp theo

1. Kết thúc hệ thống dây điện transport:
   - Triển khai `createPluginContext` cho node/web runtime (trong bộ nhớ, websocket, worker và electron nếu có).
   - Xóa việc sử dụng kênh chung phương án dự phòng khỏi đường dẫn runtime sau khi quá trình chèn ngữ cảnh hoàn tất.
2. Chính thức hóa hợp đồng vòng đời:
   - Xác định máy trạng thái đã nhập cho các giai đoạn cấu hình khả năng và vòng đời mô-đun.
   - Thực thi chuyển đổi trong Plugin host có lỗi cấu trúc Responses.
3. Thêm bảo mật và thực thi chính sách:
   - Thực hiện kiểm tra khả năng từ chối theo mặc định và các luồng grant/revoke rõ ràng.
   - Thêm các bài kiểm tra về đường dẫn gọi trái phép và hành vi thu hồi.
4. Xác định độ tin cậy và khả năng tương thích:
   - Chỉ định ngữ nghĩa reconnect/heartbeat/backpressure cho việc truyền tải WebSocket.
   - Giới thiệu đàm phán phiên bản protocol/api để tương thích với plugin host.
5. Mở rộng ma trận thử nghiệm:
   - Các thử nghiệm cách ly nhiều plugin với các phương thức vận chuyển hỗn hợp trong một host.
   - Kiểm tra tích hợp cho chuyến đi khứ hồi websocket và khôi phục kết nối lại.
   - Kiểm tra hồi quy xác thực siêu dữ liệu có khả năng quan sát cần thiết trên các sự kiện lifecycle/control.

<a id="reviews"></a>

## Đánh giá

<a id="qa"></a>

### Hỏi đáp

- Hỏi: Tại sao không giữ lại các kênh toàn cầu mà chỉ chuyển kênh hoạt động? Trả lời: Các kênh toàn cầu không thể tách biệt nhiều plugin và yêu cầu trạng thái toàn cầu thay đổi trạng thái. Ngữ cảnh trên mỗi plugin tránh nói chuyện chéo và phù hợp với thiết kế của Eventa.

- Câu hỏi: Các plugin có cần biết về phương thức vận chuyển không? Đáp: Không. host đưa vào ngữ cảnh và API; các plugin vẫn không có tính chất bất khả tri của transport.

- Câu hỏi: Chúng ta có nên xây dựng gói WebSocket dùng chung đáng tin cậy không? Trả lời: Chỉ khi chúng tôi cần logic reconnection/heartbeat tùy chỉnh trên nhiều gói. Bắt đầu với bộ điều hợp Eventa; tính ra logic được chia sẻ sau nếu được yêu cầu.

- Câu hỏi: worker có thể được sử dụng để cách ly plugin không? Đ: Vâng. Sử dụng bộ điều hợp Eventa web-worker hoặc Node-worker để kết nối ngữ cảnh trên mỗi plugin với worker.

<a id="related-documentations"></a>

### Tài liệu liên quan

- [Vòng đời plugin](./plugin-lifecycle.md)
