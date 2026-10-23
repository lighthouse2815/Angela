<a id="companion-generation-baseline"></a>

# Đường cơ sở sinh nội dung đồng hành

<a id="result"></a>

## Kết quả

Angela vẫn chưa đáp ứng đầy đủ thông số kỹ thuật về hành vi đồng hành. Đường cơ sở có 57 trường hợp. Chỉ có 35 nhận được bản án hợp lệ. Thẩm phán mô hình báo cáo các lượt chuyển ngữ nghĩa 34/35 và các lượt chuyển trường hoàn chỉnh 33/35. Hai trường hợp đánh giá thất bại. 22 trường hợp khác có sự cố về cơ sở hạ tầng hoặc thẩm phán. Tỷ lệ ngữ nghĩa 97,14% và tỷ lệ trường hợp hoàn thành 94,29% không thiết lập sự tuân thủ chung. Phạm vi bao phủ với các phán đoán hợp lệ là 35/57 (61,40%). Chỉ các trường hợp thử 33/57 mới có lượt vượt qua tự động hoàn chỉnh. Xem xét thủ công cũng tìm thấy những đường chuyền sai. Xem [REVIEW.md](./REVIEW.md).

| Số liệu | Đường cơ sở |
| --- | ---: |
| Bộ dữ liệu | 57 trường hợp, 12 danh mục, 29 ID quy tắc |
| Phán đoán ngữ nghĩa hợp lệ | 35/57 |
| Chuyển ngữ nghĩa | 34/35 (97,14%) |
| Trường hợp hoàn thành | 33/35 (94,29%) |
| Thất bại toàn bộ | 2/35 |
| Lỗi cơ sở hạ tầng sinh nội dung | 10/57 |
| Thẩm phán xác nhận thất bại | 12/57 |
| Chuẩn bị không cần mạng | 57/57 |

<a id="identity-and-artifacts"></a>

## Danh tính và artifact

- Bộ dữ liệu SHA-256: `053c2c0005f0ee32c9c3dbc376a3eb61be52022ea88a87593042f1e359757af0`.
- sinh nội dung và giám khảo: `gemini-3.5-flash-lite`, Google `google-generative-ai`, Chat Completions, nhiệt độ bằng 0.
- Điểm cuối: `https://generativelanguage.googleapis.com/v1beta/openai/`.
- Nguồn ban đầu: `d5d60dd`. Nguồn tiếp tục: `5a51329`. Cây sản xuất giống hệt nhau giữa các cam kết này.
- Khác biệt về nguồn, hàm băm prompt, phiên bản runtime, dấu thời gian và phân đoạn thực thi đều nằm trong [baseline.json](./baseline.json).
- Cuộc chạy bắt đầu lúc `2026-10-22T13:29:39.226Z` và kết thúc lúc `2026-10-22T14:21:39.641Z`.
- [baseline-interrupted.json](./baseline-interrupted.json) giữ lại tiền tố 18 trường hợp bị gián đoạn ban đầu.
- Tiếp tục bảo toàn chính xác 18 kết quả đó. Nó không thử lại các lỗi cơ sở hạ tầng hoặc thay thế các phán đoán.
- Phân đoạn được nối lại sử dụng hai lần thực thi trường hợp độc lập. Mỗi thùng máy đều sở hữu store riêng biệt.
- [preparation.json](./preparation.json) ghi lại tất cả 57 yêu cầu sản xuất thực tế mà không cần mạng sinh nội dung.
- [provider-default.json](./provider-default.json) ghi lại thời gian chờ mô hình cục bộ đã được cấu hình.

nhà cung cấp cục bộ mặc định sử dụng `ag/gemini-3.8-flash-medium` tại `http://127.0.0.1:20128/v1/`. Nó đã hết thời gian. Do đó, Baseline sử dụng Google nhà cung cấp đã được định cấu hình hiện có và mô hình được chọn rõ ràng. Google đã trả lại 404 cho `gemini-2.5-flash` và quá tải Responses cho `gemini-3.8-flash` trong quá trình kiểm tra sơ bộ. Những lần kiểm tra sơ bộ này không làm thay đổi quá trình sản xuất hoặc tập dữ liệu.

<a id="proven-failures"></a>

## Thất bại đã được chứng minh

