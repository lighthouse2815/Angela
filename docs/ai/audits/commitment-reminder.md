<a id="reminder-commitment-and-proactive-companion-audit"></a>

# Nhắc nhở, cam kết và kiểm tra đồng hành chủ động

Đường cơ sở nguồn: GitHub `origin/main` tại `dc2e7f3`, được tìm nạp trước khi triển khai vào ngày 23-10-2026. Nhánh mục tiêu: `main`. Báo cáo này mô tả mã kết quả chứ không phải báo cáo triển khai trước đó.

<a id="1-before"></a>

## 1. Trước

`Tasks` đã sở hữu JSON nguyên tử về tính bền bỉ, chuyển tiếp nhiệm vụ, lặp lại, chống trùng lặp và thông báo lease. `ReminderScheduler` đã gia hạn lease, thử lại các lỗi và khôi phục các lời nhắc quá hạn. `ProactivePolicy` đã kiểm tra số giờ yên tĩnh, thời gian hồi chiêu cho mỗi nhiệm vụ và mức độ ưu tiên. `follow_up` đã tồn tại trong lược đồ tác vụ và công cụ tác vụ. `RuntimeSession.send` phối hợp quyền riêng tư, trích xuất, bối cảnh, công cụ mô hình và bộ nhớ thu nhận dữ liệu. `MemoryCapture` đã viết các trang cam kết hiện tại. `buildContext` đã đối chiếu mọi nhiệm vụ được giữ lại trên mỗi yêu cầu. Điều khiển đàm thoại đã tìm kiếm ở lượt trợ lý cuối cùng. Thông báo CLI đã được nhập vào lịch sử. Việc gửi điện tín thiếu một tài liệu tham khảo bền vững tương đương.

<a id="2-problems-found-in-main"></a>

## 2. Các vấn đề được tìm thấy trong main

- Các công cụ trích xuất cục bộ và mô hình sử dụng các bộ bảo vệ biểu thức chính quy khác nhau. Thảo luận meta và trích dẫn mã vẫn dễ bị tổn thương.
- Ngữ cảnh mô hình tuần tự hóa tất cả các tác vụ đang chờ xử lý, đã hoàn thành và bị hủy theo mọi yêu cầu.
- Mọi yêu cầu thông thường đều so sánh mọi tác vụ với các bản ghi bộ nhớ cam kết.
- Một câu trả lời trợ lý không liên quan đã loại bỏ tham chiếu tác vụ đang hoạt động.
- Loại theo dõi không có trình trích xuất rõ ràng cục bộ, ứng viên mô hình có thể giải thích được hoặc vòng đời prompt được duy trì.
- Tính đủ điều kiện theo dõi ngoại tuyến thiếu thời hạn sử dụng, ngăn chặn bùng nổ và chính sách hoạt động gần đây.
- Sự kiện nhắc nhở đã gửi đã sử dụng thời gian trên tường mặc dù có đồng hồ được đưa vào.
- `8h tối nay` overlapped the calendar and hour matches and incorrectly required clarification.

<a id="3-architecture-after"></a>

## 3. Kiến trúc sau

```text
Conversation
  -> request privacy
  -> shared CommitmentIntent guard
  -> CommitmentConversation / guarded task tools
  -> Tasks -> locked atomic JSON
       -> typed task events
       -> Recall -> CommitmentMemoryProjection -> commitment:<taskId>
       -> ReminderScheduler
            -> ProactiveCandidate (task + occurrence identity)
            -> ProactivePolicy
            -> fenced renewable claim
            -> deterministic notification
            -> atomic delivery acknowledgment and follow-up state
            -> ActiveCommitments (workspace + session + channel)
            -> unrelated conversation
            -> complete / snooze / cancel
            -> task events -> current memory projection
            -> next explicitly scheduled occurrence
```

Lưu trữ tác vụ vẫn có thẩm quyền. Ứng viên xuất phát từ nhiệm vụ và không yêu cầu cơ sở dữ liệu thứ hai. Đăng ký tác vụ hiện có và bus sự kiện runtime vẫn được sử dụng. Không có phần phụ thuộc, phụ trợ, người môi giới, bus sự kiện mới, bản tóm tắt mô hình hoặc hệ thống con agent nào được thêm vào.

