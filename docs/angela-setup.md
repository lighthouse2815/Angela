# Thiết lập Angela

## Chạy ứng dụng

Nếu dùng mise, chạy `mise exec -- pnpm dev:tamagotchi` từ thư mục dự án.
Lệnh này dùng pnpm được ghim trong `.tool-versions`.
Bản web chạy bằng `mise exec -- pnpm dev:web`.

Nếu muốn dùng API trước và tải mô hình nhận diện từ gọi sau, chạy:

```bash
SHERPAW_BUNDLE_KWS=false mise exec -- pnpm dev:tamagotchi
```

Build cùng cấu hình bằng:

```bash
NODE_OPTIONS=--max-old-space-size=4096 SHERPAW_BUNDLE_KWS=false mise exec -- pnpm -F @proj-airi/stage-tamagotchi build
```

Mô hình từ gọi vẫn có trong ứng dụng và tải vào thư mục dữ liệu khi dùng lần đầu.
Nếu tải thất bại, ứng dụng báo lỗi và cho phép thử lại. Chat và giọng nói qua API không cần mô hình này.
Bỏ `SHERPAW_BUNDLE_KWS` để tiếp tục đóng gói mô hình từ gọi như mặc định.
Tài nguyên avatar và binary Electron vẫn cần tải trước hoặc có sẵn trong cache.

Sau khi build xong, mở bản desktop bằng:

```bash
mise exec -- pnpm -F @proj-airi/stage-tamagotchi start
```

Lệnh `start` tự cài binary Electron nếu chưa có. Lần tải đầu cần kết nối tới GitHub.
Nếu Wayland gặp lỗi hiển thị, thử script `start:xwayland` của cùng package.

## Google Gemini

Angela đã tích hợp Google Gemini. Không cần thêm thư viện hoặc sửa code để dùng chat Gemini.

