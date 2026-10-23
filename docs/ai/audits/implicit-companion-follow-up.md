<a id="implicit-companion-follow-up-implementation-audit"></a>

# Kiểm tra việc triển khai theo dõi đồng hành ngầm định

Ngày: 23-10-2026

<a id="1-inspected-main"></a>

## 1. Đã kiểm tra chính

GitHub `main`: `46212a2a54d5951a30a2893f5402589bac9e4c27`. Thanh toán sạch là `airi/` trong thư mục workspace được cung cấp. Quá trình tìm nạp thông qua trình trợ giúp thông tin xác thực GitHub hiện có đã xác nhận đường cơ sở trước khi triển khai.

<a id="2-problems-found"></a>

## 2. Vấn đề được tìm thấy

- Các công cụ tác vụ được ủy quyền chung `create`, `add` và `save` dành cho các đối tượng kỹ thuật.
- Tạo khung meta sau hành động đã thoát khỏi bộ phân loại.
- Các tài liệu tham khảo gần đây đã thu gọn các sự kiện riêng biệt và ưu tiên các nhiệm vụ đang chờ xử lý thay vì tiêu điểm hội thoại mới nhất.
- Không có miền tồn tại độc lập nào cho các chuỗi hội thoại có ý nghĩa chưa được giải quyết.
- Quá trình xem xét đã tìm thấy các cụm danh từ kỹ thuật bổ sung, ranh giới theo lượt của miền không khớp và thời gian diễn ra sự kiện trong các thay đổi về tiết kiệm ánh sáng ban ngày.

Lần chạy hồi quy ban đầu đã tạo ra bảy lỗi trước lần sửa lỗi đầu tiên. Các thử nghiệm xem xét đã tái tạo riêng biệt bốn lỗi đối tượng kỹ thuật và một lỗi tiết kiệm ánh sáng ban ngày trước khi sửa.

<a id="3-architecture-before"></a>

## 3. Kiến trúc trước đây

```text
Explicit user request -> commitment classifier -> local extraction or task tools
                      -> Tasks / MemoryFile -> task-derived ProactiveCandidate
                      -> ProactivePolicy -> ReminderScheduler -> ReminderNotifier
Task events -> CommitmentMemoryProjection -> historical memory and bounded current task context
Recent task references -> pending-first contextual resolver
```

Tính bền vững của tác vụ, lease, tái phát, phục hồi, theo dõi rõ ràng và chiếu bộ nhớ đã tồn tại.

<a id="4-architecture-after"></a>

## 4. Kiến trúc sau

```text
Explicit task request -> existing Task path -----------------------+
                                                                 |
Unresolved current statement -> OpenLoopConversation -> OpenLoops -+-> existing ReminderScheduler
                                             OpenLoopSource ------+   -> shared ProactivePolicy
                                                                      -> CLI / Telegram text
                                                                      -> scoped focus group
                                                                      -> exact resolution or dismissal
```

Bộ lập lịch chấp nhận các phiên bản `ProactiveSource` tùy chọn sau đường dẫn phân phối nhiệm vụ hiện có của nó. Không có bộ lập lịch thứ hai, quét bộ nhớ ngữ nghĩa, phần phụ thuộc mới hoặc phần phụ trợ. Các lược đồ tác vụ, tính bền vững của tác vụ, tác vụ lease, khởi động lại khôi phục và CommitmentMemoryProjection vẫn còn nguyên.

<a id="5-intent-guard"></a>

## 5. Ý định bảo vệ

`classifyCommitmentIntent` vẫn là ranh giới ủy quyền chung cho các công cụ tác vụ và trích xuất. Cơ quan nhiệm vụ tiếng Anh yêu cầu các cụm từ nhiệm vụ ngữ nghĩa. Động từ chung không thể cấp nó. Khung meta được kiểm tra trước và sau hành động. Các công trình kỹ thuật như `Create a task parser` và `Add a reminder timestamp validator` cũng bị loại bỏ. Lời nhắc trực tiếp về việc chạy thử nghiệm trình phân tích cú pháp vẫn có hiệu lực.

