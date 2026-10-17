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
Lệnh này cũng build lại ứng dụng trước khi mở.
Nếu đã build, mở trực tiếp bằng:

```bash
mise exec -- pnpm -F @proj-airi/stage-tamagotchi run start --skipBuild
```

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
Bạn có thể đặt lịch bằng chat: "Cứ 3 ngày nhắc mình ôn vòng lặp Python."
Angela dùng công cụ `schedule_learning_review` để đặt lịch cho ghi nhớ của nhân vật trong cuộc trò chuyện.
Nếu chưa có ghi nhớ, Angela cần lưu mục tiêu học tập bạn vừa nêu trước khi đặt lịch.
Hỗ trợ chu kỳ 1, 3, 7, 14 hoặc 30 ngày. Chưa hỗ trợ giờ cụ thể hoặc chu kỳ khác.
Lịch mới đặt qua chat bắt đầu sau một chu kỳ, không tự ghi nhận đã ôn.
Đặt lại cùng chu kỳ giữ ngày đến hạn và tiến độ hiện tại.
Gửi "Bỏ lịch ôn Python" để xóa lịch, giữ nội dung ghi nhớ.
Chỉ xác nhận đặt hoặc bỏ lịch sau khi công cụ trả về thành công.
Chưa có thông báo nền khi ứng dụng đóng.

### Thông báo nhắc ôn trên desktop

Trong Trí nhớ dài hạn, bật "Bật thông báo nhắc ôn trên desktop".
Tùy chọn mặc định tắt và không tự bật khi đặt lịch qua chat.
Angela kiểm tra lịch của nhân vật đang chọn mỗi phút khi ứng dụng đang chạy.
Nếu có nhiều mục đến hạn, Angela gộp chúng trong một thông báo.
Thông báo chỉ hiện số mục đến hạn, không chứa nội dung ghi nhớ.
Nhấn thông báo để mở chat và hỏi "Mình cần ôn gì?".

Mỗi lần đến hạn được nhắc một lần. Trạng thái đã gửi lưu trên máy.
Mở lại ứng dụng hoặc mở thêm cửa sổ không gửi lại thông báo đã ghi nhận cho cùng lần đến hạn.
Thông báo không tự đánh dấu đã ôn hoặc tăng số lần ôn.
Khi bạn xác nhận đã ôn, lịch mới được tính theo chu kỳ đã chọn.
Nếu hệ điều hành không nhận thông báo, lần kiểm tra sau có thể thử lại.
Kiểm tra cài đặt thông báo của hệ điều hành nếu không thấy nhắc ôn.
Tắt thông báo hoặc trí nhớ học tập để ngừng nhắc. Lịch và tiến độ vẫn được giữ.

Kiểm tra ngày 16/10/2026 trên Niri Wayland đã xác nhận thông báo native và giữ trạng thái đã gửi sau khi tải lại cửa sổ.
Gemini 3.1 Flash Lite đã chạy luồng đọc tài liệu mẫu, lưu ghi chú có nguồn và đặt lịch ôn 3 ngày.
Hủy lịch qua chat giữ lại ghi nhớ và không tăng số lần ôn.
Kiểm thử dùng thư mục chọn cố định trong hồ sơ riêng. Nội dung đọc và ghi chú được đối chiếu với tệp thật.

Chọn "Không lên lịch ôn" để xóa lịch và số lần ôn của ghi nhớ đó, giữ nội dung ghi nhớ.
Đổi chu kỳ giữ số lần ôn và tính hạn mới từ lần ôn gần nhất.
Sửa nội dung ghi nhớ giữ lịch và tiến độ. Tắt trí nhớ học tập ngừng gửi lịch và cung cấp công cụ ôn trong chat.
Lịch và tiến độ lưu trên máy, tách theo nhân vật và đồng bộ giữa các cửa sổ ứng dụng.

## Đọc tài liệu và lưu ghi chú

Bản desktop có công cụ đọc tài liệu trong một thư mục bạn chọn.
Tính năng này dùng cùng tùy chọn **Use computer** trong ô chat.
Để bắt đầu:

1. Chọn mô hình chat có hỗ trợ gọi công cụ.
2. Bật **Use computer**.
3. Gửi: "Chọn thư mục học Python, đọc tài liệu và giải thích vòng lặp cho mình."
4. Chọn thư mục trong hộp thoại hệ thống.
5. Gửi: "Lưu phần cần ôn vào ghi chú Markdown, kèm đường dẫn tài liệu nguồn."

