# Angela

Angela là người bạn AI để trò chuyện tự nhiên bằng tiếng Việt, đồng hành và giúp bạn học khi cần.
Dự án phát triển từ AIRI và giữ các tính năng, ứng dụng, game, plugin và tích hợp hiện có.

## Chạy dự án

Dùng Node.js và pnpm theo phiên bản trong `.tool-versions`.

```bash
pnpm install
pnpm dev:tamagotchi
```

Bản web:

```bash
pnpm dev:web
```

## AI và giọng nói

Trong cài đặt nhà cung cấp, thêm OpenAI và nhập API key của bạn.
Không ghi API key vào mã nguồn hoặc gửi key trong cuộc trò chuyện.

- Chat và vision: OpenAI, mô hình `gpt-5.4-mini`.
- Nhận dạng giọng nói: OpenAI Audio Transcription, mô hình `gpt-4o-mini-transcribe`.
- Phát giọng nói AI: OpenAI Audio Speech, mô hình `gpt-4o-mini-tts`, giọng `coral`.

Chọn các nhà cung cấp này trong mô-đun Ý thức, Thị giác, Nghe và Giọng nói.
Các lựa chọn khác vẫn có sẵn. Một API key hợp lệ và quyền dùng mô hình là cần thiết để gọi API.

## Tương tác laptop

Bản desktop có công cụ quan sát màn hình và tương tác ứng dụng.
Khả năng thực tế phụ thuộc vào hệ điều hành, thư viện native và quyền của phiên desktop.
Xem [thiết lập và kiểm tra](./docs/angela-setup.md) trước khi dùng công cụ.

## Nguồn mã

Angela dựa trên [AIRI](https://github.com/moeru-ai/airi).
Giữ nguyên [LICENSE](./LICENSE) và ghi nhận tác giả của nền mã gốc.
[Tài liệu AIRI gốc](./docs/AIRI_README.md) mô tả các tính năng được giữ lại.

Repository của Angela: https://github.com/lighthouse2815/Angela