<a id="4-exact-changed-files"></a>

## 4. Các tập tin đã thay đổi chính xác

Đường dẫn có liên quan đến thư mục gốc của kho lưu trữ. Danh sách này bao gồm tất cả các cam kết từ đường cơ sở được kiểm tra và quá trình triển khai cuối cùng này.

- `docs/ai/adr/2026-10-22-commitment-follow-up.md`
- `docs/ai/audits/commitment-reminder.md`
- `packages/angela-cli/README.md`
- `packages/angela-cli/src/active-commitments.test.ts`
- `packages/angela-cli/src/active-commitments.ts`
- `packages/angela-cli/src/bin/run.ts`
- `packages/angela-cli/src/commitment-context.ts`
- `packages/angela-cli/src/commitment-conversation.test.ts`
- `packages/angela-cli/src/commitment-conversation.ts`
- `packages/angela-cli/src/commitment-extraction.test.ts`
- `packages/angela-cli/src/commitment-extraction.ts`
- `packages/angela-cli/src/commitment-intent.ts`
- `packages/angela-cli/src/commitment-scenario.test.ts`
- `packages/angela-cli/src/evaluation.ts`
- `packages/angela-cli/src/memory-v2/commitment-projection.test.ts`
- `packages/angela-cli/src/memory-v2/commitment-projection.ts`
- `packages/angela-cli/src/memory-v2/consolidator.ts`
- `packages/angela-cli/src/privacy-policy.ts`
- `packages/angela-cli/src/proactive-candidate.ts`
- `packages/angela-cli/src/proactive-policy.test.ts`
- `packages/angela-cli/src/proactive-policy.ts`
- `packages/angela-cli/src/recall.ts`
- `packages/angela-cli/src/reminder-notifications.ts`
- `packages/angela-cli/src/reminder-scheduler.ts`
- `packages/angela-cli/src/reminder-time.ts`
- `packages/angela-cli/src/reminders.ts`
- `packages/angela-cli/src/runtime/context-builder.test.ts`
- `packages/angela-cli/src/runtime/context-builder.ts`
- `packages/angela-cli/src/runtime/events.ts`
- `packages/angela-cli/src/runtime/privacy-boundary.test.ts`
- `packages/angela-cli/src/runtime/runtime.ts`
- `packages/angela-cli/src/runtime/tool-registry.ts`
- `packages/angela-cli/src/task-cli.ts`
- `packages/angela-cli/src/task-commands.ts`
- `packages/angela-cli/src/task-process.test.ts`
- `packages/angela-cli/src/task-schema.ts`
- `packages/angela-cli/src/task-time.ts`
- `packages/angela-cli/src/task-tools.test.ts`
- `packages/angela-cli/src/task-tools.ts`
- `packages/angela-cli/src/tasks.ts`
- `packages/angela-cli/src/telegram.ts`
- `packages/i18n/src/cli.ts`

<a id="5-intent-protection"></a>

## 5. Bảo vệ ý định

`classifyCommitmentIntent` phân biệt mục đích tạo, theo dõi, meta, giả thuyết, trích dẫn, tiêu cực, không chắc chắn và vắng mặt.
Trích xuất cục bộ và `task_create` sử dụng cùng một kết quả. Ủy quyền công cụ đọc yêu cầu của người dùng do host sở hữu, không bao giờ đọc đối số mô hình.
Thiếu nguồn gốc, thảo luận về trình phân tích cú pháp, ví dụ, trích dẫn, mã, dự đoán, tuyên bố giả định và nhiều hành động sẽ từ chối việc tạo tự động.
Các yêu cầu meta, giả định, trích dẫn và không chắc chắn cũng không thể thay đổi tác vụ hiện có thông qua một công cụ tác vụ khác.
Hủy bỏ tiêu cực rõ ràng vẫn có sẵn. Yêu cầu tránh việc hủy bỏ không thể cho phép hủy bỏ.
Technical subjects containing `test`, `parser`, or `hệ thống` remain valid after a direct imperative.
Các mệnh đề tác vụ trực tiếp riêng biệt có thể sử dụng các công cụ mô hình mà không cần sử dụng các câu lệnh người dùng không liên quan cục bộ.