Angela liệt kê thư mục con và đọc tệp `.md`, `.markdown`, `.txt` có mã hóa UTF-8, tối đa 256 KiB.
Angela cũng đọc PDF có lớp văn bản, tối đa 10 MiB và 1.000 trang.
Bạn có thể yêu cầu: "Đọc trang 3 đến trang 8 của bài giảng PDF và giải thích cho mình."
Mỗi lượt đọc PDF tối đa 20 trang và 256 KiB văn bản trích xuất. Mặc định đọc 10 trang đầu.
Angela cần đọc tiếp các khoảng trang trước khi tóm tắt toàn bộ tài liệu dài.
Số trang nguồn tính từ trang đầu của tệp PDF, bắt đầu ở 1, có thể khác số trang in trên tài liệu.
Angela cũng đọc Word `.docx`, gồm nội dung chính, tiêu đề chuẩn và văn bản trong bảng.
DOCX tối đa 10 MiB nén, 20 MiB giải nén và 1.000 mục trong gói tệp.
Kết quả chia thành các đoạn có số thứ tự và tiêu đề gần nhất, tối đa 256 KiB dữ liệu đoạn và 10.000 đoạn.
Số đoạn tính theo thứ tự trích xuất nội dung không rỗng, không phải số trang hoặc số thứ tự danh sách trong Word.
Header, footer, chú thích, ghi chú cuối tài liệu và chữ trong ảnh không thuộc phần nội dung DOCX được đọc.
Tài liệu cần mật khẩu, Word `.doc` cũ và ảnh chưa được hỗ trợ. PDF scan cần OCR, hiện chưa được hỗ trợ.
Tệp ẩn, đường dẫn ra ngoài thư mục và liên kết tượng trưng bị từ chối.
Nội dung tài liệu được gửi đến nhà cung cấp AI đang chọn khi công cụ đọc được gọi.

Bạn có thể hỏi: "Tìm phần giải thích vòng lặp trong thư mục học Python giúp mình."
Angela tìm cụm từ trong PDF, DOCX, Markdown và TXT, gồm các thư mục con được cấp quyền.
Kết quả có đường dẫn, số trang PDF, số đoạn DOCX hoặc dòng văn bản, kèm đoạn trích tối đa 600 ký tự.
Kết quả DOCX có thêm tiêu đề gần nhất nếu tài liệu dùng kiểu tiêu đề chuẩn.
Tìm kiếm không phân biệt hoa/thường và chấp nhận khoảng trắng xuống dòng. Dấu tiếng Việt vẫn cần khớp.
Mỗi tệp văn bản, trang PDF hoặc đoạn DOCX trả về tối đa một đoạn trích. Tìm kiếm DOCX không nối cụm từ qua hai đoạn riêng biệt.
Khi tìm kiếm, kết quả gửi đến nhà cung cấp AI gồm đường dẫn, đoạn trích và trạng thái quét.
Mỗi lượt tối đa 20 kết quả, 50 tài liệu, 100 trang PDF, 500 đoạn DOCX và 2 MiB văn bản được tìm.
Nếu chạm giới hạn hoặc có tệp không đọc được, Angela cần kiểm tra phần còn lại trước khi kết luận không có nội dung.
PDF và DOCX dài có thể tìm tiếp từ trang hoặc đoạn được trả về. Thư mục quá lớn cần thu hẹp phạm vi tìm kiếm.
Angela cần đọc tài liệu hoặc trang tìm được trước khi giải thích đầy đủ hoặc lưu ghi chú có trích dẫn nguồn.

Ghi chú nằm trong thư mục con `Angela Notes`. Mỗi ghi chú tối đa 128 KiB.
Công cụ chỉ tạo tệp `.md` mới, không ghi đè tài liệu hoặc ghi chú đã có.
Khi lưu tóm tắt, Angela có thể đính kèm nguồn đã đọc, số trang PDF hoặc số đoạn DOCX vào ghi chú.
Nguồn DOCX tự kèm tiêu đề đã đọc gần nhất nếu có. Liên kết mở tệp gốc; vị trí đoạn được ghi trong nhãn nguồn.
Công cụ tạo liên kết tới tài liệu gốc, kèm vị trí trang của PDF. Một số ứng dụng đọc PDF không hỗ trợ mở đúng trang từ liên kết.
Nguồn chỉ được chấp nhận nếu tài liệu hoặc trang đó đã được đọc trong phiên chọn thư mục hiện tại.
Phần nguồn cũng tính vào giới hạn 128 KiB của ghi chú.
Nếu tên đã tồn tại, yêu cầu Angela chọn tên mới.