<a id="6-focus-resolution"></a>

## 6. Độ phân giải tiêu điểm

Một sự kiện tạo ra một nhóm. Chỉ có nhóm mới nhất tồn tại ở trạng thái tiêu điểm hiện tại. Một nhóm có nhiều danh tính vẫn không rõ ràng ngay cả khi chỉ còn một thành viên đang chờ xử lý. Tiêu điểm mới nhất đã hoàn thành, bị thiếu, hết hạn hoặc quá khổ không bao giờ chọn Nhiệm vụ cũ hơn. Những câu trả lời không liên quan sẽ giữ được sự tập trung. ID đã được xác minh hoặc cụm từ tiêu đề nhiệm vụ hoàn chỉnh có thể thành lập một nhóm mới. Trình xử lý tác vụ và OpenLoop nâng cao tiêu điểm ở cùng một ranh giới yêu cầu. ID được phân chia theo workspace, phiên và kênh, với tám danh tính, tám yêu cầu và giới hạn sáu giờ.

<a id="7-openloop-domain"></a>

## 7. Miền OpenLoop

`OpenLoops` sở hữu danh tính, chủ đề, loại, xuất xứ, vòng đời, độ tin cậy, mức độ nổi bật, thời gian, số lượng prompt, loại bỏ và xác nhận quyền sở hữu. Các loại là vấn đề, công việc đang tiến triển, chờ đợi, sự kiện sắp tới và mục tiêu. Các tiểu bang được mở, giải quyết, hết hạn và bãi bỏ. OpenLoops vẫn tách biệt với Nhiệm vụ và bộ nhớ lịch sử. Các báo cáo mới chưa được giải quyết có thể mở lại tác phẩm đã bị loại bỏ hoặc hết hạn với danh tính mới.

<a id="8-extraction-rules"></a>

## 8. Quy tắc trích xuất

Các quy tắc xác định của Việt Nam chấp nhận công việc chưa được giải quyết hiện tại và các ví dụ cụ thể được cung cấp. Họ bác bỏ các trích dẫn, ví dụ, giả thuyết, tuyên bố không chắc chắn, sự kiện lịch sử, cảm xúc đơn thuần, sở thích và quan sát thông thường. Từ ngữ không được hỗ trợ sẽ không tạo ra vòng lặp liên tục. Các đối tượng sử dụng đẳng thức chuẩn hóa trong workspace. Bí danh xác thực chia sẻ một khóa logic. Đề cập lặp đi lặp lại duy trì giới hạn và thời hạn ban đầu trong khi làm mới hoạt động và độ mặn. Các kết quả được đặt tên sử dụng chuẩn hóa chủ đề. Việc hoàn thành và loại bỏ chung yêu cầu sự tập trung chính xác.

<a id="9-proactive-eligibility"></a>

## 9. Chủ động hội đủ điều kiện

- Độ tin cậy ít nhất là 0,95 và độ nổi bật ít nhất là 0,7.
- Vòng lặp mở, chưa hết hạn, không bị nén và không được nhắc nhở.
- Các vấn đề và công việc chưa hoàn thành sẽ chờ bốn giờ và hết hạn sau 48 giờ.
- Chuỗi chờ chờ 12 giờ và hết hạn sau bảy ngày. Mục tiêu chờ 12 giờ và hết hạn sau 48 giờ.
- Các sự kiện ngày mai phải chờ đến 09:00 sau ngày diễn ra sự kiện cục bộ đầy đủ. Chuyển đổi lịch xử lý các thay đổi tiết kiệm ánh sáng ban ngày.
- Mỗi bản cập nhật thêm bốn giờ không hoạt động. Hoạt động trò chuyện sẽ thêm ít nhất 15 phút trì hoãn.
- Cuộc trò chuyện thường xuyên sẽ thêm thời gian trì hoãn hoạt động thêm một giờ. Các yêu cầu runtime đang hoạt động chặn việc phân phối ngầm.
- Giờ yên tĩnh ngầm định được mặc định là 22:00–08:00. Cấu hình hiện tại có thể thay thế khoảng thời gian đó.
- Một vòng lặp cho phép một lần thử. Một người dùng store cho phép một lần thử ngầm trong tám giờ.