<a id="6-context-optimization"></a>

## 6. Tối ưu hóa bối cảnh

Trước: mọi tác vụ đang chờ xử lý, đã hoàn thành và bị hủy được giữ lại đều được nhập vào mọi yêu cầu mô hình. Sau: `commitmentContext` chọn các nhóm có giới hạn xác định.

| Nhóm | Tối đa | Lựa chọn |
| --- | ---: | --- |
| Quá hạn | 8 | Đang chờ xử lý và quá hạn |
| Hạn chót hôm nay | 8 | Đang chờ xử lý và chưa quá hạn |
| Sắp tới | 6 | Ngày cục bộ sớm nhất trong tương lai |
| Đột xuất | 5 | Đang chờ xử lý mà không có ngày hoặc báo thức |
| Mới hoàn thành | 3 | Hoàn thành muộn nhất trong vòng bảy ngày |
| Đã hủy | 0 | Công cụ rõ ràng hoặc chỉ truy xuất |

prompt cho biết các nhiệm vụ bị bỏ qua không phải là không có. `task_list` vẫn truy vấn lịch sử được giữ lại. Việc duy trì bộ nhớ hiện tại không thay đổi, bao gồm cả giới hạn lịch sử không hoạt động. Hồi quy ngữ cảnh cung cấp 10 bản ghi đang chờ xử lý, 50 bản ghi đã hoàn thành và 30 bản ghi bị hủy ở ranh giới lưu trữ. Nó kiểm tra sáu bản ghi sắp tới có liên quan, lịch sử bị bỏ qua có thể truy vấn và không có cuộc gọi sửa chữa cam kết đường dẫn yêu cầu nào.

<a id="7-memory-projection"></a>

## 7. Chiếu bộ nhớ

Tác vụ ghi thành công xuất bản các sự kiện đã tạo, cập nhật, hoàn thành, hủy, báo lại và gửi. Recall tải lại tác vụ có thẩm quyền bị ảnh hưởng và chỉ chiếu khóa `commitment:<taskId>` của nó. Ràng buộc tính duy nhất SQL hiện có cho phép một trang hiện tại cho từng phạm vi, cấp và khóa. Các sự kiện giống nhau lặp đi lặp lại sẽ giữ nguyên phiên bản hiện tại. Các chuyển tiếp sẽ thay thế trang hiện tại thay vì sao chép các trang đang hoạt động. MemoryCapture giữ lại các quan sát và tập phim có niên đại. Nó không còn sở hữu các trang cam kết hiện tại.

Khởi động, đối chiếu trong 5 phút và `repairCommitments(true)` sửa chữa các lỗi ghi và trình chiếu bên ngoài. Phạm vi nhiệm vụ thuộc sở hữu của host và siêu dữ liệu phiên nguồn cho phép khôi phục trang ban đầu bị thiếu. Đối số mô hình không thể cung cấp nguồn gốc này. Việc tạo tác vụ bị vô hiệu hóa bộ nhớ không cấp nó. Việc ngăn chặn ngăn cản quá trình phục hồi tạo lại nội dung bị lãng quên. Lỗi trình chiếu khiến nhiệm vụ có thẩm quyền không bị ảnh hưởng. Sửa chữa sau này sẽ cập nhật trang hiện tại của nó. Phép chiếu tuân theo trạng thái tác vụ thực tế ngay cả sau khi đồng hồ được chèn di chuyển lùi.

<a id="8-active-commitment-context"></a>

## 8. Bối cảnh cam kết tích cực

`ActiveCommitments` giữ lại tối đa tám ID nhiệm vụ, nhãn nguồn, dấu thời gian và số lượng yêu cầu có giới hạn. Danh tính tệp riêng tư của nó bao gồm thư mục dữ liệu, workspace, phiên ID và kênh. CLI và Telegram ghi lại phiên đích sau khi trình bày thành công, bao gồm cả bối cảnh runtime lạnh. Nhiệm vụ đã xác minh các thay đổi trạng thái và đề cập của trợ lý hiện tại cũng cập nhật trạng thái tham chiếu của cuộc trò chuyện đó. Không có tiêu đề nhiệm vụ hoặc văn bản hội thoại được bảo vệ nào được đưa vào tệp tham chiếu.

