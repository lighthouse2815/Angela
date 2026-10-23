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

## Build Study Along with limited permissions

`pnpm -F @angela/plugin-web-extension build:study-along` builds the dedicated extension into `.output-study-along/chrome-mv3`.
This target uses the existing WXT, Vue, UI, and Eventa infrastructure.
It excludes the general extension's page, subtitle, vision, and context collectors.
Its manifest requests only `activeTab`, `scripting`, `storage`, and access to the local bridge.

Load this target in Chrome or Chromium, open its popup, and copy its extension ID into Angela's pairing control.
Paste Angela's returned pairing into the popup and connect.
On the YouTube lesson, click **Share this video tab**.
Only that tab can answer fresh desktop media requests while it remains the current Chrome tab.
**Stop sharing** revokes tab consent immediately. Closing the tab or restarting the extension also clears tab consent.

The bridge binds only to IPv4 loopback. Every upgrade requires the paired Chrome extension origin and its 256-bit capability token.
The token is sent as a WebSocket subprotocol, not a query parameter, and is never included in diagnostics or model context.
Pairing remains private across desktop restarts. Revocation closes the connection and deletes the stored pairing.
The extension stores its own pairing, never website credentials or a copied browser session.

Desktop requests metadata through Eventa only when a lesson question needs it.
The response contains only URL, title, playback seconds, duration, and pause state.
No browser history, cookie, password, storage contents, screenshots, subtitles, or arbitrary page text are returned by this target.
No timestamp is extrapolated from old observations. An unknown playback position remains null.
If this source is unavailable, Angela can use its existing Playwright MCP provider.