<a id="10-task-suppression"></a>

## 10. Ngăn chặn nhiệm vụ

Nhiệm vụ tương đương đang chờ xử lý sẽ loại bỏ vòng lặp ẩn và ghi lại Nhiệm vụ ID của nó. Người quan sát nhiệm vụ áp dụng biện pháp ngăn chặn sau khi kiên trì. Đối chiếu nguồn sửa chữa lỗi của người quan sát và ghi Tác vụ bên ngoài. Nguồn kiểm tra lại trạng thái Nhiệm vụ mới ngay trước khi trình bày. Các đề cập ngầm sau này không tạo ra vòng lặp khác trong khi Nhiệm vụ tương đương vẫn đang chờ xử lý.

<a id="11-persistence-and-restart-guarantees"></a>

## 11. Đảm bảo tính bền vững và khởi động lại

`open-loops/state.json` riêng tư sử dụng xác thực MemoryFile hiện có, khóa đa quy trình và đổi tên nguyên tử. Yêu cầu trình bày trước hết hạn sau 30 giây và sử dụng hàng rào token. Lỗi trước khi đặt trước, thử lại sau 60 giây. Số lượng prompt một lần bắn và thời gian hồi chiêu toàn cầu cam kết ngay trước khi trình bày bên ngoài. Khởi động lại nhiều lần không thể thiết lập lại chúng hoặc lặp lại nỗ lực ngầm đó. Một sự cố sau khi đặt chỗ có thể làm mất một câu hỏi. Đây là lần gửi tối đa một lần, không phải là lần nhận chính xác một lần trên mạng. Lời nhắc nhiệm vụ giữ lại hợp đồng xác nhận ít nhất một lần hiện có của họ. Bộ nhớ vòng lặp bị hỏng vẫn không bị ảnh hưởng và không thể ngừng phân phối Nhiệm vụ.

<a id="12-privacy"></a>

## 12. Quyền riêng tư

Yêu cầu xuất xứ và các điều khiển cá nhân, tự động hiện có và Recall kiểm soát việc ghi và phân phối ngầm cổng kiểm tra. Điều khiển không có sẵn không đóng được. Đầu ra mô hình không thể cấp sự đồng ý. Các yêu cầu được bảo vệ không tạo ra vòng lặp, dự báo nhiệm vụ hoặc ứng viên chủ động. Thử nghiệm tích hợp quyền riêng tư cũng không kiểm tra các trang bộ nhớ và không quan sát được. Sự kiện toàn cầu chỉ chứa ID, lý do và siêu dữ liệu vòng đời. Trọng tâm không bao giờ vượt qua phiên hoặc kênh khác. Định tuyến thông báo của cùng một người dùng có thể thiết lập tiêu điểm đích chính xác của nó.

<a id="13-exact-changed-files"></a>

## 13. Các tập tin đã thay đổi chính xác

Đường dẫn có liên quan đến thư mục gốc của kho lưu trữ.

