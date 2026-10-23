<a id="core-message-flow-architecture"></a>

# Kiến trúc luồng thông điệp cốt lõi

Tài liệu này phác thảo toàn bộ vòng đời của tin nhắn trong Satori Bot, từ sự kiện WebSocket ban đầu đến quá trình ra quyết định của LLM.

<a id="1-architectural-overview"></a>

## 1. Tổng quan về kiến ​​trúc

Bot hoạt động trên **Vòng lặp tự động + hướng sự kiện** kết hợp mô hình:
* **Lớp sự kiện**: Xử lý tín hiệu WebSocket thô, chống trùng lặp và xếp hàng.
* **Lớp lập lịch**: Sử dụng hàng đợi, cập nhật trạng thái "Nhóm chưa đọc" nội bộ và kích hoạt các vòng xử lý theo kênh cụ thể.
* **Lớp lập kế hoạch**: LLM hoạt động như một agent quan sát trạng thái "Nhóm chưa đọc" và "Hành động lịch sử" để quyết định xem nên sử dụng `read_unread_messages` (quan sát) hay `send_message` (hành động).

---

<a id="2-detailed-data-flow"></a>

## 2. Luồng dữ liệu chi tiết

<a id="phase-1-ingress"></a>

### Giai đoạn 1: Xâm nhập
**Vị trí:** `src/adapter/satori/client.ts` → `src/core/loop/queue.ts`

1.  **Tiếp nhận WebSocket**: `SatoriClient` nhận tín hiệu JSON thô và phân tích nó thành `SatoriEvent`.
2.  **Trình xử lý sự kiện**: `setupMessageEventHandler` (trong `queue.ts`) lắng nghe các sự kiện `message-created`.
3.  **Loại bỏ trùng lặp**: Hệ thống kiểm tra bộ `processedIds` (khóa: `channelId-messageId`) để ngăn chặn việc xử lý kép.
4.  **Đang xếp hàng**:
    * `event` thô được gói vào một đối tượng `{ event, status: 'ready' }`.
    * Nó được đẩy vào `botContext.eventQueue` và lưu vào cơ sở dữ liệu thông qua `pushToEventQueue`.
    * **Dữ liệu chính**: `event.message.content`, `event.user.id`, `event.channel.id`.

<a id="phase-2-consumption--anchoring"></a>

### Giai đoạn 2: Tiêu thụ & Neo
**Vị trí:** `src/core/loop/scheduler.ts` (Chức năng: `onMessageArrival`)

Khi khóa xử lý hệ thống rảnh, nó sẽ tiêu thụ các sự kiện từ `eventQueue`:

1.  **Khởi tạo bối cảnh**:
    * Trích xuất `channelId`.
    * Gọi `ensureChatContext` (trong `src/core/session/context.ts`) để tải hoặc tạo `ChatContext` trong bộ nhớ cho kênh đó.
    * **Anchor**: `event.channel.id` là khóa chính cho tất cả ngữ cảnh.
2.  **Lọc**:
    * Kiểm tra `selfId`. Nếu người gửi chính là bot thì sự kiện sẽ bị xóa khỏi hàng đợi và bị loại bỏ (không được tính là chưa đọc).
3.  **Cập nhật trạng thái ("Nhóm chưa đọc")**:
    * Sự kiện được đẩy vào `botContext.unreadEvents[channelId]` và được lưu vào cơ sở dữ liệu thông qua `pushToUnreadEvents`.
    * Sự kiện này sau đó sẽ bị xóa khỏi hàng đợi cơ sở dữ liệu thông qua `removeFromEventQueue`.
4.  **Kích hoạt vòng lặp**:
    * Gọi ngay `loopIterationForChannel`, đánh thức Vòng lặp agent cho kênh cụ thể này.

<a id="phase-3-reasoning-llm"></a>

### Giai đoạn 3: suy luận (LLM)
**Vị trí:** `src/core/loop/scheduler.ts` → `src/core/planner/llm-client.ts`

