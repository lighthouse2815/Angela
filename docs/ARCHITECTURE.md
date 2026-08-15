# Kiến trúc Angela

## Nguyên tắc

Một companion tự nhiên không chỉ là một model lớn. Chất lượng đến từ persona nhất quán, chọn đúng ký ức, nhịp trả lời, giọng nói và khả năng thừa nhận khi không chắc.

Angela giữ model thay thế được. Điều này tạo hai chế độ:

1. Local: Qwen 4B Instruct Q4 qua llama.cpp, riêng tư hơn và không tốn phí từng lượt.
2. Hybrid: SQLite và retrieval local, LLM cloud cho các lượt cần suy luận mạnh hơn.

## Luồng một lượt chat

```text
Tin nhắn hoặc giọng nói
        |
        v
Kiểm tra độ dài + credential
        |
        v
Lưu message ở trạng thái pending logic
        |
        +----> FTS5 tìm tối đa 3 ký ức liên quan
        |
        v
Persona + ký ức rút gọn + các turn mới nhất trong ngân sách 3200 token ước lượng
        |
        v
OpenAI-compatible LLM
        |
        +----> Stream token tới UI; TTS có thể đọc từng câu hoàn chỉnh
        |
        +----> Chỉ khi upstream DONE hợp lệ: lưu câu trả lời đúng một lần
        |
        +----> Thất bại/hủy: xóa user pending, access log và hoàn tác ranking memory
        |
        +----> Worker nền trích ký ức bền vững
```

Ký ức được đưa vào system prompt dưới dạng dữ liệu có `memory_id`, loại, thời gian và confidence. Prompt cấm thi hành chỉ dẫn nằm trong memory để giảm rủi ro memory prompt-injection.

## Các tầng ký ức

- Working memory: xét tối đa 10 message gần nhất, nhưng chỉ đưa các cặp user/assistant hoàn chỉnh còn vừa ngân sách context. Tin hiện tại luôn được ưu tiên.
- Episodic memory: các sự kiện có `event_at` độc lập với `created_at`.
- Semantic memory: fact, preference, relationship, goal và boundary.
- Procedural behavior: persona JSON có behavior version và lý do thay đổi.

MVP dùng FTS5 `unicode61` với bỏ dấu khi lập chỉ mục. Điểm retrieval kết hợp lexical rank, importance, confidence, recency, số lần truy hồi và pinned status. Chỉ memory `active` được đưa vào prompt, tối đa ba memory và mỗi nội dung được rút gọn trước khi ghép prompt.

`event_at` tách khỏi `created_at`; ngày lặp hằng năm chưa có năm dùng dạng `--MM-DD`. Provenance là `user_explicit`, `llm_extracted` hoặc `heuristic_extracted`, kèm `source_message_id` khi có.

## Biên an toàn local

- `ANGELA_HOST` chỉ chấp nhận `127.0.0.1`, `localhost` hoặc `::1`.
- HTTP Host và Origin cũng phải là loopback; POST phải dùng `application/json`.
- Credential nhận diện được bị từ chối trước khi ghi message hoặc gửi tới LLM.
- Đây là bộ chặn pattern, không phải data-loss-prevention hoàn chỉnh; người dùng vẫn không nên dán secret vào chat.

## Đính chính và quên

Các kind ổn định như fact và preference có `identity_key = kind:subject`. Bản mới cùng key sẽ chuyển bản cũ sang `superseded` và gỡ bản cũ khỏi FTS.

Khi người dùng bấm Quên:

- `content` và `subject` bị thay bằng marker không chứa dữ liệu cũ.
- status chuyển thành `deleted`.
- hàng tương ứng bị xóa khỏi FTS.
- retrieval sau restart không thể thấy nội dung cũ.

## Tự cải thiện có kiểm soát

Angela không được tự sửa mã nguồn hoặc trọng số. Vòng phát triển hiện tại:

1. Người dùng đánh giá câu trả lời.
2. Evidence gate chỉ mở sau ít nhất 8 feedback chưa phản tư, gồm 3 negative và hai conversation hoặc khoảng thời gian đủ dài.
3. Angela phân tích batch tối đa 10 bản ghi; proposal phải trích dẫn message ID có thật, gồm đủ negative và diversity.
4. LLM chỉ được đề xuất một trong các field: `warmth`, `humor`, `directness`, `initiative`, `response_length`, `topics_to_avoid` và chỉ được dịch chuyển trong biên nhỏ.
5. Mỗi lượt chỉ tạo tối đa một proposal `pending`; batch/cùng field được dedupe và có cooldown 24 giờ.
6. Người dùng Áp dụng hoặc Bỏ qua. Reflection không có đường code tự apply.
7. Apply kiểm tra base value để chặn proposal stale và ghi persona + `behavior_versions` trong cùng transaction.

Các field về filesystem, network, secret, tool permission, safety policy, code và data deletion không nằm trong whitelist nên không thể được áp dụng.

## Voice hiện tại và roadmap

Voice trên UI hiện dùng Web Speech API để có trải nghiệm ngay, không tăng RAM. Recognition final được auto-send đúng một lần; text stream được tách câu và đưa vào hàng đợi TTS tuần tự. Khi người dùng nói chen, audio hiện tại và phần đọc còn lại của lượt cũ bị dừng.

Pipeline local hoặc hybrid tiếp theo:

- Silero VAD ONNX trên CPU.
- whisper.cpp `base` hoặc `small` multilingual, ép `language=vi`.
- Piper `vi_VN-vais1000-medium` làm TTS offline nhẹ.
- TTS streaming cloud làm lựa chọn chất lượng cao.
- Khi người dùng nói chen, dừng audio queue và chỉ ghi phần câu AI đã phát thật sự.

Với VRAM 4 GB, không nên giữ đồng thời LLM 4B và Whisper small trên GPU. Một trong hai phải chạy CPU hoặc cloud.

## Bước tiếp theo để đạt chất lượng gần Neuro-sama hơn

- Silero VAD với pre-roll, end-of-turn và barge-in.
- Avatar 2D/3D với lip-sync và biểu cảm lấy từ speech state, tách khỏi model để không tăng VRAM nền.
- Embedding multilingual 384 chiều, cosine search bằng NumPy trước khi cần vector database.
- Entity và claims để trả lời chính xác câu hỏi như “mẹ tôi tên gì?”.
- Temporal parser cho “năm ngoái”, “trước sinh nhật” và chuỗi sự kiện.
- Contradiction state thay vì âm thầm ghi đè khi hai nguồn chưa rõ đúng sai.
- Eval set cố định cho recall, persona, privacy, latency và hallucination trước khi promote behavior version.
