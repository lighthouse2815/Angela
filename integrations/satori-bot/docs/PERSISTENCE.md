<a id="architecture-status-report-memory--persistence"></a>

## **Báo cáo trạng thái kiến ​​trúc: Bộ nhớ và tính bền bỉ**

**Ngày:** Ngày 6 tháng 3 năm 2026 (Được tái cấu trúc) **Thành phần:** Lớp quản lý trạng thái (Mưa phùn + PGlite)

<a id="1-memory-architecture-ram"></a>

### **1. Kiến trúc bộ nhớ (RAM)**

Bot sử dụng chiến lược **Ưu tiên bộ nhớ** cho các phiên trò chuyện đang hoạt động, đồng thời lưu giữ dữ liệu tin nhắn và hàng đợi quan trọng vào đĩa.

* **Cơ chế lưu trữ**: Ngữ cảnh trò chuyện đang hoạt động được lưu trữ trong native `Map<string, ChatContext>` trong đối tượng `BotContext` (`src/core/types.ts`).
* **Quản lý vòng đời**:
    * **Sáng tạo**: Các ngữ cảnh được tải từng phần qua `ensureChatContext` trong `src/core/session/context.ts` khi nhận được tin nhắn.
    * **Lưu giữ**: Hiện tại, ngữ cảnh vẫn còn trong bộ nhớ cho đến khi quá trình kết thúc. Lịch sử được cắt bớt trong vòng lặp.
* **Cắt xén bối cảnh**:
    * Được thực thi trong `handleLoopStep` trong `src/core/loop/scheduler.ts`.
    * Các kênh riêng lẻ thực thi các giới hạn nghiêm ngặt: `MAX_ACTIONS_IN_CONTEXT = 50`, `ACTIONS_KEEP_ON_TRIM = 20`.
    * Lịch sử tin nhắn được tìm nạp động từ cơ sở dữ liệu (10 tin nhắn gần đây nhất) để giữ cho bối cảnh LLM gọn gàng.

<a id="2-persistence-architecture-database"></a>

### **2. Kiến trúc bền vững (Cơ sở dữ liệu)**

Bot đã di chuyển từ `lowdb` (JSON) sang **PGlite** (PostgreSQL trong WASM/Node) với **Drizzle ORM** để quản lý trạng thái mạnh mẽ và I/O. hiệu suất cao

* **Công nghệ**: [PGlite](https://pglite.dev/) + [Drắc ORM](https://orm.drizzle.team/).
* **Vị trí**: Thư mục `data/` (được định cấu hình qua `DB_PATH` trong `.env.local`).
* **Sơ đồ (`src/lib/schema.ts`)**:
    * `channels`: Siêu dữ liệu cho các kênh được phát hiện (ID, tên, nền tảng, self_id).
    * `messages`: Nhật ký tin nhắn liên tục có lập chỉ mục trên `channel_id` và `timestamp`.
    * `event_queue`: Hàng đợi liên tục cho các sự kiện Satori đang chờ xử lý.
    * `unread_events`: store liên tục cho các sự kiện được đánh dấu là chưa đọc cho mỗi kênh.
* **Chiến lược I/O được tối ưu hóa**:
    * **Cập nhật gia tăng**: Không giống như phương pháp "viết lại toàn bộ" trước đây, bot hiện sử dụng các hoạt động SQL được nhắm mục tiêu.
    * **Quản lý hàng đợi**: Các mục riêng lẻ được thêm (`pushToEventQueue`) và xóa (`removeFromEventQueue`) bởi ID.
    * **Theo dõi chưa đọc**: Tin nhắn chưa đọc được lưu giữ tăng dần (`pushToUnreadEvents`) và bị xóa trên mỗi kênh (`clearUnreadEventsForChannel`).
* **Di chuyển**: Được quản lý qua `drizzle-kit`. Việc di chuyển được tự động áp dụng khi khởi động trong `src/lib/db.ts`.

<a id="3-state-consistency--recovery"></a>

### **3. Tính nhất quán và phục hồi trạng thái**

Khoảng cách giữa bộ nhớ tạm thời và trạng thái đĩa liên tục đã được thu hẹp đáng kể.

* **Hàng đợi bền bỉ**: `eventQueue` và `unreadEvents` được duy trì hoàn toàn. Nếu bot gặp sự cố, nó sẽ tiếp tục xử lý hàng đợi từ nơi nó dừng lại.
* **Lịch sử tin nhắn**: Lịch sử hội thoại của LLM được xây dựng lại từ bảng `messages` được lập chỉ mục trong cơ sở dữ liệu, đảm bảo tính liên tục trong các lần khởi động lại.
* **Giảm thiểu việc thiết lập lại cứng**: Mặc dù các bộ điều khiển `AbortController` vẫn bị mất khi khởi động lại nhưng hàng đợi tác vụ cốt lõi và bối cảnh hội thoại vẫn còn nguyên.

<a id="4-configuration"></a>

### **4. Cấu hình**

Cài đặt cơ sở dữ liệu được quản lý thông qua `src/config.ts`:
* `DB_PATH`: Đường dẫn tới thư mục dữ liệu PGlite (mặc định: `data/pglite-db`).
