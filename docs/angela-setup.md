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
6. Chọn `gemini-3.1-flash-lite`, rồi hoàn tất thiết lập. Danh sách có thể hiển thị ID với tiền tố `models/`; dùng mục Gemini 3.1 Flash Lite.

Nếu đã bỏ qua thiết lập ban đầu, thêm Google Gemini trong Cài đặt → Nhà cung cấp.
Sau đó chọn Google Gemini và mô hình trong Mô-đun → Ý thức.
Chat Gemini không tự cấu hình các mô-đun Nghe và Giọng nói.

Nếu bước kiểm tra trả về lỗi 404 rằng Gemini 2.5 Flash không còn dành cho người dùng mới,
tắt tùy chọn gửi "ping" đến mô hình đầu tiên rồi thử lại để kiểm tra key và tải danh sách mô hình.
Sau đó chọn Gemini 3.1 Flash Lite. Không dùng nút "Vẫn tiếp tục" để bỏ qua lỗi key không hợp lệ.

Hoàn tất thiết lập sẽ lưu nhà cung cấp và mô hình vào nhân vật đang chọn.
Để đổi lựa chọn sau đó, mở Cài đặt → Module → Ý thức.

Gemini 3.1 Flash-Lite và Gemini 3.8 Flash có free tier với hạn mức theo project.
Nếu gặp lỗi 429, kiểm tra quota trong AI Studio và thử lại theo thời gian Google báo.
Free tier có chính sách sử dụng nội dung để cải thiện sản phẩm. Đọc điều khoản trước khi gửi dữ liệu riêng tư.

Nếu gặp lỗi 503 hoặc chờ phản hồi quá lâu, thử lại sau hoặc đổi mô hình trong Module → Ý thức.
Angela hiển thị hướng dẫn cho lỗi quota và dịch vụ quá tải, giữ lỗi gốc trong "Hiện chi tiết".
Trong lần kiểm tra ngày 13/10/2026, Gemini 3.8 Flash trả lỗi 503 rồi chờ khoảng 180 giây ở lần thử lại.
Gemini 3.1 Flash Lite trả lời cùng loại tin nhắn ngắn trong khoảng 3,4 giây.
Thời gian thực tế phụ thuộc tải dịch vụ, hạn mức và nội dung yêu cầu.

