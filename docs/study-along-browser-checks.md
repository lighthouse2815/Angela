# Kiểm tra Study Along bằng Chromium thật

Hai nhóm kiểm tra tách việc quan sát media khỏi thao tác extension.
Chúng dùng Chromium thật và trang video do test kiểm soát, không phụ thuộc trạng thái YouTube công khai.
Provider transcript và model trả dữ liệu cố định. Browser, extension, bridge và Eventa chạy thật.
Hồ sơ browser, pairing và cache của test nằm trong thư mục tạm riêng, được xóa khi kết thúc.

## Quan sát trang video

```sh
ANGELA_TEST_CHROME=1 pnpm exec vitest run --config apps/desktop/vitest.node.config.ts src/main/services/angela/internet/browser.chromium.test.ts
```

Test chạy chính script quan sát production trong Chromium.
Nó xác nhận vị trí phát mới, giới hạn nội dung vừa xem, cache và lỗi khi tab không còn video.
Transport MCP là ranh giới giả lập trong nhóm này.

## Extension đã build và quyền tab

Build extension giới hạn quyền:

```sh
pnpm -F @angela/plugin-web-extension build:study-along
```

Chọn full Chromium có CDP `Extensions.loadUnpacked`, `Extensions.triggerAction` và `Extensions.uninstall`.
Headless shell không cung cấp các thao tác này.
Đặt `ANGELA_TEST_CHROME_EXECUTABLE` thành đường dẫn tuyệt đối của binary đã cài, rồi chạy:

```sh
ANGELA_TEST_EXTENSION=1 pnpm exec vitest run --config apps/desktop/vitest.node.config.ts src/main/services/angela/internet/browser.extension.chromium.test.ts
```

Test cài extension thật vào hồ sơ riêng và nhập pairing qua giao diện popup thật.
CDP kích hoạt extension trên tab bài học, tương đương thao tác cấp `activeTab` trong browser.
Giao diện extension yêu cầu chia sẻ tab qua runtime Eventa production.
Desktop nhận vị trí phát mới qua bridge WebSocket có xác thực và tạo đoạn trích, bản tóm tắt có giới hạn.
Test xác nhận dừng chia sẻ, đóng tab, gỡ extension và thu hồi pairing đều chặn quan sát tiếp theo.
Transcript đã cache không cấp lại quyền đọc tab.

Nhóm này đạt trên full Chromium Linux ngày 24-10-2026.
Nó không xác nhận phát hành Chrome Web Store, macOS, Windows hoặc truy cập video công khai.
Phép thử YouTube công khai cùng ngày bị HTTP 429 và yêu cầu xác minh người dùng.
Không có cookie hoặc phiên đăng nhập nào được trích xuất để vượt hạn chế đó.

Kiểm tra bổ sung sau khi tích hợp ôn bài: typecheck toàn repo đạt 60/60 tác vụ và build desktop đạt.
Lệnh nhóm đầy đủ sau đạt 77 test trong 12 file khi hai cờ browser ở trên được bật:

```sh
pnpm exec vitest run --config apps/desktop/vitest.node.config.ts src/main/services/angela/internet src/renderer/stores/tools/built-in.test.ts scripts/study-extension-artifact.test.ts scripts/media-artifacts.test.ts
```