1. Mở [Google AI Studio](https://aistudio.google.com/apikey) và tạo API key trong project Free Tier.
2. Trong Angela, chọn Google Gemini ở bước thiết lập nhà cung cấp.
3. Nhập key trực tiếp vào ô API Key. Không gửi key vào chat hoặc lưu trong source.
4. Giữ Base URL là `https://generativelanguage.googleapis.com/v1beta/openai/`.
5. Chọn Tiếp để kiểm tra cấu hình và tải danh sách mô hình.
6. Chọn `gemini-3.8-flash`, rồi hoàn tất thiết lập. Danh sách có thể hiển thị ID với tiền tố `models/`; dùng mục Gemini 3.8 Flash.

Nếu đã bỏ qua thiết lập ban đầu, thêm Google Gemini trong Cài đặt → Nhà cung cấp.
Sau đó chọn Google Gemini và mô hình trong Mô-đun → Ý thức.
Chat Gemini không tự cấu hình các mô-đun Nghe và Giọng nói.

Nếu bước kiểm tra trả về lỗi 404 rằng Gemini 2.5 Flash không còn dành cho người dùng mới,
tắt tùy chọn gửi "ping" đến mô hình đầu tiên rồi thử lại để kiểm tra key và tải danh sách mô hình.
Sau đó chọn Gemini 3.8 Flash. Không dùng nút "Vẫn tiếp tục" để bỏ qua lỗi key không hợp lệ.

Nếu chat báo "No chat provider or model configured for this character" sau thiết lập ban đầu,
mở Cài đặt → Module → Ý thức, chọn lại mô hình để lưu lựa chọn vào nhân vật Angela.
Nếu mục đó đang được chọn, chọn tạm mô hình khác rồi chọn lại Gemini 3.8 Flash.

Gemini 3.8 Flash có free tier với hạn mức theo project.
Nếu gặp lỗi 429, kiểm tra quota trong AI Studio và thử lại theo thời gian Google báo.
Free tier có chính sách sử dụng nội dung để cải thiện sản phẩm. Đọc điều khoản trước khi gửi dữ liệu riêng tư.

Nguồn: [tạo API key](https://ai.google.dev/gemini-api/docs/api-key),
[giá và free tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash),
[hạn mức](https://ai.google.dev/gemini-api/docs/rate-limits).

## OpenAI (tùy chọn có trả phí)

Mở Cài đặt → Nhà cung cấp, thêm OpenAI và nhập API key trong ứng dụng.
Sau đó chọn mô hình trong các mô-đun tương ứng.

| Mô-đun | Nhà cung cấp | Mô hình |
| --- | --- | --- |
| Ý thức: chat và gọi công cụ | OpenAI (`openai`) | `gpt-5.4-mini` |
| Thị giác: đọc hình ảnh | OpenAI (`vision-openai`) | `gpt-5.4-mini` |
| Nghe: chuyển giọng nói thành văn bản | OpenAI Audio Transcription (`openai-audio-transcription`) | `gpt-4o-mini-transcribe` |
| Giọng nói: phát giọng nói AI | OpenAI Audio Speech (`openai-audio-speech`) | `gpt-4o-mini-tts` |

Trong Giọng nói, chọn giọng `coral` để bắt đầu. Bạn có thể đổi giọng trong danh sách của nhà cung cấp.
Các nhà cung cấp chat, vision, nghe và giọng nói lưu cấu hình riêng. Nhập key vào từng nhà cung cấp bạn sử dụng.
API có tính phí. Quyền truy cập mô hình phụ thuộc tài khoản OpenAI của bạn.

Nguồn: [GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
[nhận dạng giọng nói](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe),
[phát giọng nói](https://developers.openai.com/api/docs/guides/text-to-speech).

## Nhân vật

Nhân vật mặc định của bản cài mới là Angela.
Các thẻ nhân vật bạn đã tạo hoặc chỉnh sửa vẫn được giữ.
Nếu đã có dữ liệu AIRI, bạn có thể tạo một thẻ Angela trong cài đặt nhân vật.

## Tương tác laptop

Bản desktop đã tích hợp AUV qua công cụ `computer_use` và `computer_use_read_image`.
Kiểm tra chương trình native trước khi giao tác vụ trên laptop:

```bash
pnpm -F @proj-airi/stage-tamagotchi exec auv --help
```

Trên máy Arch Linux/Wayland hiện tại, bản AUV `0.0.28` cần `liblept.so.5`.
Máy hiện có `libleptonica.so.6` và chương trình chưa khởi động được.
Cần bản thư viện tương thích hoặc bản AUV được biên dịch cho hệ thống này.
Không coi công cụ desktop là hoạt động chỉ vì ứng dụng liệt kê được tên công cụ.

Nếu đã có Rust và các thư viện phát triển, biên dịch AUV đúng phiên bản SDK đang dùng:

```bash
cargo install --git https://github.com/moeru-ai/auv --tag v0.0.28 auv-cli --bin auv --locked --root "$PWD/.cache/auv"
"$PWD/.cache/auv/bin/auv" --version
"$PWD/.cache/auv/bin/auv" doctor
AUV_BINARY_PATH="$PWD/.cache/auv/bin/auv" mise exec -- pnpm dev:tamagotchi
```

Chạy các lệnh từ thư mục dự án. Xem [yêu cầu build AUV](https://github.com/moeru-ai/auv/tree/v0.0.28#install-with-cargo).
`AUV_BINARY_PATH` phải là đường dẫn tuyệt đối. Bỏ biến này để dùng bản AUV đi kèm.
Angela giữ chi tiết lỗi khởi động native trong phản hồi công cụ để bạn thấy thư viện đang thiếu.
Phiên kiểm tra hiện tại không tải được source vì mạng terminal bị chặn, nên bản build riêng chưa được xác minh.

Sau khi AUV chạy được, kiểm tra quan sát cửa sổ và ảnh màn hình trước.
Khả năng đưa chuột/bàn phím vào ứng dụng còn phụ thuộc quyền và hỗ trợ của phiên Wayland.

## Dữ liệu và cập nhật

Tên hiển thị Angela không đổi thư mục dữ liệu hiện có của Electron.
Bản đóng gói dùng hồ sơ `AIRI`, bản phát triển dùng `@proj-airi/stage-tamagotchi`.
`APP_USER_DATA_PATH` vẫn chọn được hồ sơ riêng, gồm dữ liệu ứng dụng và phiên Chromium.

Nguồn cập nhật đã trỏ đến repository Angela. Repository hiện private và updater chưa có cơ chế xác thực cho release private.
Bản chạy từ mã nguồn không kiểm tra release khi mở. Cập nhật bản này qua Git rồi build lại.
`UPDATE_SERVER_URL` vẫn bật updater trong chế độ phát triển để thử máy chủ cập nhật riêng.
Bản đóng gói chưa cập nhật được từ release private. Cần nguồn phát hành truy cập được trước khi dùng tính năng này.