Tài liệu tham khảo hết hạn sau tám yêu cầu hoặc sáu giờ. Các lô quá khổ yêu cầu làm rõ.
Câu trả lời không liên quan sẽ không loại bỏ tham chiếu gần đây.
`Xong rồi`, `2 tiếng nữa nhắc lại`, and `Không cần nhắc cái đó nữa` resolve the recent pending reference.
Một số ứng viên, tài liệu tham khảo đã hết hạn và tài liệu tham khảo vắng mặt tạo ra phản hồi làm rõ hiện có.
Tiêu đề rõ ràng phải phù hợp với mệnh đề lựa chọn. Các từ kiểm soát chung không thể vô tình chọn một nhiệm vụ có cùng tiêu đề.
Các tham chiếu runtime liên tục sử dụng dấu thời gian của riêng chúng. Dấu thời gian phân phối nhiệm vụ của kênh khác không thể khôi phục tham chiếu đã hết hạn.
Đặt lại phiên chỉ xóa các tham chiếu của phiên đó.

<a id="9-proactive-companion"></a>

## 9. Người bạn đồng hành chủ động

Các yêu cầu theo dõi bằng tiếng Việt rõ ràng sử dụng loại nhiệm vụ `follow_up` hiện có. Các yêu cầu được hỗ trợ bao gồm tất cả bốn ví dụ được yêu cầu, cộng với một hoạt động chưa hoàn thành, theo sau là một yêu cầu rõ ràng để hỏi vào ngày mai. Một chủ đề theo ngữ cảnh sử dụng chủ đề người dùng trước đó. Thiếu bối cảnh yêu cầu làm rõ. Cuộc trò chuyện thông thường không bao giờ tự động trở thành ứng viên tiếp theo.

Theo dõi thô sử dụng 09:00 tại cục bộ. Buổi chiều sử dụng 15h. Buổi tối sử dụng 19h. Xác nhận đã lưu sẽ hiển thị thời gian đã chọn. Giờ rõ ràng được ưu tiên. Báo thức nhắc nhở không có giờ vẫn cần làm rõ.

Ứng viên mang danh tính task/occurrence ổn định, lý do có thể truy nguyên, chủ đề, nguồn ID, mức độ ưu tiên, độ tin cậy, mức độ liên quan, thời gian sớm nhất và thời hạn sử dụng. Chính sách kiểm tra mức độ liên quan, mức độ hoàn thành, độ tin cậy, loại bỏ trùng lặp, thời hạn sử dụng, số giờ yên tĩnh, thời gian hồi chiêu và hoạt động gần đây. Độ trễ hoạt động gần đây mặc định là hai phút. Khoảng thời gian theo dõi store được chia sẻ mặc định là ba mươi phút. Mỗi lô chứa tối đa một phần tiếp theo. Các tuyên bố nguyên tử cũng bao gồm các phần tiếp theo riêng biệt trên host đồng thời. lease hoạt động trì hoãn các lượt theo dõi cạnh tranh mà không bận bỏ phiếu.

Trạng thái tác vụ vẫn tồn tại `promptCount`, `lastPromptedAt`, `nextEligibleAt`, `expiresAt` và `resolvedAt`. prompt thành công xác nhận sự xuất hiện của nó. Nó không bao giờ lặp lại ở mỗi lần khởi động. Các lượt theo dõi không được báo trước sẽ hết hạn sau 48 giờ và tiếp tục xảy ra tình trạng bị bỏ qua. Các lượt theo dõi định kỳ đã hết hạn sẽ chuyển sang lần xuất hiện lịch tiếp theo trong tương lai của chúng. Báo lại sẽ mở ra một sự kiện mới trong khi vẫn giữ được danh tính. Hoàn thành và hủy bỏ giải quyết việc theo dõi. Văn bản, giọng nói và từ ngữ desktop sử dụng các mẫu được bản địa hóa xác định. Giao hàng không yêu cầu mô hình. `proactive.prompted` tiết lộ danh tính và lý do của ứng viên thông qua các sự kiện chỉ có siêu dữ liệu.