Quyền thư mục dùng chung giữa các cửa sổ desktop trong phiên hiện tại.
Khi đóng Angela, bạn cần chọn lại thư mục ở phiên sau.
Gửi "Bỏ quyền thư mục học hiện tại" để gọi thao tác `clear`.
Tắt **Use computer** để ngừng cung cấp công cụ tài liệu cho yêu cầu tiếp theo.
Ghi chú đã lưu vẫn còn trên ổ đĩa.

Các công cụ gồm `study_workspace_directory`, `study_workspace_list`, `study_workspace_read`, `study_workspace_search` và `study_workspace_save_note`.
Chúng hoạt động độc lập với AUV và không cần quyền `/dev/uinput`.
Trí nhớ và lịch ôn vẫn dùng mô-đun Trí nhớ dài hạn đã có.

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
Ngày 16/10/2026, bài thử cửa sổ riêng đã xác minh thêm hai click thật, nhập ASCII và dán đúng câu tiếng Việt.
Bài thử đọc lại nội dung ô nhập và kiểm tra sự kiện đến từ hệ điều hành.
Đây là kiểm chứng bộ thực thi, chưa chứng minh mô hình tự điều khiển được mọi ứng dụng.

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

### Nhập tiếng Việt và kiểm thử desktop

Khi cần nhập tiếng Việt, Angela có công cụ `computer_use_paste_text` trong **Use computer**.
Cần đưa focus vào đúng ô nhập trước khi gọi công cụ.
Trên Niri chạy uinput, công cụ dùng `wl-copy` và `wl-paste` để truy cập clipboard hệ thống, rồi gửi Ctrl+V qua AUV.
Cần cài gói [wl-clipboard](https://github.com/bugaevc/wl-clipboard). Máy phát triển hiện đã có hai lệnh này.
Văn bản đi qua stdin, không xuất hiện trong tham số tiến trình.
Các desktop Linux uinput khác tiếp tục dùng adapter clipboard Electron.
Cách này không cần Portal RemoteDesktop. Backend khác tiếp tục dùng lệnh dán gốc của AUV.
Công cụ chỉ nhận tối đa 16.384 ký tự mỗi lần.

Công cụ từ chối nếu clipboard có ảnh, HTML hoặc định dạng riêng để tránh làm mất dữ liệu.
Khi clipboard chỉ có văn bản, công cụ khôi phục nội dung cũ sau thao tác dán.
Nếu bạn copy nội dung mới trong lúc dán, công cụ giữ nội dung mới.
Kết quả gửi phím thành công chưa chứng minh ô nhập nhận đúng chữ. Angela cần kiểm tra giao diện sau thao tác.

Sau khi cấp quyền uinput tạm thời như trên, chạy từ thư mục gốc repository:

```bash
AUV_BINARY_PATH="$PWD/.cache/auv/0.0.28/bin/auv" AUV_LINUX_INPUT_BACKEND=uinput mise exec -- pnpm -F @proj-airi/stage-tamagotchi smoke:computer-use-input
```

Bài thử cần phiên Wayland đang mở khóa và đúng một màn hình.
Nếu có `ELECTRON_RUN_AS_NODE=1`, bỏ biến này trước khi chạy.
Cửa sổ thử nghiệm chạy toàn màn hình với hồ sơ tạm riêng, không dùng tài khoản hoặc tài liệu của bạn.
Bài thử click nút, click ô nhập, nhập ASCII rồi dán câu tiếng Việt và đối chiếu nội dung thực tế.
Bài thử giữ clipboard văn bản/HTML ban đầu ngoài thao tác dán và khôi phục sau kiểm tra.
Định dạng clipboard khác bị từ chối. Không chuyển focus hoặc copy nội dung trong lúc bài thử chạy.
Kết quả và ảnh cửa sổ thử nằm trong `.cache`. Có thể đổi thư mục bằng `SMOKE_REPORT_DIR`.
Không cần mô hình AI hoặc API key cho bài thử này.
Thu hồi quyền uinput tạm thời sau khi kiểm thử xong.

### Chọn đúng cửa sổ trên Niri

Trên Linux Niri, Angela có công cụ `computer_use_windows` trong **Use computer**.
Công cụ liệt kê cửa sổ và đưa focus đến đúng ID vừa tìm được.
Có thể lọc theo một phần tiêu đề để không gửi danh sách cửa sổ không liên quan đến mô hình.
Mỗi kết quả liệt kê có tối đa 200 cửa sổ phù hợp.

Sau khi chọn cửa sổ, Angela truyền `windowId` vào các lệnh nhập và công cụ dán tiếng Việt.
Công cụ `computer_use_press_key` nhận trực tiếp phím hoặc tổ hợp như `ctrl+1`, `ctrl+a`, `ctrl+s`.
Mô hình không cần tự ghép lệnh CLI cho thao tác nhấn phím.
Nếu cửa sổ khác đang có focus, lệnh bị từ chối trước khi gửi phím.
Trạng thái focus được đọc lại sau khi daemon khởi động để tránh dùng kết quả cũ.
Lệnh dán cũng kiểm tra focus trước khi thay clipboard.
Nếu không truyền `windowId`, công cụ vẫn hoạt động trên cửa sổ hiện có focus như trước.
ID Niri khác ID accessibility của AUV. Không dùng ID Niri cho tham số AUV `--target`.
Backend chọn cửa sổ này chỉ dành cho Niri. Các desktop khác tiếp tục dùng công cụ AUV hiện có.

Để kiểm chứng với mô hình thật, cần cấu hình mô hình chat hỗ trợ công cụ và build desktop trước.
Bài thử dùng hồ sơ tạm từ cấu hình local hiện có, hai cửa sổ VS Code và hai tệp tạm.
Mô hình phải tự chọn cửa sổ đích, nhập tiếng Việt và lưu tệp. Tệp còn lại phải giữ nguyên.
Bộ kiểm thử giới hạn lệnh vào hai cửa sổ tạm, rồi gọi bộ thực thi thật của ứng dụng.
Không mở terminal hoặc chỉnh tài liệu trong workspace hiện tại.

Sau khi cấp quyền uinput tạm thời, chạy từ thư mục gốc repository:

```bash
AUV_BINARY_PATH="$PWD/.cache/auv/0.0.28/bin/auv" AUV_LINUX_INPUT_BACKEND=uinput mise exec -- pnpm exec tsx apps/stage-tamagotchi/scripts/computer-use-model-smoke.ts
```

Mặc định dùng VS Code tại `/usr/share/code/code`. Đổi bằng `SMOKE_CODE_BINARY` nếu cài ở nơi khác.
Có thể chọn hồ sơ cấu hình khác qua `SMOKE_SOURCE_PROFILE`, hoặc thư mục kết quả qua `SMOKE_REPORT_DIR`.
Bài thử cần clipboard trống hoặc chỉ có văn bản. Clipboard có định dạng khác được giữ nguyên và bài thử dừng.
Có thể bật `SMOKE_DIAGNOSTICS=1` để ghi lệnh và trạng thái trình soạn thảo trong thư mục kết quả.
Bài thử không chứng minh khả năng nhận diện giao diện bằng hình ảnh hoặc hỗ trợ mọi ứng dụng.
Thu hồi quyền uinput tạm thời sau khi kiểm thử xong.

Kiểm tra ngày 16/10/2026 trên Niri với Gemini 3.1 Flash Lite đã chạy thành công luồng chọn cửa sổ VS Code và lưu tiếng Việt.
Nội dung tệp trên đĩa khớp yêu cầu. Tệp ở cửa sổ còn lại giữ nguyên.
Các lệnh nhập đều dùng ID cửa sổ đích. Clipboard hệ thống trở về trạng thái ban đầu sau thao tác dán.
Kiểm thử dùng thư mục và hồ sơ riêng, không chỉnh workspace đang mở của người dùng.

## Dữ liệu và cập nhật

Tên hiển thị Angela không đổi thư mục dữ liệu hiện có của Electron.
Bản đóng gói dùng hồ sơ `AIRI`, bản phát triển dùng `@proj-airi/stage-tamagotchi`.
`APP_USER_DATA_PATH` vẫn chọn được hồ sơ riêng, gồm dữ liệu ứng dụng và phiên Chromium.

Nguồn cập nhật đã trỏ đến repository Angela. Repository hiện private và updater chưa có cơ chế xác thực cho release private.
Bản chạy từ mã nguồn không kiểm tra release khi mở. Cập nhật bản này qua Git rồi build lại.
`UPDATE_SERVER_URL` vẫn bật updater trong chế độ phát triển để thử máy chủ cập nhật riêng.
Bản đóng gói chưa cập nhật được từ release private. Cần nguồn phát hành truy cập được trước khi dùng tính năng này.
