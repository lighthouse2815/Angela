# Angela

Angela là một AI companion nhẹ, local-first, có ký ức dài hạn và cơ chế tự cải thiện có kiểm soát. Dự án được tối ưu trước tiên cho máy Windows hiện tại: RAM 8 GB, GTX 1650 4 GB và CPU i7-10750H.

Mục tiêu không phải giả vờ rằng một model nhỏ tự có ý thức hoặc tự viết lại chính mình. Angela tách riêng bốn phần:

- Bộ não LLM có thể đổi giữa local và cloud.
- Lịch sử ngắn hạn chỉ giữ vài lượt gần nhất.
- Ký ức dài hạn nằm trong SQLite, có truy hồi, nguồn gốc, độ tin cậy, ngày sự kiện và thao tác quên.
- Phát triển hành vi thông qua proposal có phiên bản. Người dùng phải duyệt trước khi áp dụng.

## Chạy lần đầu

Trong PowerShell tại `T:\Angela`:

```powershell
.\scripts\setup-model.ps1
.\scripts\start.ps1
```

Script đầu tải:

- `llama.cpp` bản Vulkan chính thức cho Windows, khoảng 33 MB.
- `Qwen3-4B-Instruct-2507 Q4_K_M` từ registry Ollama, khoảng 2,5 GB và được kiểm SHA256.

Ở cấu hình mặc định, script thứ hai khởi động model ở nền và mở Angela tại `http://127.0.0.1:8765`.

Nếu cần xem log của model:

```powershell
.\scripts\start-model.ps1
```

Nếu đã có Ollama, LM Studio hoặc một API OpenAI-compatible khác, không cần chạy `setup-model.ps1`. Sao chép `.env.example` thành `.env`, đổi cấu hình rồi chạy `start.ps1`:

```dotenv
ANGELA_LLM_BASE_URL=http://127.0.0.1:11434/v1
ANGELA_LLM_MODEL=qwen3:4b-instruct-2507-q4_K_M
ANGELA_LLM_API_KEY=
```

`start.ps1` ưu tiên biến môi trường của process, sau đó đọc `.env`. Script chỉ kiểm tra và tự khởi động llama.cpp đi kèm khi endpoint là mặc định `http://127.0.0.1:8080/v1`; với endpoint khác, dịch vụ đó phải được khởi động hoặc truy cập được riêng.

Với cloud API, lịch sử và cơ sở dữ liệu vẫn ở máy, nhưng tin nhắn hiện tại, lịch sử ngắn hạn và ký ức được truy hồi làm context sẽ được gửi tới LLM. Chỉ dùng endpoint bạn tin tưởng; nên giữ chế độ local-only cho hội thoại nhạy cảm.

## Điều đã hoạt động

- Web chat responsive, không cần npm install hoặc framework nặng.
- Text chat streaming qua bất kỳ endpoint OpenAI-compatible nào; token xuất hiện ngay trong UI, còn assistant message chỉ được lưu khi upstream hoàn tất hợp lệ.
- SQLite WAL lưu conversation, message, feedback và memory sau restart.
- FTS5 truy hồi ký ức phù hợp thay vì nhét toàn bộ lịch sử vào context.
- Ngân sách context bảo thủ giữ prompt trong giới hạn 4096 token của model local; lịch sử cũ được bỏ theo từng cặp user/assistant hoàn chỉnh.
- Fact hoặc preference cùng subject sẽ supersede bản cũ khi người dùng đính chính.
- Tách `event_at` khỏi ngày ghi nhớ để không nhầm ngày kể và ngày xảy ra.
- Ký ức ghi trực tiếp mang nguồn `user_explicit`; ký ức tự trích xuất mang nguồn `llm_extracted`, hoặc `heuristic_extracted` khi LLM trích xuất lỗi, và giữ `source_message_id` để truy về tin nhắn gốc.
- Nút Quên xóa nội dung khỏi memory hoạt động và chỉ mục FTS.
- Credential nhận diện được như password, OTP, cookie, token và API key bị chặn trước khi lưu message và trước khi gọi LLM; câu “không cần nhớ” vẫn được trò chuyện nhưng không vào ký ức dài hạn.
- Feedback Hợp ý hoặc Chưa ổn có thể kèm lý do và làm bằng chứng cho hộp phản tư.
- Angela chỉ tự phản tư khi có ít nhất 8 feedback chưa xử lý, gồm 3 phản hồi Chưa ổn và đủ độ đa dạng. Mỗi lượt chỉ tạo tối đa một proposal, có cooldown 24 giờ và trích dẫn message ID thật.
- Proposal chỉ được đổi một whitelist nhỏ của persona; Angela không bao giờ tự áp dụng, người dùng phải bấm Áp dụng.
- Voice qua Web Speech API tự gửi khi nghe xong, đọc từng câu ngay trong lúc text còn stream, cho phép dừng âm thanh để nói chen và có nút dừng response riêng.
- HTTP server chỉ cho phép bind, Host và Origin loopback; MVP không mở API ra LAN.

## Giới hạn trung thực

- Qwen 4B local đủ tốt để trò chuyện thường ngày nhưng không thông minh bằng model cloud lớn. Kiến trúc cho phép đổi endpoint mà không mất ký ức.
- Voice trình duyệt có thể dùng dịch vụ mạng của nhà cung cấp browser, nên chưa phải pipeline speech local hoàn toàn. Chất giọng và độ chính xác nhận dạng phụ thuộc browser/Windows.
- Bộ chặn credential dựa trên pattern nên không thể bảo đảm nhận ra mọi bí mật. Không dán secret vào bất kỳ chat nào; với cloud endpoint, nội dung chat hợp lệ vẫn rời máy để model xử lý.
- Ký ức MVP dùng lexical retrieval. Bản tiếp theo sẽ thêm embedding multilingual nhỏ, entity, temporal query và contradiction graph.
- “Tự tiến hóa” hiện là persona versioning có duyệt, không online-train trọng số. Máy này không phù hợp để tự huấn luyện model 4B liên tục.

## Kiểm thử

```powershell
.\scripts\run-tests.ps1
```

Bộ test kiểm tra persistence, truy hồi sau nhiễu, đính chính, quên, chặn secret, memory prompt-injection, streaming/rollback, schema SSE, giới hạn quyền và evidence gate của growth proposal, cùng parser voice/NDJSON phía browser.

## Cấu trúc

```text
angela/
  companion.py   điều phối một lượt chat
  memory.py      lưu, supersede, quên và truy hồi ký ức
  extractor.py   trích xuất ký ức ở nền
  growth.py      proposal và behavior version
  llm.py         client OpenAI-compatible nhẹ
  server.py      HTTP server và API không dependency
  static/        giao diện web
data/
  angela.db      dữ liệu local, tạo khi chạy
scripts/
  setup-model.ps1
  start-model.ps1
  start.ps1
  run-tests.ps1
```

Thiết kế chi tiết nằm trong [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