LLM được nhắc không "trả lời văn bản này" mà "quyết định hành động tiếp theo dựa trên trạng thái".

1.  **Xây dựng bối cảnh (`imagineAnAction`)**:
    * **Hệ thống**: Đưa `system-action-gen-v1` (Định nghĩa công cụ) và `personality-v1` (Persona).
    * **Bộ nhớ ngắn hạn**: Tiêm `chatContext.messages` (chuyển hướng cuộc trò chuyện gần đây).
    * **Trạng thái toàn cầu (Quan trọng)**: prompt tuyên bố rõ ràng: *"Bạn có X sự kiện chưa đọc."* và liệt kê nội dung của `botContext.unreadEvents`.
    * **Incoming Incoming**: Nếu có một luồng tin nhắn đến, nó sẽ được đưa vào dưới dạng khối `Incoming events` ở cuối prompt.
    * **Lịch sử hành động**: Đưa `chatContext.actions` vào để hiển thị kết quả của những lần thử trước đó (ví dụ: "Hành động cuối cùng: read_messages, Kết quả: Thành công").
2.  **Generation**:
    * LLM xuất ra Hành động JSON được định dạng nghiêm ngặt, ví dụ: `{"action": "read_unread_messages", "channelId": "..."}`.

<a id="phase-4-dispatch--execution"></a>

### Giai đoạn 4: Điều phối & Thi công
**Vị trí:** `src/core/dispatcher.ts` → `src/capabilities/registry.ts`

Hệ thống tra cứu Handler tương ứng trong `globalRegistry` dựa trên Hành động JSON:

* **Vỏ: `read_unread_messages`** (`src/capabilities/actions/read-messages.ts`)
    * **Logic**: Truy xuất tất cả các sự kiện tồn đọng từ `botContext.unreadEvents` cho kênh được chỉ định.
    * **Định dạng**: Chuyển đổi chúng thành một khối văn bản duy nhất (ví dụ: `[User]: Content`).
    * **Kết quả**: store văn bản này trong `Action Result`.
    * **Thay đổi trạng thái**: Xóa `unreadEvents` cho kênh đó. Trong **Tick tiếp theo**, LLM sẽ thấy văn bản này trong Hành động lịch sử của nó và tạo ra câu trả lời.

* **Vỏ: `send_message`** (`src/capabilities/actions/send-message.ts`)
    * **Kiểm tra an toàn**: Kiểm tra lại `unreadEvents`. Nếu tin nhắn mới đến trong sinh nội dung, nó có thể hủy quá trình gửi để ưu tiên đọc.
    * **Thực thi**: Gọi `satoriClient.sendMessage`.
    * **Ghi âm**: Duy trì phản hồi cho DB và mảng `messages` trong bộ nhớ.

<a id="phase-5-loop-continuation"></a>

### Giai đoạn 5: Tiếp tục vòng lặp
**Vị trí:** `src/core/loop/scheduler.ts` (`handleLoopStep`)

* `dispatchAction` trả về `ActionResult` chứa cờ `shouldContinue`.
* Nếu `shouldContinue` là đúng (ví dụ: thường đúng sau khi đọc tin nhắn, vì dự kiến ​​sẽ có phản hồi), bộ lập lịch sẽ đợi `LOOP_CONTINUE_DELAY_MS` (mặc định là 2,5 giây) và sau đó gọi đệ quy `handleLoopStep`.
* **Giới hạn cứng**: Để ngăn chặn các vòng lặp vô hạn do ảo giác LLM hoặc lạm dụng API gây ra, mỗi vòng lặp được giới hạn ở `MAX_LOOP_ITERATIONS = 5`. Đạt đến giới hạn này sẽ buộc vòng lặp bị đứt.
* **Chấm dứt**: Vòng lặp dừng khi LLM chọn hành động đầu cuối, đạt đến giới hạn lặp lại hoặc cờ `shouldContinue` trở thành sai.