<a id="10-restart-guarantees"></a>

## 10. Đảm bảo khởi động lại

Việc tạo tác vụ, xác nhận sự cố, xác nhận, báo lại và giải quyết vẫn tồn tại khi khởi động lại bình thường. Việc theo dõi đúng hạn sẽ được phục hồi một lần khi có liên quan. Khởi động lại nhiều lần không lặp lại prompt đã được xác nhận. Công việc hết hạn bị bỏ qua. Một số lượt theo dõi bị bỏ lỡ không thể tạo ra đợt khởi động đột ngột. Lỗi thông báo không làm tăng số lượng prompt. Thời gian chờ hiện tại và thời hạn lease vẫn giữ được khả năng thử lại. Hàng rào gia hạn và token ngăn chủ sở hữu cũ thừa nhận các sự kiện đã thay đổi. Trạng thái tham chiếu cũng tồn tại khi khởi động lại dưới danh tính cuộc trò chuyện chính xác.

Sự cố sau khi trình bày bên ngoài và trước khi xác nhận có thể lặp lại thông báo bên ngoài. Bản trình bày bên ngoài chính xác một lần yêu cầu đích thông báo bình thường. Động cơ cục bộ duy trì khả năng phục hồi ít nhất một lần.

<a id="11-tests"></a>

## 11. Kiểm tra

Các tập tin mới:

- `active-commitments.test.ts`: khởi động lại, cách ly workspace/session/channel, TTL, hồi sinh dấu thời gian kênh bên ngoài và các lô quá khổ.
- `memory-v2/commitment-projection.test.ts`: một danh tính hiện tại, báo lại, hoàn thành, lỗi bộ nhớ, sửa chữa, ghi bên ngoài, khôi phục đồng hồ và triệt tiêu.
- `runtime/context-builder.test.ts`: lịch sử 90 bản ghi, có giới hạn prompt, lịch sử theo yêu cầu và không sửa chữa đường dẫn yêu cầu.

Bộ mở rộng:

- `commitment-extraction.test.ts`: các danh mục đối nghịch được yêu cầu, lời nhắc tích cực, theo dõi rõ ràng, các phần trong ngày và các chủ đề kỹ thuật trực tiếp.
- `task-tools.test.ts`: Bảo vệ bỏ qua mô hình khi không có khả năng bộ nhớ và meta các thay đổi trạng thái bị từ chối.
- `runtime/privacy-boundary.test.ts`: các cuộc gọi mô hình thù địch và các yêu cầu tiếp theo được bảo vệ.
- `commitment-conversation.test.ts`: các câu trả lời không liên quan, các tài liệu tham khảo cũ và mơ hồ, các chủ đề theo ngữ cảnh và các tác vụ rõ ràng bị vô hiệu hóa bộ nhớ.
- `commitment-scenario.test.ts`: các kịch bản A, C, D và E với bộ lưu trữ thực, đồng hồ được đưa vào, các vòng quay mô hình không liên quan và ba lần khởi động lại tiếp theo.
- `proactive-policy.test.ts`: độ tin cậy, mức độ liên quan, thời gian hết hạn, hoạt động, thời gian hồi chiêu, hạn chế bùng nổ, lỗi trình thông báo, lease, host đồng thời và hết hạn định kỳ.
- `task-process.test.ts`: hàng rào xác nhận quyền sở hữu theo quy trình OS thực sự cho cả lời nhắc và theo dõi.

Kịch bản B từ chối yêu cầu meta cả cục bộ và thông qua lệnh gọi mô hình độc hại. Kịch bản F từ chối bộ nhớ lâu bền được bảo vệ trước khi các tác vụ, chiếu bộ nhớ hoặc ứng viên có thể tồn tại. Các hoạt động hồi quy lưu trữ bận, tệp bị hỏng, Recall không khả dụng, sự cố trong khi ghi, lỗi trình thông báo, múi giờ, giờ yên tĩnh và lease hiện tại vẫn hoạt động.

<a id="12-validation"></a>

## 12. Xác nhận

