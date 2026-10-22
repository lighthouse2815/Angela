# Angela

Angela là người bạn AI để trò chuyện tự nhiên bằng tiếng Việt, đồng hành, hỗ trợ học tập và giúp xử lý các công việc hằng ngày.

## Chạy dự án

Dùng Node.js và pnpm theo phiên bản trong `.tool-versions`.

```bash
pnpm install
pnpm dev:tamagotchi
```

Giai đoạn hiện tại ưu tiên desktop/local AI. Các module tạm hoãn nằm trong
[`../dev-in-future/`](../dev-in-future/README.md) và không tham gia workspace mặc định.
Thư mục này nằm ngoài Git repository hiện tại và chỉ được lưu local.
API và shared contract còn ở `server/` vì desktop vẫn sử dụng kiểu dữ liệu của chúng.

Bản web:

```bash
pnpm dev:web
```

## Bản CLI

CLI hỗ trợ chat streaming, công cụ terminal qua MCP, memory dài hạn, task/reminder và lưu/tiếp tục phiên.
Sau khi cài dependencies, build CLI cùng các package cần thiết:

```bash
pnpm build:cli
```

Chọn provider trực tiếp và model trong phần cài đặt của desktop hoặc web local, rồi chạy:

```bash
pnpm cli
pnpm cli --computer-use
pnpm cli --list-sessions
pnpm cli --resume ID_PHIEN
```

CLI hỏi xác nhận trước khi gọi công cụ. Model không được tự phê duyệt thao tác.
Xem [hướng dẫn CLI](./packages/angela-cli/README.md) để cấu hình provider, MCP và thư mục lưu phiên.

## Cấu hình dùng chung trên máy

Desktop, web chạy bằng Vite trên localhost và CLI dùng chung `~/.config/angela/config.json`.
File lưu provider, API key và model chat. Provider trực tiếp không yêu cầu đăng nhập tài khoản Angela.
Lần mở đầu, ứng dụng nhập các provider trực tiếp đã lưu trong trình duyệt vào file chung.
Thay đổi trong cài đặt được lưu tự động. Các cửa sổ đang mở đọc lại file sau khoảng 1,5 giây.
CLI đọc file khi bắt đầu phiên.

Đặt `ANGELA_CONFIG` trước khi chạy ứng dụng để dùng file khác. CLI còn hỗ trợ `--config`.
Thứ tự ưu tiên của CLI: tham số dòng lệnh → biến môi trường → file chung.
Các biến `ANGELA_MODEL`, `ANGELA_BASE_URL` và `ANGELA_API_KEY` vẫn dùng được để ghi đè cho từng lần chạy.
File chứa key nằm ngoài repository. Không đưa file này lên Git.
Cấu hình bản hosted và đồng bộ qua tài khoản nằm ngoài phạm vi hiện tại.

## AI và giọng nói

Để bắt đầu với free tier, thêm Google Gemini và nhập API key từ Google AI Studio.
Trong mô-đun Ý thức, chọn Google Gemini và model phù hợp để bắt đầu trò chuyện.
Free tier có hạn mức. Xem [thiết lập Gemini](./docs/angela-setup.md#google-gemini) trước khi dùng.
Không ghi API key vào mã nguồn hoặc gửi key trong cuộc trò chuyện.

Nếu dùng OpenAI có trả phí, có thể cấu hình riêng model cho chat, vision, nhận dạng giọng nói và phát giọng nói trong phần cài đặt.
Các lựa chọn khác vẫn có sẵn. Một API key hợp lệ và quyền dùng model là cần thiết để gọi API.

## Tương tác laptop

Bản desktop có công cụ quan sát màn hình và tương tác ứng dụng.
Khả năng thực tế phụ thuộc vào hệ điều hành, thư viện native và quyền của phiên desktop.
Xem [thiết lập và kiểm tra](./docs/angela-setup.md) trước khi dùng công cụ.

## Kiến trúc hiện tại

Runtime chung điều phối CLI, Telegram và các adapter khác. Memory V2 ghi observation, tổng hợp episodic/semantic/procedural memory và đưa dữ liệu trở lại Recall để xây context.

Các tài liệu kiến trúc và audit nằm trong [`docs/ai`](./docs/ai/).

## Repository

https://github.com/lighthouse2815/Angela

Xem [LICENSE](./LICENSE) và [ghi nhận nguồn gốc, giấy phép bên thứ ba](./THIRD_PARTY_NOTICES.md).