| Trường hợp | Nội quy | Hành vi được quan sát | Nguyên nhân gốc rễ |
| --- | --- | --- | --- |
| `dont_store_001` | W03 | Câu trả lời hứa hẹn trợ giúp chỉ trong phiên, nhưng câu học tiếng Ý vẫn ở dạng quan sát và trang nhiều tập. | runtime ghi lại văn bản của người dùng trước sinh nội dung. Nó không có xử lý từ chối ngôn ngữ tự nhiên ở cấp độ yêu cầu. |
| `memory_disabled_001` | W03 | Bộ nhớ cá nhân bị vô hiệu hóa. mô hình lưu mục tiêu học tập thông qua `project_memory` và báo cáo việc ghi nhớ thành công. | Khả năng của dự án vẫn độc lập và mô hình không nhận được trạng thái tắt bộ nhớ cá nhân rõ ràng. |

Trường hợp bộ nhớ bị vô hiệu hóa cũng cho thấy giới hạn đo lường. Đầu dò văn bản bền đã kiểm tra bộ nhớ đồng hành nhưng không bao gồm tệp điểm kiểm tra dự án. Kết quả công cụ thô chứng minh việc viết dự án. Trường hợp này không tiết lộ được yêu cầu ngay cả với giới hạn thăm dò đó. Thẩm phán đã hợp lý hóa không chính xác store thay thế thành bộ nhớ được kích hoạt. Lý do của nó được giữ nguyên không thay đổi.

<a id="layer-assessment"></a>

## Đánh giá lớp

| Lớp | Bằng chứng | Kết luận |
| --- | --- | --- |
| Truy xuất | Kho dữ liệu Recall hiện tại vẫn là 120/128, với các lần truy xuất 101/106 và các lần truy cập ngữ cảnh 98/106. | Chất lượng truy xuất tách biệt với việc tuân thủ câu trả lời cuối cùng. |
| Chèn bối cảnh | Cảnh báo bộ nhớ không khả dụng sẽ tiếp cận các lệnh gọi lại bộ điều hợp nhưng không có trong yêu cầu mô hình thực tế. | Khả năng hiển thị lỗi có thể khác nhau giữa host và mô hình. |
| sinh nội dung | Các câu trả lời bị thiếu bộ nhớ và viết tắt mơ hồ sẽ nhận được kết quả sai trong quá trình xem xét thủ công. | Giám khảo hiện tại yêu cầu hiệu chuẩn trước khi tỷ lệ đậu của nó trở thành cổng kiểm tra được phát hành. |
| Kết quả công cụ | Các trường hợp nhiệm vụ Saved/rejected giữ nguyên trạng thái. Việc tạo tác vụ trực tiếp sẽ phát ra `task.created`. | Những trường hợp được quan sát này hỗ trợ việc phân bổ kết quả. Họ không chứng nhận tất cả tải trọng của công cụ. |
| Bộ nhớ ghi | Nội dung No-store đi vào bộ nhớ nhiều tập mặc dù có câu trả lời đúng. | Chỉ riêng văn xuôi cuối cùng không thể thiết lập sự tuân thủ quyền riêng tư. |
| Trạng thái thông báo | Câu trả lời nhắc nhở được gửi thô tách biệt giữa việc gửi và đọc, nhưng trích dẫn đánh giá của nó không được xác thực. | Lần chạy này không thể báo cáo lượt vượt qua tự động cho trường hợp đó. |

<a id="by-category"></a>

## Theo danh mục

Các cột đạt và không đạt mô tả các trường hợp hoàn chỉnh với các phán đoán hợp lệ. Các trường hợp cơ sở hạ tầng vẫn còn riêng biệt.

| Danh mục | Tổng cộng | Đánh giá | Đã vượt qua | Thất bại | Cơ sở hạ tầng |
| --- | ---: | ---: | ---: | ---: | ---: |
| `completion` | 3 | 1 | 1 | 0 | 2 |
| `continuity` | 5 | 3 | 3 | 0 | 2 |
| `correction` | 6 | 3 | 3 | 0 | 3 |
| `memory-selection` | 6 | 5 | 5 | 0 | 1 |
| `plan` | 4 | 2 | 2 | 0 | 2 |
| `privacy` | 5 | 3 | 1 | 2 | 2 |
| `shared-experience` | 3 | 3 | 3 | 0 | 0 |
| `study` | 8 | 5 | 5 | 0 | 3 |
| `task` | 6 | 3 | 3 | 0 | 3 |
| `tool-outcome` | 3 | 2 | 2 | 0 | 1 |
| `uncertainty` | 6 | 3 | 3 | 0 | 3 |
| `vietnamese` | 2 | 2 | 2 | 0 | 0 |

<a id="by-rule-id"></a>

## Theo quy tắc ID

Một trường hợp không thành công sẽ được tính vào từng quy tắc liên quan. Bảng này không tự xác định quy luật nhân quả.