```text
docs/ai/adr/2026-10-22-commitment-follow-up.md
docs/ai/adr/2026-10-23-implicit-companion-follow-up.md
docs/ai/audits/implicit-companion-follow-up.md
packages/angela-cli/README.md
packages/angela-cli/src/active-commitments.test.ts
packages/angela-cli/src/active-commitments.ts
packages/angela-cli/src/bin/run.ts
packages/angela-cli/src/commitment-conversation.test.ts
packages/angela-cli/src/commitment-conversation.ts
packages/angela-cli/src/commitment-extraction.test.ts
packages/angela-cli/src/commitment-intent.ts
packages/angela-cli/src/open-loop-conversation.ts
packages/angela-cli/src/open-loop-extraction.test.ts
packages/angela-cli/src/open-loop-extraction.ts
packages/angela-cli/src/open-loop-scenario.test.ts
packages/angela-cli/src/open-loop-source.test.ts
packages/angela-cli/src/open-loop-source.ts
packages/angela-cli/src/open-loops.test.ts
packages/angela-cli/src/open-loops.ts
packages/angela-cli/src/proactive-candidate.ts
packages/angela-cli/src/proactive-policy.ts
packages/angela-cli/src/reminder-notifications.ts
packages/angela-cli/src/reminder-scheduler.ts
packages/angela-cli/src/runtime/context-builder.ts
packages/angela-cli/src/runtime/events.ts
packages/angela-cli/src/runtime/runtime.ts
packages/angela-cli/src/task-tools.test.ts
packages/angela-cli/src/telegram.ts
packages/i18n/src/cli.ts
```

<a id="14-tests"></a>

## 14. Kiểm tra

Đã thêm:

- `open-loop-extraction.test.ts`: các tuyên bố được chấp nhận, kết quả dương tính giả, kết quả, thời gian và tiết kiệm ánh sáng ban ngày.
- `open-loops.test.ts`: giới hạn lâu dài, loại bỏ trùng lặp, mở lại, rào chắn xác nhận quyền sở hữu, lưu giữ, quyền riêng tư, lỗi quan sát và bộ nhớ bị hỏng.
- `open-loop-source.test.ts`: thử lại, trình bày không chắc chắn, kiểm tra tác vụ và quyền riêng tư mới, đầu ra bị tạm dừng, giờ yên tĩnh và giới hạn bùng nổ.
- `open-loop-scenario.test.ts`: luồng runtime hoàn chỉnh, ba lần khởi động lại, mô hình không khả dụng, tập trung chính xác, loại bỏ, loại bỏ, quyền riêng tư và cách ly tác vụ.

Đã cập nhật:

- `active-commitments.test.ts`: nhóm mới nhất, tiêu điểm không hoạt động, ID bị xóa, đề cập tiêu đề và sự mơ hồ hàng loạt.
- `commitment-conversation.test.ts`: ngữ nghĩa sự kiện mới nhất và làm rõ sau khi tiêu điểm không hoạt động.
- `commitment-extraction.test.ts`: cụm từ nhiệm vụ tiếng Anh ngữ nghĩa và khung meta hậu tố.
- `task-tools.test.ts`: hồi quy bỏ qua mô hình trực tiếp cho các yêu cầu kỹ thuật và meta.

Các kịch bản cam kết, bộ lập lịch, lặp lại, quy trình, bộ nhớ và tích hợp hiện có cũng được thông qua trong lần chạy CLI hoàn chỉnh.

<a id="15-exact-validation-results"></a>