| Lệnh chính xác | Kết quả |
| --- | --- |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli test --maxWorkers=2` | Đã vượt qua: 67 hồ sơ, 629 bài kiểm tra |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli typecheck` | Đã vượt qua |
| `pnpm --config.verify-deps-before-run=false -F @angela/cli build` | Đã vượt qua |
| `pnpm --config.verify-deps-before-run=false -F @angela/i18n typecheck` | Đã vượt qua |
| `pnpm --config.verify-deps-before-run=false -F @angela/i18n build` | Đã vượt qua |
| `pnpm --config.verify-deps-before-run=false lint` | Đã vượt qua: không có lỗi, 603 cảnh báo ESLint hiện có |
| `pnpm_config_verify_deps_before_run=false <installed-pnpm> typecheck --concurrency=2` | 46 workspace thành công, sau đó stage-ui không liên quan đã cạn kiệt đống, thoát 129 |
| `git diff --check` | Đã vượt qua |

`<installed-pnpm>` là tệp thực thi hiện có tại:

```text
/home/lighthouse2815/.local/share/pnpm/package-manager-store/v11/links/@pnpm/exe/11.24.0/06ccdf6de568f896aaf7e8cb1d131c7165bddd978d4494af0cf8affbb14c0c5b/node_modules/@pnpm/exe/pnpm
```

Thư mục của nó được thêm vào PATH cho kiểm tra kiểu dữ liệu gốc. `stage-ui` không thành công ở giới hạn heap mặc định gần 2 GB. Gói đó không có thay đổi và không nhập CLI. Kiểm tra gói CLI và i18n hiện tại được thông qua độc lập. ESLint tập trung và kiểm tra trước cam kết kho lưu trữ cũng chạy trên mã đã thay đổi.

Các bản dựng và thử nghiệm sử dụng chạy tuần tự để duy trì việc xuất gói artifact. Một lần chạy trung gian đã chồng chéo quá trình nhập thử nghiệm và dọn dẹp i18n artifact. Lần chạy cuối cùng diễn ra sau các bản dựng đã hoàn thành. Root kiểm tra kiểu dữ liệu sử dụng tệp thực thi pnpm đã cài đặt vì trình khởi chạy chung không thể được tạo ra một cách đáng tin cậy bởi Turbo. Các thử nghiệm này không yêu cầu dịch vụ trực tiếp mô hình, thiết bị âm thanh vật lý hoặc trình nền thông báo desktop.

<a id="13-remaining-limitations"></a>

## 13. Những hạn chế còn lại

Ngữ pháp cục bộ có chủ ý bảo thủ. Các yêu cầu trực tiếp không được hỗ trợ có thể sử dụng các công cụ có cấu trúc được bảo vệ hiện có. Theo dõi đồng hành tự động đến từ các nhiệm vụ có thẩm quyền rõ ràng. Suy luận theo từng giai đoạn không được yêu cầu vẫn nằm ngoài nền tảng này. Giới hạn lưu giữ tác vụ không hoạt động hiện tại vẫn áp dụng cho các truy vấn trực tiếp về lịch sử tác vụ. Việc phân phối thiết bị đầu cuối cần có host đang chạy. Dịch vụ Linux tùy chọn vẫn giữ nguyên hành vi thông báo desktop hiện có. Discord và Zalo vẫn giữ nguyên khả năng và ranh giới quyền riêng tư hiện có. Giao diện tác vụ web và Electron riêng biệt không thay đổi. Bản trình bày chính xác một lần qua ranh giới sự cố tác dụng phụ bên ngoài vẫn không khả dụng nếu không có tính tạm thời của đích. workspace kiểm tra kiểu dữ liệu gốc vẫn bị chặn do cạn kiệt vùng heap stage-ui không liên quan.

Cột mốc nhắc nhở: DONE. Nền tảng đồng hành chủ động: DONE.

<a id="14-next-recommended-milestone"></a>

## 14. Cột mốc đề xuất tiếp theo

Độ tin cậy tương tác bằng giọng nói: cải thiện khả năng xử lý gián đoạn và luân phiên trong luồng hội thoại bằng giọng nói hiện có.