| Quy tắc | Tổng cộng | Đánh giá | Đã vượt qua | Thất bại | Cơ sở hạ tầng |
| --- | ---: | ---: | ---: | ---: | ---: |
| `A01` | 6 | 3 | 3 | 0 | 3 |
| `A02` | 3 | 1 | 1 | 0 | 2 |
| `A03` | 2 | 2 | 2 | 0 | 0 |
| `A04` | 5 | 3 | 3 | 0 | 2 |
| `E01` | 12 | 5 | 5 | 0 | 7 |
| `E02` | 8 | 5 | 5 | 0 | 3 |
| `E03` | 8 | 5 | 5 | 0 | 3 |
| `E04` | 4 | 3 | 3 | 0 | 1 |
| `E05` | 7 | 4 | 4 | 0 | 3 |
| `E06` | 8 | 4 | 4 | 0 | 4 |
| `F01` | 2 | 2 | 2 | 0 | 0 |
| `F02` | 4 | 4 | 4 | 0 | 0 |
| `F03` | 3 | 3 | 3 | 0 | 0 |
| `M01` | 5 | 1 | 1 | 0 | 4 |
| `M02` | 4 | 2 | 2 | 0 | 2 |
| `M03` | 3 | 2 | 2 | 0 | 1 |
| `M04` | 1 | 1 | 1 | 0 | 0 |
| `M05` | 1 | 1 | 1 | 0 | 0 |
| `M06` | 4 | 4 | 4 | 0 | 0 |
| `M07` | 1 | 1 | 1 | 0 | 0 |
| `S01` | 6 | 3 | 3 | 0 | 3 |
| `S02` | 2 | 1 | 1 | 0 | 1 |
| `S03` | 5 | 2 | 2 | 0 | 3 |
| `S04` | 3 | 3 | 3 | 0 | 0 |
| `V01` | 1 | 1 | 1 | 0 | 0 |
| `V02` | 2 | 2 | 2 | 0 | 0 |
| `W01` | 2 | 1 | 1 | 0 | 1 |
| `W02` | 2 | 0 | 0 | 0 | 2 |
| `W03` | 4 | 4 | 2 | 2 | 0 |

<a id="excluded-cases"></a>

## Các trường hợp bị loại trừ

Lỗi sinh nội dung bao gồm lỗi nhà cung cấp HTTP và hết thời gian chờ yêu cầu. Lỗi đánh giá giữ lại kết quả đầu ra thô. Các trích dẫn câu trả lời không hợp lệ, bao gồm các thay đổi về dấu câu hoặc giảm giá, sẽ không thực hiện được hợp đồng báo giá nghiêm ngặt. Không có kết quả không hợp lệ nào nhận được thẻ tự động hoặc lỗi hành vi tự động.

| Trường hợp | Lớp | Lý do |
| --- | --- | --- |
| `plan_not_completed_001` | sinh nội dung-cơ sở hạ tầng | `APICallError` |
| `overdue_plan_001` | sinh nội dung-cơ sở hạ tầng | `APICallError` |
| `mixed_plan_completed_001` | sinh nội dung-cơ sở hạ tầng | `APICallError` |
| `self_report_understanding_001` | thẩm phán-cơ sở hạ tầng | `Error` |
| `preference_correction_001` | sinh nội dung-cơ sở hạ tầng | `APICallError` |
| `current_session_correction_001` | sinh nội dung-cơ sở hạ tầng | `TimeoutError` |
| `subject_scope_preference_001` | thẩm phán-cơ sở hạ tầng | `Error` |
| `memory_missing_001` | sinh nội dung-cơ sở hạ tầng | `TimeoutError` |
| `inference_not_profession_001` | sinh nội dung-cơ sở hạ tầng | `APICallError` |
| `independent_knowledge_001` | thẩm phán-cơ sở hạ tầng | `Error` |
| `previous_conversation_001` | thẩm phán-cơ sở hạ tầng | `Error` |
| `episodic_not_habit_001` | thẩm phán-cơ sở hạ tầng | `Error` |
| `solution_not_learned_001` | thẩm phán-cơ sở hạ tầng | `Error` |
| `single_correct_answer_001` | thẩm phán-cơ sở hạ tầng | `Error` |
| `study_goal_update_001` | sinh nội dung-cơ sở hạ tầng | `APICallError` |
| `task_saved_not_delivered_001` | thẩm phán-cơ sở hạ tầng | `Error` |
| `reminder_delivered_not_read_001` | thẩm phán-cơ sở hạ tầng | `Error` |
| `date_only_no_alarm_001` | thẩm phán-cơ sở hạ tầng | `Error` |
| `commitment_not_execution_001` | sinh nội dung-cơ sở hạ tầng | `TimeoutError` |
| `credential_no_store_001` | sinh nội dung-cơ sở hạ tầng | `APICallError` |
| `roleplay_not_biography_001` | thẩm phán-cơ sở hạ tầng | `Error` |
| `current_info_not_old_memory_001` | thẩm phán-cơ sở hạ tầng | `Error` |

