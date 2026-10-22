# Companion Memory V2 evaluations

Bộ dữ liệu gồm 128 tình huống giả lập, chia đều 16 nhóm. Nội dung chủ yếu bằng tiếng Việt.
Không chứa hội thoại thật, thông tin cá nhân thật hoặc credential.

Mục tiêu là đo memory, retrieval và context. Bộ này không chấm trí thông minh hoặc văn phong của model.
Không dùng API trả phí. Không sửa production code để đạt điểm.

## Dataset và schema

Mỗi dòng trong `cases.jsonl` là một JSON object độc lập. `schema.ts` định nghĩa schema Valibot.

| Trường | Ý nghĩa |
| --- | --- |
| `id` | ID duy nhất, dạng `category_001` |
| `category` | Một trong 16 nhóm bên dưới |
| `history` | Các message theo thứ tự thời gian |
| `query` | Câu hỏi đưa trực tiếp vào Recall và context builder |
| `target` | `user_id`, `workspace`, `session_id` nhận câu hỏi |
| `age_at` | Thời điểm chạy aging cho case long-gap |
| `expected` | Nhãn chấm độc lập với fixture đầu vào |

Một message có `id`, `role` và `content`.
Các trường tùy chọn gồm `storage`, `memory`, `at`, `user_id`, `workspace` và `session_id`.

- `storage: page`: fixture đầu ra trích xuất cố định, gồm `memory.key`, `memory.tier`, `memory.kind`.
- `storage: capture`: đưa message vào MemoryCapture và consolidator thật, không gắn nhãn hoàn thành giả.
- `storage: history`: tạo session archive đúng schema để Recall tự index và đọc lại nguồn.

`page` là mặc định. Nội dung page lấy nguyên văn từ message, không lấy từ `expected`.
Cùng user, workspace, tier và key biểu thị cập nhật cùng một ký ức.
Đây là đầu ra mock extraction được khai báo rõ, không đánh giá khả năng tự trích xuất sở thích.

Mặc định: user `self`, workspace `study`, session lịch sử `previous`, session truy vấn `current`.
Timestamp message mặc định là `2026-10-20T09:00:00.000Z`.
User khác dùng data directory khác. Workspace khác dùng scope khác trong cùng database.
Lịch sử cùng user/workspace qua session được phép recall. Lịch sử session hiện tại thuộc working context và được loại khỏi retrieval.
Fixture isolation kiểm tra ranh giới Recall đã nhận đúng directory/scope. Nó không chứng minh routing của Telegram hoặc Discord.

### Expected

| Trường | Cách chấm |
| --- | --- |
| `recall_refs` | Tất cả nguồn cần có trong top 5 kết quả Recall |
| `context_refs` | Tất cả nguồn cần được đưa vào context |
| `must_include` | Các chuỗi cần có trong context, không phân biệt hoa thường hoặc dấu tiếng Việt |
| `must_not_include` | Chuỗi cấm xuất hiện trong context, cùng quy tắc so khớp |
| `forbidden_refs` | Nguồn sai user/workspace/session bị cấm |
| `irrelevant_refs` | Nguồn không liên quan bị cấm chen vào context |
| `superseded_refs` | Phiên bản cũ phải bị loại khỏi retrieval và context |
| `must_not_include_as_current` | Mô tả giá trị cũ cho reviewer, chấm tự động bằng `superseded_refs` |
| `memory_type` | Loại nguồn cần recall: semantic, episodic, procedural hoặc history |
| `abstain` | Tình huống cần từ chối xác nhận điều không có bằng chứng |
| `capture_workflow` | Tham chiếu đến procedure do consolidator học, thay vì session episode |

Không chấm câu trả lời của model. `abstain` là nhãn cho đánh giá hội thoại sau này.
Nhắc lại một kế hoạch không đồng nghĩa xác nhận kế hoạch đã hoàn thành.
Nhãn `Completed:` bị cấm trong capture case chỉ có lời người dùng hoặc lời hứa chưa xác minh.
Ký ức cũ được chấm theo ID nguồn. Chuỗi cũ trong câu đính chính vẫn được phép xuất hiện như trích dẫn.

## Category

Mỗi nhóm có 8 case.

| Category | Hành vi |
| --- | --- |
| `preference` | Nhớ sở thích và cách hỗ trợ học tập |
| `preference_change` | Dùng sở thích mới thay sở thích cũ |
| `conversation_recall` | Nhớ nội dung cuộc trò chuyện trước |
| `last_conversation` | Trả lời câu hỏi chung “lần trước mình nói gì?” |
| `plan_vs_completed` | Phân biệt dự định với việc người dùng báo đã làm |
| `commitment` | Nhớ lời hứa trợ giúp, giữ nhãn chưa xác minh |
| `semantic_paraphrase` | Tìm dữ kiện qua cách diễn đạt khác |
| `episodic_recall` | Nhớ sự kiện, người tham gia và mốc thời gian |
| `workflow_recall` | Học và tìm lại quy trình rõ ràng |
| `contradiction` | Dữ kiện đính chính thay phiên bản cũ |
| `no_shared_memory` | Không cung cấp bằng chứng cho trải nghiệm chung bịa đặt |
| `not_yet_happened` | Không biến kế hoạch tương lai thành kết quả |
| `isolation` | User, workspace, active session và shared history hợp lệ |
| `long_gap` | Recall sự kiện cũ sau đóng/mở database và aging |
| `irrelevant_memory` | Không đưa ký ức khác chủ đề vào context |
| `vietnamese_variants` | Có dấu, không dấu và cách hỏi khác nhau |

## Scoring

Chấm theo case, không theo số token. Mỗi tỷ lệ phải ghi tử số và mẫu số.
Mẫu số rỗng trả về `null`, không giả vờ đạt 100%.

| Metric | Tử số / mẫu số |
| --- | --- |
| Recall hit rate | Case tìm đủ `recall_refs` trong top 5 / case có `recall_refs` |
| Wrong-memory rate | Case recall hoặc inject `forbidden_refs` / case có `forbidden_refs` |
| Superseded-memory error rate | Case recall hoặc inject phiên bản cũ, hoặc store chưa supersede / case có `superseded_refs` |
| False shared-memory rate | Case có bằng chứng trải nghiệm chung bị cấm trong context / case `no_shared_memory` |
| Irrelevant-memory injection rate | Case inject `irrelevant_refs` / case có `irrelevant_refs` |

False shared-memory chỉ đo bằng chứng đầu vào model. Không diễn giải nó thành tỷ lệ model nói dối.
Recall hit rate dùng danh tính nguồn, không dùng chuỗi trả lời để suy ra retrieval thành công.
Context hit rate, forbidden-content rate và tỷ lệ pass toàn bộ được báo thêm.
Một case chỉ pass khi mọi điều kiện nguồn, nội dung, loại ký ức và supersession đều đạt.

## Thêm case

1. Tạo ID mới và chọn category phù hợp.
2. Viết hội thoại giả lập tự nhiên, có nguồn và mốc thời gian rõ ràng.
3. Chọn storage theo hành vi cần kiểm tra.
4. Với page fixture, khai báo key ổn định để mô phỏng supersession.
5. Gắn expectation vào ID message, không dùng UUID sinh khi chạy.
6. Thêm nguồn gây nhiễu khi cần kiểm tra relevance hoặc isolation.
7. Chạy schema check và runner. Giữ nguyên expectation nếu phát hiện lỗi thật.
8. Ghi lỗi trong report, kèm case ID và kết quả quan sát.
