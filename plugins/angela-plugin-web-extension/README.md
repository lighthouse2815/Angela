<a id="angela-plugin---web-extension"></a>

# Plugin Angela - Tiện ích mở rộng web

> Đọc những gì bạn đang đọc!

Đây là plugin giúp Angela hiểu được bạn đang đọc gì, đang xem gì hoặc đang nghe gì trên web.

<a id="what-it-does-now"></a>

## Bây giờ nó làm gì

- Ghi lại bối cảnh trang + video từ YouTube và Bilibili.
- Trích xuất phụ đề từ lớp phủ văn bản track hoặc DOM.
- Gửi thông tin cập nhật ngữ cảnh và các sự kiện `spark:notify` tùy chọn cho nhân vật.
- Hiển thị cửa sổ bật lên để định cấu hình WebSocket, chuyển đổi và trạng thái nhanh.

<a id="quick-start"></a>

## Bắt đầu nhanh

1. `pnpm -F @angela/plugin-web-extension dev`
2. Tải tiện ích mở rộng đã giải nén từ `.wxt/dev` trong trình duyệt của bạn.
3. Mở cửa sổ bật lên để đặt WebSocket URL (mặc định: `ws://localhost:6121/ws`).
4. Xem video YouTube/Bilibili và xác nhận cửa sổ bật lên hiển thị title/subtitle. được phát hiện