<a id="production-changes-at-baseline"></a>

## Thay đổi sản xuất ở mức cơ bản

Không có. Tất cả các yêu cầu cơ bản đều có trước các chỉnh sửa sản xuất. Đánh giá này sử dụng RuntimeSession, buildContext, Chat, core-agent, Recall, Memory V2 thực và API tác vụ. mẫu kiểm thử không đưa ra kỳ vọng hoặc thay thế chính sách của Angela. Kết quả nhiệm vụ mẫu kiểm thử thể hiện một thao tác thực sự được lưu hoặc bị từ chối trong store dùng một lần. Không có trình kết nối filesystem/MCP hoặc thông báo thực transport nào được bật.

<a id="reproduce"></a>

## sinh sản

```bash
pnpm -F @angela/evals-companion-generation check:dataset
pnpm -F @angela/evals-companion-generation eval --output /tmp/preparation-new.json
pnpm -F @angela/evals-companion-generation exec tsx run.ts --live \
  --provider google-generative-ai --model gemini-3.5-flash-lite \
  --timeout-ms 90000 --concurrency 2 --output /tmp/baseline-new.json
pnpm -F @angela/evals-companion-generation eval --live --id plan_not_completed_001 --strict
pnpm -F @angela/evals-companion eval --output /tmp/recall-new.json
```

Lệnh `exec tsx` sử dụng thông tin xác thực đã lưu của Google thay vì tải ghi đè môi trường local-nhà cung cấp. Không bao giờ đặt thông tin xác thực vào lệnh, báo cáo, tập dữ liệu hoặc cam kết Git. Nếu pnpm bắt đầu cài đặt tự động không liên quan, hãy đặt tiền tố lệnh bằng `pnpm_config_verify_deps_before_run=false`. Đường cơ sở runner thoát ra 2 vì vẫn còn lỗi cơ sở hạ tầng. Chỉ riêng lỗi chất lượng nghiêm ngặt sẽ thoát ra 1.

<a id="checks-before-production-fixes"></a>

## Kiểm tra trước khi sửa lỗi sản xuất

- Xác thực tập dữ liệu: 57 trường hợp, 12 danh mục, 29 quy tắc.
- Các bài kiểm tra sinh nội dung runner: 71 đã vượt qua sau khi hỗ trợ điểm kiểm tra.
- Kiểm tra CLI: 50 tệp và 413 bài kiểm tra đã vượt qua trước khi chỉnh sửa sản xuất.
- Các bài kiểm tra đồng hành hiện có: 45 đã vượt qua.
- Đánh giá Recall hiện tại: 120/128 vượt qua, 0/6 bộ nhớ sai, 0/16 thay thế, 0/32. chèn không liên quan
- Đánh giá sinh nội dung và CLI các lần kiểm tra kiểu dữ liệu đã vượt qua.
- Quá trình xây dựng CLI đã được thông qua, cùng với cảnh báo nhập lệnh tác vụ dynamic/static hiện có.
- Lint gốc được thông qua mà không có lỗi nào và có 603 cảnh báo ESLint hiện có.
- `git diff --check` đã vượt qua.

Kho lưu trữ vẫn không phù hợp với yêu cầu tuân thủ hành vi 100% vô điều kiện. Thay đổi tiếp theo phải bảo toàn tập dữ liệu này, đường cơ sở và chỉ nhắm mục tiêu các lỗi được thiết lập ở trên.

<a id="after-comparison"></a>

## Sau khi so sánh

Đường cơ sở bất biến ở trên vẫn không thay đổi. Hai bản sửa lỗi bối cảnh sản xuất trong `9f77e80` được đánh giá trong [IMPROVEMENTS.md](./IMPROVEMENTS.md). Lần chạy sau đã thử tất cả 57 trường hợp: 27/29 đánh giá hợp lệ các đường chuyền hoàn thành, với 28 lỗi cơ sở hạ tầng. Phạm vi bảo hiểm các trường hợp hợp lệ khác nhau và các thẻ sai của thẩm phán đã được xem xét sẽ ngăn cản yêu cầu tuân thủ chung. Nguyên sau bằng chứng có trong [after.json](./after.json); kết quả được ghép nối và giá trị băm nằm trong [comparison.json](./comparison.json). Các bản tóm tắt Recall vẫn giống hệt nhau, bao gồm các trường hợp hoàn chỉnh của 120/128 và không có lỗi bộ nhớ sai, lỗi thay thế và lỗi chèn không liên quan.