Nguồn: [tạo API key](https://ai.google.dev/gemini-api/docs/api-key),
[giá và free tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite),
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

## Trí nhớ học tập

Angela có thể lưu môn đang học, mục tiêu, chỗ còn vướng và cách giải thích bạn thích.
Ví dụ: "Mình đang học Python, chưa hiểu vòng lặp. Nhớ giúp mình nhé."
Angela chỉ xác nhận đã nhớ sau khi công cụ lưu thành công.

Mở Cài đặt → Module → Trí nhớ dài hạn để xem, thêm, sửa hoặc xóa ghi nhớ.
Ghi nhớ tách theo nhân vật và lưu trên máy, giữ lại sau khi đóng ứng dụng.
Tắt "Bật trí nhớ học tập" để ngừng dùng và tự lưu ghi nhớ trong chat.
Các ghi nhớ đã lưu vẫn còn để bạn xem hoặc xóa.

Mỗi nhân vật có tối đa 50 ghi nhớ, mỗi ghi nhớ dài tối đa 500 ký tự.
Tối đa 20 ghi nhớ đi cùng yêu cầu gửi nhà cung cấp AI, ưu tiên ghi nhớ đến hạn ôn rồi đến ghi nhớ cập nhật gần nhất.
Không lưu API key, mật khẩu hoặc thông tin nhạy cảm vào ghi nhớ.
Hãy sửa hoặc xóa nếu Angela nhớ sai. Chưa có đồng bộ ghi nhớ qua tài khoản hoặc thiết bị khác.

### Tiến độ và ôn tập

Trong mỗi ghi nhớ, chọn "Lịch ôn tập": mỗi ngày, 3, 7, 14 hoặc 30 ngày.
Lịch mới bắt đầu với trạng thái "Đến hạn ôn tập" để bạn ôn lần đầu.
Chọn "Đánh dấu đã ôn" để tăng số lần ôn và đặt lần tiếp theo theo chu kỳ đã chọn.
Phần tổng hợp cho biết số ghi nhớ đã ôn trong các mục có lịch và số mục đang đến hạn.
Số lần ôn ghi nhận hoạt động của bạn, không đánh giá mức độ hiểu bài.

Khi bạn muốn học, Angela dùng các mục đến hạn trong ngữ cảnh để gợi ý bài ôn ngắn.
Bạn có thể nói "Mình đã ôn vòng lặp rồi" để Angela ghi nhận lần ôn bằng công cụ `review_learning`.
Angela chỉ ghi nhận sau khi bạn xác nhận đã ôn. Một lời giải thích của Angela không tự đánh dấu hoàn thành.
Lịch ôn được đặt trong cài đặt, chưa đặt bằng chat. Chưa có thông báo nền khi ứng dụng đóng.

Chọn "Không lên lịch ôn" để xóa lịch và số lần ôn của ghi nhớ đó, giữ nội dung ghi nhớ.
Đổi chu kỳ giữ số lần ôn và tính hạn mới từ lần ôn gần nhất.
Sửa nội dung ghi nhớ giữ lịch và tiến độ. Tắt trí nhớ học tập ngừng gửi lịch và cung cấp công cụ ôn trong chat.
Lịch và tiến độ lưu trên máy, tách theo nhân vật và đồng bộ giữa các cửa sổ ứng dụng.

## Tương tác laptop

Bản desktop đã tích hợp AUV qua công cụ `computer_use` và `computer_use_read_image`.
Kiểm tra binary đi kèm trước khi giao tác vụ trên laptop:

```bash
mise exec -- pnpm -F @proj-airi/stage-tamagotchi exec auv --help
```

Binary AUV đi kèm có thể thiếu thư viện native trên một số bản Linux.
Trên Arch Linux, bản `0.0.28` yêu cầu `liblept.so.5`, còn hệ thống dùng `libleptonica.so.6`.
Nếu gặp lỗi này, build AUV với thư viện của máy:

```bash
mise exec -- pnpm -F @proj-airi/stage-tamagotchi setup:computer-use
mise exec -- pnpm dev:tamagotchi
```

Chạy từ thư mục gốc repository. Cần Rust và [thư viện phát triển của AUV](https://github.com/moeru-ai/auv/tree/v0.0.28#install-with-cargo).
Script lấy phiên bản từ package AUV đã cài, build source cùng tag và giữ lockfile của upstream.
Build dùng chế độ debug và một tiến trình biên dịch để giảm tải cho laptop.
Binary nằm trong `.cache/auv/<phiên-bản>/bin/`, ngoài Git.

Nếu build báo thiếu trường `data` hoặc `size` của `spa_pod_builder`, kiểm tra phiên bản Clang.
Bindgen trong AUV `0.0.28` gặp [lỗi với LLVM 22 trở lên](https://github.com/rust-lang/rust-bindgen/issues/3264).
Dùng libclang tương thích trong môi trường Python riêng:

```bash
python3 -m venv .cache/auv-build-tools
.cache/auv-build-tools/bin/python -m pip install libclang==18.1.1
AUV_LIBCLANG_PATH="$(.cache/auv-build-tools/bin/python -c 'from clang import cindex; print(cindex.Config.library_path)')"
LIBCLANG_PATH="$AUV_LIBCLANG_PATH" BINDGEN_EXTRA_CLANG_ARGS="-resource-dir=$(clang -print-resource-dir)" mise exec -- pnpm -F @proj-airi/stage-tamagotchi setup:computer-use
```

Các công cụ này nằm trong cache, không thay Clang của hệ thống hoặc dependency ứng dụng.
Chỉ bước build cần biến môi trường trên. Ứng dụng dùng binary đã build khi khởi động.
Khi upstream cập nhật Bindgen tương thích, bỏ bộ công cụ riêng và build lại.

Bản phát triển tự chọn binary này. Bản đóng gói tiếp tục dùng binary đi kèm.
`AUV_BINARY_PATH` vẫn chọn binary riêng và có ưu tiên cao nhất. Giá trị phải là đường dẫn tuyệt đối.
Nếu chưa build cục bộ, bản phát triển dùng binary đi kèm.

Với phiên bản hiện tại, kiểm tra khả năng native bằng:

```bash
./.cache/auv/0.0.28/bin/auv --version
./.cache/auv/0.0.28/bin/auv doctor --json
```

Để kiểm tra CLI thật qua daemon riêng, chạy:

```bash
AUV_BINARY_PATH="$PWD/.cache/auv/0.0.28/bin/auv" AIRI_COMPUTER_USE_LIVE=1 mise exec -- pnpm exec vitest run --config apps/stage-tamagotchi/vitest.node.config.ts apps/stage-tamagotchi/src/main/services/airi/computer-use/runtime.test.ts
```

Kiểm thử gọi trợ giúp và một tham số sai. Kiểm thử không đưa chuột hoặc bàn phím vào ứng dụng.
Angela giữ chi tiết lỗi native trong phản hồi công cụ.
Tên công cụ xuất hiện trong chat không chứng minh thao tác desktop hoạt động.

Sau khi AUV chạy được, kiểm tra quan sát cửa sổ và ảnh màn hình trước.
Khả năng đưa chuột/bàn phím vào ứng dụng còn phụ thuộc quyền và hỗ trợ của phiên Wayland.

### Kết quả kiểm tra trên máy phát triển

Ngày 16/10/2026, trên Arch Linux/Niri Wayland:

| Kiểm tra | Kết quả |
| --- | --- |
| Build AUV `0.0.28` với libclang riêng | Thành công, liên kết `libleptonica.so.6` của hệ thống |
| CLI qua daemon riêng | Thành công, giữ nguyên chi tiết lỗi lệnh |
| Đăng ký định danh Portal bằng `auv doctor --portal-setup` | Thành công, không cấp quyền chuột/bàn phím |
| Liệt kê display | Thành công |
| Chụp display | Có ảnh desktop thật 2560 × 1440 qua Portal Screenshot |
| Screencast | Timeout, AUV dùng Screenshot dự phòng |
| Liệt kê cửa sổ qua AT-SPI | Trả danh sách rỗng, chưa xác minh được cửa sổ |
| Nhập chữ qua Portal | Thất bại trước khi gửi phím, không có ký tự nào được nhập |
| Nhập chữ qua uinput với quyền tạm thời | Thành công, ô nhập nhận đúng `angela-test-1610` |

Log Portal báo thiếu interface `org.freedesktop.impl.portal.RemoteDesktop` ở backend được chọn.
Interface xuất hiện ở Portal frontend không chứng minh backend điều khiển đang hoạt động.
[Niri chưa hỗ trợ RemoteDesktop](https://github.com/niri-wm/niri/issues/390).
AUV có sẵn backend `uinput`, không cần thêm công cụ điều khiển khác.
Kiểm thử đã đối chiếu nội dung ô nhập trong cửa sổ Electron riêng.
Chưa kiểm chứng thao tác chuột hoặc nhập tiếng Việt qua backend này.

### Chạy với uinput trên Linux

Chế độ này cần quyền đọc/ghi `/dev/uinput` cho tài khoản chạy Angela.
Sau khi đồng ý cấp quyền tạm thời, chạy:

```bash
pkexec setfacl -m "u:$(id -u):rw" /dev/uinput
mise exec -- pnpm -F @proj-airi/stage-tamagotchi dev:uinput
```

Nếu đã build desktop, dùng `start:uinput` thay cho `dev:uinput`.
Nếu môi trường đặt `ELECTRON_RUN_AS_NODE=1`, bỏ biến đó trước khi chạy Electron.
Các lệnh khởi động không tự nâng quyền hoặc sửa quyền thiết bị.
Quyền này cho phép gửi sự kiện vào ứng dụng đang có focus.
Khi kiểm thử xong, thu hồi quyền:

```bash
pkexec setfacl -x "u:$(id -u)" /dev/uinput
```

Không có thay đổi group hoặc quy tắc udev vĩnh viễn.

## Dữ liệu và cập nhật

Tên hiển thị Angela không đổi thư mục dữ liệu hiện có của Electron.
Bản đóng gói dùng hồ sơ `AIRI`, bản phát triển dùng `@proj-airi/stage-tamagotchi`.
`APP_USER_DATA_PATH` vẫn chọn được hồ sơ riêng, gồm dữ liệu ứng dụng và phiên Chromium.

Nguồn cập nhật đã trỏ đến repository Angela. Repository hiện private và updater chưa có cơ chế xác thực cho release private.
Bản chạy từ mã nguồn không kiểm tra release khi mở. Cập nhật bản này qua Git rồi build lại.
`UPDATE_SERVER_URL` vẫn bật updater trong chế độ phát triển để thử máy chủ cập nhật riêng.
Bản đóng gói chưa cập nhật được từ release private. Cần nguồn phát hành truy cập được trước khi dùng tính năng này.