## 15. Kết quả xác nhận chính xác

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli test --maxWorkers=2` | PASS. 71 tệp, 716 bài kiểm tra, 75,58 giây. |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli typecheck` | PASS. Thoát 0. |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli build` | PASS. Thoát 0. |
| `pnpm --config.verify-deps-before-run=false -F @angela/i18n typecheck` | PASS. Thoát 0. |
| `pnpm --config.verify-deps-before-run=false -F @angela/i18n build` | PASS. Thoát 0. |
| `pnpm --config.verify-deps-before-run=false lint` | PASS. Thoát 0. Không có lỗi, 603 cảnh báo hiện có bên ngoài các tệp đã thay đổi. |
| `git diff --check` | PASS. |
| `pnpm --config.verify-deps-before-run=false typecheck --concurrency=2` | BLOCKED bằng miếng chêm pnpm đã cài đặt, sau đó là OOM ở dạng `@angela/stage-ui` không thay đổi sau khi thử lại. |

Lần chạy root đầu tiên đã dừng với `Exec format error (os error 8)` vì trình khởi chạy pnpm đã cài đặt không có shebang. Trình bao bọc shell tạm thời bên ngoài kho lưu trữ đã thực hiện kiểm tra gói khởi động Turbo. Lần thử lại đó đã hoàn thành 46 tác vụ trước khi `@angela/stage-ui` sử dụng hết khoảng 2 vùng nhớ GB JavaScript và thoát khỏi 129. Không có cấu hình workspace hoặc nguồn không liên quan nào được thay đổi để che giấu lỗi này.

Git hook đầu tiên cũng kích hoạt xác minh phụ thuộc và gặp lỗi tương tự với trình khởi chạy. Công cụ tìm lỗi mã nguồn và kiểm tra được nhắm mục tiêu được chạy thủ công trước lần xác nhận đầu tiên. Các lần xác nhận sau đó đã chạy tệp đã stage bình thường hook thông qua trình bao bọc tạm thời. Không có sự phụ thuộc hoặc tập tin khóa nào được thay đổi.

<a id="adversarial-review"></a>

## Đánh giá đối nghịch

| Kiểm tra | Bằng chứng |
| --- | --- |
| Động từ chung và cụm danh từ kỹ thuật | Hồi quy công cụ tác vụ từ chối các nỗ lực bỏ qua trực tiếp. |
| Thảo luận meta trước hoặc sau hành động | Kiểm tra công cụ và trích xuất từ chối các ví dụ và thảo luận về mã. |
| phương án dự phòng cũ hơn đang chờ xử lý sau khi tiêu điểm mới nhất không hoạt động | Các bài kiểm tra báo lại của Resolver và runtime sẽ làm rõ mà không cần chỉnh sửa tác phẩm cũ hơn. |
| Thư rác sau khi khởi động lại | Các thử nghiệm khởi động lại lặp đi lặp lại vẫn giữ nguyên giới hạn một lần. |
| Nhiệm vụ cộng với OpenLoop trùng lặp | Việc ngăn chặn runtime và vượt qua các bài kiểm tra Nhiệm vụ trước khi trình bày mới. |
| Rò rỉ tiêu điểm giữa các phiên | Kiểm tra session/channel chính xác và vượt qua độ phân giải runtime phiên không liên quan. |
| Bỏ qua quyền riêng tư | Bộ bảo vệ store và vượt qua bài kiểm tra tích hợp zero-thu nhận dữ liệu. |
| không giới hạn store hoặc bối cảnh | 50 mở, 30 không hoạt động, 8 ID trọng tâm, 8 dấu thời gian hoạt động và 6 tóm tắt ngữ cảnh. |
| Trạng thái suy ra từ bộ nhớ cũ | Chỉ OpenLoops sở hữu vòng đời và trạng thái ứng viên. |
| Cần có mô hình để giao hàng | sinh nội dung ném sau khi tạo. Phân phối và độ phân giải phương án dự phòng vẫn đạt. |
| Sự cố của người quan sát ảnh hưởng đến trạng thái có thẩm quyền | Việc ném trình quan sát siêu dữ liệu không thể từ chối quá trình chuyển đổi miền liên tục. |
| Sự cố trình bày và hết hạn lease | Giới hạn đặt trước ngăn cản việc phát lại. Xác nhận quyền sở hữu token đã hết hạn không thể trình bày. |

<a id="16-remaining-limitations"></a>

## 16. Những hạn chế còn lại

Ngữ pháp bảo thủ và chủ yếu là tiếng Việt. Nó không bao gồm các chủ đề tùy ý hoặc ngày sự kiện tùy ý. Bí danh xác thực có thể kết hợp quá mức các vấn đề riêng biệt. Các môn học khác yêu cầu sự bình đẳng được chuẩn hóa. prompt tiềm ẩn yêu cầu CLI đang chạy hoặc host đồng hành Telegram riêng tư. Dịch vụ desktop độc lập và giọng nói ngầm nằm ngoài sự thay đổi này. Giao hàng tối đa một lần chấp nhận mất mát có thể xảy ra sau khi đặt trước. Lịch sử OpenLoop tách biệt với các lệnh thanh lọc bộ nhớ ngữ nghĩa. Giải quyết hoặc loại bỏ chuỗi tập trung để ngừng nhắc. Root workspace kiểm tra kiểu dữ liệu vẫn chưa hoàn thiện do stage-ui OOM không liên quan.

<a id="17-one-next-milestone"></a>

## 17. Một cột mốc tiếp theo

Đánh giá việc trích xuất và loại trừ đối với kho ngữ liệu hội thoại tiếng Việt đã được đồng ý trước khi mở rộng ngữ pháp.

<a id="commits"></a>

## Cam kết

- `95531c2`: các chỉnh sửa về mục đích và tiêu điểm mới nhất. Đã đẩy tới `origin/main`.
- `488bf93`: nền tảng OpenLoop tiềm ẩn. Đã đẩy tới `origin/main`.
- Quá trình kiểm tra này đi kèm với cam kết sửa lỗi đánh giá cuối cùng, bao gồm các biện pháp bảo vệ đối tượng kỹ thuật, ranh giới rẽ chung và thời gian theo lịch.

<a id="final-hardening-pass"></a>

## Bước làm cứng cuối cùng

Đường cơ sở đã được kiểm tra: `62d250fc45fba1965f6c1696d53e46a5385a8000`. Người đứng đầu thực hiện trước phụ lục kiểm tra này: `774a626a378770c62689e76b5bd3ce5be7040380`. Đầu cuối cùng sau khi tăng cường ủy quyền tiếp theo: `d0e0e59`.

<a id="reproduced-bugs"></a>

### Lỗi sao chép

Ma trận tác vụ đối nghịch đã tái tạo các kết quả mã hóa dương tính giả cho các dịch vụ nhắc nhở, điểm cuối tác vụ, thành phần, kho lưu trữ, bộ điều khiển, các hook, trang, CRUD, DTO, bảng, hàng đợi, vi dịch vụ, API, công việc Quartz và công việc Hangfire.
Regex tích cực hiện có cũng từ chối các đối tượng mã hóa hợp lệ khi chúng nằm trong yêu cầu quản lý tác vụ thực sự.
Thử nghiệm loại bỏ thư mục dữ liệu được chia sẻ đã tạo ra sự loại bỏ chéo workspace khi một Tác vụ không có kiểm tra workspace tương thích.
The generic reminder wording produced `Phần thầy...` for a waiting loop.
Các cụm từ được đặt tên là quên và không hỏi không nhất quán dừng việc phân phối OpenLoop ở phạm vi hiện tại.
Tên `present` trước đó đã che giấu rằng nỗ lực một lần đã được thực hiện trước khi phân phối bộ chuyển đổi.

<a id="final-intent-guard"></a>

### Người bảo vệ ý định cuối cùng

`classifyCommitmentIntent` hiện yêu cầu tải trọng quản lý tác vụ sau khi tạo đối tượng bằng tiếng Anh. Tải trọng phải chứa mục đích rõ ràng (`to ...`), tiêu đề (`: ...`), hoạt động cá nhân hoặc cụm từ thời gian được hỗ trợ. Các danh từ trần `task`, `todo` và `reminder` không thể ủy quyền cho `task_create`. Danh từ kỹ thuật không thể cho phép yêu cầu mã hóa. Nội dung mã hóa vẫn còn hiệu lực sau một cụm từ quản lý rõ ràng. Ví dụ: `Create a task to implement the auth endpoint` vẫn hợp lệ. `Create a task endpoint` vẫn chưa chắc chắn. Trích xuất cục bộ và `taskTools` sử dụng cùng một bộ phân loại và cùng một bộ bảo vệ cứng trực tiếp.

<a id="final-ownership-and-suppression"></a>

### Quyền sở hữu và đàn áp cuối cùng

Task vẫn được quản lý toàn cục theo `dataDir`. `memoryProjection.scope` hiện có do host quản lý cung cấp nguồn gốc workspace khi runtime tạo tác vụ. `OpenLoops.reconcile` chỉ ngăn nhắc lại khi cả chủ đề đã chuẩn hóa và phạm vi chính xác đều khớp. Task từ workspace khác, Task thiếu nguồn gốc và `Task.context` tự do không ngăn nhắc lại. Cách này giữ khả năng ngăn nhắc lặp trong cùng workspace, đồng thời chấp nhận prompt trùng thay vì mất trạng thái giữa các workspace. Phạm vi dự án chuẩn được gán trước khi trích xuất OpenLoop. Các thư mục Git lồng nhau dùng thư mục gốc chuẩn ProjectMemory hiện có. Không thay đổi schema Task, cơ chế giữ quyền xử lý tác vụ hay hợp đồng lập lịch nhắc nhở.

<a id="final-wording"></a>

### Lời cuối cùng

`ReminderNotifications` chọn mẫu đã bản địa hóa từ `OpenLoop.kind`:

- `problem`: `Vụ {subject} lúc trước xử lý tới đâu rồi?` / `How is the {subject} issue from earlier going?`
- `work_in_progress`: `Phần {subject} lúc trước làm tới đâu rồi?` / `How is work on {subject} from earlier going?`
- `waiting`: `{subject} đã phản hồi chưa?` / `Has {subject} responded yet?`
- `goal`: `Phần {subject} bạn định làm đã xong chưa?` / `Have you finished {subject} as planned?`
- `upcoming_event`: `Buổi {subject} hôm trước diễn ra thế nào?` / `How did the {subject} event go?`

Tiền tố hàng đầu dư thừa sẽ bị xóa chỉ để trình bày. Khóa nhận dạng không thay đổi.

<a id="final-forget-and-dismissal-semantics"></a>

### Ngữ nghĩa cuối cùng của việc quên và loại bỏ

Named forms include `Quên vụ auth đi`, `Quên chuyện auth đi`, `Đừng nhớ chuyện auth nữa`, `Đừng hỏi tôi về auth nữa`, `Đừng nhắc chuyện auth nữa`, and `Không cần theo dõi vụ auth nữa`.
Họ chỉ loại bỏ OpenLoop phù hợp trong workspace hiện tại.
Generic forms such as `Quên chuyện đó đi` require one exact current OpenLoop focus. Ambiguity returns clarification.
`Đừng hỏi` leaves personal memory unchanged.
`Quên` or `Đừng nhớ` also calls the existing `Memory.forget` path for one unambiguous matching personal record.
Nhiều bản ghi, bộ nhớ cá nhân bị vô hiệu hóa hoặc lỗi quên lưu trữ sẽ khiến các bản ghi cá nhân không thay đổi và hướng người dùng đến `/memory`.
Việc theo dõi vẫn bị loại bỏ ngay cả khi việc xóa bộ nhớ không thành công.
Các lệnh `/forget` và `/memory` rộng hiện có vẫn giữ nguyên hành vi của riêng chúng. Không có sự xóa bỏ mang tính hủy diệt rộng rãi nào được thêm vào.
Yêu cầu được bảo vệ hoặc meta không mở rộng việc loại bỏ.

<a id="final-delivery-semantics"></a>

### Ngữ nghĩa phân phối cuối cùng

`OpenLoops.present` bây giờ là `OpenLoops.reservePresentation`. Phương thức này thực hiện lần thử một lần trước khi gọi bộ chuyển đổi. Thất bại sau khi đặt trước và trước khi trình bày bên ngoài được xác nhận có thể làm mất quá trình theo dõi. Điều này bao gồm sự cố quy trình, lỗi Telegram API, lỗi ghi thiết bị xuất chuẩn, ngoại lệ bộ điều hợp và lỗi mạng. Những nỗ lực ngầm dành riêng sẽ không được thử lại. Lời nhắc nhiệm vụ vẫn giữ nguyên đảm bảo giao hàng hiện có của họ.

<a id="final-tests"></a>

### bài kiểm tra cuối cùng

Các bài kiểm tra được thêm hoặc mở rộng bao gồm:

- dương tính giả có mục đích mã hóa và đối tượng nhiệm vụ mã hóa hợp lệ thông qua cả trích xuất và `task_create`;
- triệt tiêu cùng workspace, cách ly chéo workspace, không xuất xứ và định tuyến Telegram/shared-user;
- tất cả năm mẫu tiếng Anh và tiếng Việt dành riêng cho từng loại;
- được đặt tên là quên, không hỏi, mơ hồ chung chung, dọn dẹp bộ nhớ cá nhân, lỗi bộ nhớ và hành vi bộ nhớ bị vô hiệu hóa;
- lỗi đặt trước trên các ranh giới thử lại bộ chuyển đổi, mạng, thiết bị xuất chuẩn và kiểu quy trình;
- Thứ tự ngữ cảnh OpenLoop với các vòng lặp mở trước lịch sử không hoạt động.

<a id="final-validation"></a>

### Xác nhận cuối cùng

- `pnpm --config.verify-deps-before-run=false -F @angela/cli test --maxWorkers=2`: **PASS**, 72 tệp, 812 bài kiểm tra trước khi sàng lọc ủy quyền hai dòng cuối cùng.
- `../../node_modules/.bin/vitest run --config vitest.config.ts --maxWorkers=2` từ `packages/angela-cli`: **PASS**, 72 tệp, 814 bài kiểm tra sau lần sàng lọc cuối cùng.
- `pnpm --config.verify-deps-before-run=false -F @angela/cli typecheck`: **PASS** khi chạy sau khi quá trình xây dựng i18n hoàn tất.
- `pnpm --config.verify-deps-before-run=false -F @angela/cli build`: **PASS**.
- `pnpm --config.verify-deps-before-run=false -F @angela/i18n typecheck`: **PASS**.
- `pnpm --config.verify-deps-before-run=false -F @angela/i18n build`: **PASS**.
- `pnpm --config.verify-deps-before-run=false lint`: **PASS**, không có lỗi và cảnh báo kho lưu trữ 603. Không có tệp đã thay đổi nào có chẩn đoán lỗi mã nguồn.
- `git diff --check`: **PASS**.
- Cơ sở hạ tầng có thẩm quyền khác với đường cơ sở đã được kiểm tra: **trống** đối với `tasks.ts`, `task-schema.ts`, `reminder-scheduler.ts`, `recall.ts` và `memory-v2/commitment-projection.ts`.
- Root `typecheck --concurrency=2`: trước đó đã đạt được kiểm tra gói, sau đó dừng lại ở vùng `@angela/stage-ui` JavaScript OOM hiện có. Không có workspace không liên quan nào được thay đổi.

<a id="final-hardening-commits"></a>

### Cam kết làm cứng cuối cùng

- `2c0aa2c`: bảo vệ mục đích quản lý nhiệm vụ tích cực.
- `a3a4e06`: Loại bỏ OpenLoop tương thích với workspace.
- `8395d74`: từ ngữ được bản địa hóa theo loại cụ thể.
- `ef5a119`: quên và không hỏi ngữ nghĩa loại bỏ cộng với việc đặt tên đặt trước.
- `97a0180`: thứ tự ngữ cảnh vòng lặp mở.
- `774a626`: tài liệu cuối cùng và kiểm tra ngữ cảnh có giới hạn.
- `d0e0e59`: chấp nhận các hoạt động cá nhân rõ ràng sau `for` mà không mở lại mã hóa dương tính giả.

Các cam kết này được đẩy lên `origin/main`. Các đường dẫn không được cam kết duy nhất là các đường dẫn đã xóa trước đó của `LICENSE` và `third_party/openseeface/LICENSE`, chưa được tác phẩm này chạm tới.

<a id="closure-decision"></a>

## Quyết định đóng cửa

Cột mốc Vòng lặp đồng hành chủ động là **CLOSED** cho phạm vi này. Các hạn chế còn lại đã được ghi lại: trích xuất xác định thận trọng, chạy CLI hoặc Telegram host để phân phối ngầm và `stage-ui` OOM gốc đã biết.
