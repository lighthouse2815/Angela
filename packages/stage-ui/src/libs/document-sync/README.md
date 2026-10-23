<a id="document-sync"></a>

# đồng bộ hóa tài liệu

Đồng bộ hóa các tài liệu nhỏ của một người dùng giữa các thiết bị. Nó giải quyết xung đột cho từng trường chứ không phải cho từng tài liệu.

<a id="what-it-does"></a>

## Nó làm gì

- Một tài liệu là một tập hợp các trường độc lập. Bạn chọn các trường.
- Trường mà một thiết bị thay đổi sẽ nhận thay đổi đó.
- Trường mà hai thiết bị đã thay đổi sẽ nhận giá trị máy chủ. Tài liệu cục bộ trở thành bản sao xung đột nên không có thay đổi nào bị mất.
- Chỉnh sửa có quyền ưu tiên hơn việc xóa khỏi thiết bị khác.
- Mô-đun hoạt động ngoại tuyến. Nó sẽ gửi những thay đổi cục bộ trong lần chạy tiếp theo.
- Máy chủ lưu giữ các phiên bản trước đây của từng trường. Một tính năng chuyển `history` sang `createFieldSyncStore` có thể liệt kê chúng và đọc nội dung ở bản sửa đổi trước đây.

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

- Một người dùng sở hữu tài liệu và chỉnh sửa chúng trên nhiều thiết bị.
- Các tài liệu có kích thước nhỏ. Mỗi lần chạy sẽ đọc tất cả tài liệu của đối tượng địa lý.
- Bạn đặt giới hạn cho tài khoản (`limits` của `createFieldSyncStore`). Một tính năng mà store có dung lượng lớn hơn vài megabyte cho một tài khoản cần có thiết kế khác.

<a id="when-not-to-use-it"></a>

## Khi nào không nên sử dụng nó

- Chỉ nối thêm dữ liệu có dung lượng lớn, chẳng hạn như tin nhắn trò chuyện. Sử dụng tính năng đồng bộ hóa trò chuyện.
- Tập tin. store tệp trong bộ nhớ đối tượng và đồng bộ hóa mô tả của nó.
- Bí mật. Máy chủ store có các giá trị dưới dạng JSON đơn giản.

<a id="how-to-add-a-feature"></a>

## Cách thêm một tính năng

Mỗi tính năng sở hữu các bảng và route của nó. Máy chủ và máy khách chỉ chia sẻ thuật toán.

Máy chủ, trong `server/apps/api`:

1. Khai báo hai bảng trong tệp lược đồ của đối tượng địa lý và tạo di chuyển. Sao chép `server/apps/api/src/schemas/character-cards.ts` làm mẫu. Các bảng cần các cột của `FieldSyncTables` trong `services/domain/field-sync/tables.ts`. Trình biên dịch từ chối một bảng bị thiếu. Bảng trường chỉ nối thêm các hàng và khóa chính của nó bao gồm `revision`. Cột `value` của nó chấp nhận `null`, có nghĩa là bản sửa đổi đã loại bỏ trường này.
2. Tạo dịch vụ với `createFieldSyncStore(db, { documents, fields }, { validate, limits, history })`. Đặt mọi quy tắc về nội dung trong `validate`. Vượt qua `history` để giữ lại các bản sửa đổi trước đây. Không có nó, store chỉ giữ giá trị hiện tại của từng trường.
3. Viết route của tính năng này. Gọi `list`, `push` và `remove`, đồng thời phân tích các yêu cầu bằng `parseDocumentId`, `parsePushRequest` và `parseDeleteRevision`. Gọi `history` và `snapshot` cho route để đọc các bản sửa đổi trước đây và phân tích các yêu cầu của chúng bằng `parseHistoryQuery` và `parseRevisionParam`.

Khách hàng, trong `packages/stage-ui`:

1. Viết hàm chia tài liệu thành các trường và hàm nối các trường. Giữ các giá trị phải thay đổi cùng nhau trong một trường.
2. Gọi `synchronize` bằng ứng dụng khách để biết route, trạng thái đồng bộ hóa được lưu trữ cũng như các chức năng đọc và ghi tài liệu cục bộ.
3. Gọi `history` và `snapshot` trên máy khách `createDocumentSyncClient` để đọc các bản sửa đổi trước đây. Cả hai đều trả về `null` khi tài liệu hoặc bản sửa đổi đó không còn nữa.

`server/apps/api/src/services/domain/character-cards.ts`, `stores/modules/angela-card.ts` và `libs/character-card-sync/card-fields.ts` là mục đích sử dụng tham khảo.

```ts
import { createDocumentSyncClient, synchronize } from '../libs/document-sync'

await synchronize({
  client: createDocumentSyncClient({ serverUrl, path: '/api/v1/character-cards', fetch: authedFetch }),
  state: await documentSyncRepo.getState('character-cards', userId) ?? { documents: {} },
  saveState: state => documentSyncRepo.saveState('character-cards', userId, state),
  isCurrent: () => currentUserId() === userId,
  readLocal: () => splitAll(localDocuments),
  applyLocal: async changes => ({ rejected: writeLocalDocuments(changes) }),
})
```

<a id="extending-the-tables"></a>

## Mở rộng các bảng

Một tính năng có thể thêm cột, chỉ mục và các bảng khác. Cột được thêm phải chấp nhận `null` hoặc có giá trị mặc định. store chèn một hàng tài liệu chỉ có `ownerId` và `documentId` và trình biên dịch không bắt được cột bắt buộc. Đối với một giá trị bắt buộc, hãy store nó trong một trường hoặc trong một bảng khác có khóa `(ownerId, documentId)`.

<a id="rules-for-the-caller"></a>

## Quy tắc dành cho người gọi

- `applyLocal` phải viết các tài liệu cục bộ trước khi chờ đợi bất cứ điều gì. Việc chạy so sánh và viết trong một nhiệm vụ.
- Giá trị trường không được là `null`. Bỏ qua lĩnh vực này.
- Chạy một lần đồng bộ hóa cho từng tính năng và tài khoản.
- `synchronize` trả về các tài liệu mà máy chủ từ chối với 400 hoặc 413. Cho người dùng biết rằng các tài liệu này vẫn còn trên thiết bị. Cuộc chạy không dừng lại đối với họ.
- `applyLocal` trả về id của tài liệu mà nó không thể áp dụng, chẳng hạn vì nội dung không hợp lệ. Quá trình chạy sau đó sẽ giữ trạng thái đồng bộ hóa của chúng. Nếu không có nó, lần chạy tiếp theo sẽ đọc tài liệu bị thiếu dưới dạng xóa và xóa bản sao máy chủ.
- Một tài liệu mà mọi thiết bị tạo ra có cùng id, chẳng hạn như thẻ ký tự tích hợp, chỉ gửi các chỉnh sửa của nó. `readLocal` loại bỏ những phần tương đương với nội dung tích hợp sẵn và `applyLocal` sẽ thêm chúng trở lại. Nội dung tích hợp có thể phụ thuộc vào ngôn ngữ của thiết bị nên không được rời khỏi thiết bị.

Bản ghi thiết kế là `server/docs/ai/adr/2026-10-06-document-sync.md`.
