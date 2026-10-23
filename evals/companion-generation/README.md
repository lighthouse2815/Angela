<a id="companion-behavior-generation-evaluation"></a>

# Đánh giá hành vi đồng hành sinh nội dung

Gói này đánh giá các câu trả lời được tạo dựa trên [, đặc tả hành vi đồng hành](../../docs/ai/companion-behavior-spec.md). 57 trường hợp tổng hợp bao gồm 29 ID quy tắc và 12 danh mục. Đánh giá đồng hành [ hiện có](../companion/README.md) đo lường riêng biệt khả năng truy xuất và ngữ cảnh.

<a id="saved-evaluation-evidence"></a>

## Bằng chứng đánh giá đã lưu

[REPORT.md](./REPORT.md) ghi lại quá trình kiểm tra cơ sở và nguồn. [REVIEW.md](./REVIEW.md) ghi lại các đường chuyền sai và đánh giá các giới hạn. [IMPROVEMENTS.md](./IMPROVEMENTS.md) ghi lại những thay đổi sản xuất tối thiểu, sau kết quả và hành vi chưa được giải quyết. Các báo cáo thô giữ lại câu trả lời và bằng chứng. Tỷ lệ đậu của họ yêu cầu mức độ đưa tin và đánh giá cẩn thận trong các tài liệu đó.

<a id="run"></a>

## Chạy

Lệnh mặc định tạo store dùng một lần và chuẩn bị các yêu cầu nhà cung cấp thực. Nó không liên lạc với mô hình. Sự chuẩn bị không thiết lập sự tuân thủ hành vi. Tốc độ vượt qua hành vi của nó là `null`.

```bash
pnpm -F @angela/evals-companion-generation eval
pnpm -F @angela/evals-companion-generation eval --id plan_not_completed_001
pnpm -F @angela/evals-companion-generation eval --category correction
pnpm -F @angela/evals-companion-generation check:dataset
pnpm -F @angela/evals-companion-generation test
```

Nếu nhà cung cấp có sẵn, hãy sử dụng `--live` cho sinh nội dung và đánh giá ngữ nghĩa. Các biến môi trường CLI và `ANGELA_*` chọn nhà cung cấp, mô hình, điểm cuối, giao thức và thông tin xác thực. Lệnh gói tải `.env.cli.local` gốc hiện có. Không có thông tin xác thực nào nhập siêu dữ liệu báo cáo. Cờ ghi đè các giá trị môi trường thông qua cấu hình CLI bên đọc hiện có.

```bash
pnpm -F @angela/evals-companion-generation eval --live --output /tmp/generation-baseline.json
pnpm -F @angela/evals-companion-generation eval --live --id plan_not_completed_001 --strict
pnpm -F @angela/evals-companion-generation eval --live --category correction --strict
pnpm -F @angela/evals-companion-generation eval --live --model MODEL --config /path/to/config.json
```

`--judge-model` hoặc `ANGELA_EVAL_JUDGE_MODEL` chọn một giám khảo khác mô hình trên cùng nhà cung cấp được cấu hình. Theo mặc định, sinh nội dung và giám khảo sử dụng cùng một mô hình. Điều này tạo ra rủi ro lỗi tương quan. `--no-judge` ghi lại các câu trả lời trực tiếp và kiểm tra xác định dưới dạng `unjudged`. Nó không bao giờ tạo ra một đường chuyền ngữ nghĩa. `--timeout-ms` mặc định là 45000. Mỗi trường hợp cho phép tối đa 12 yêu cầu sinh nội dung và 24000 ký tự trả lời. Đầu ra của Thẩm phán được giới hạn ở 32000 ký tự. sinh nội dung và mỗi người đánh giá sẽ nhận được thời gian chờ riêng. Báo cáo từ chối đường dẫn đầu ra hiện có. Mỗi trường hợp hoàn thành đều kiểm tra báo cáo. Cập nhật điểm kiểm tra sử dụng thay thế tệp nguyên tử.

Nếu quá trình chạy dừng lại, hãy tiếp tục vào một tệp đầu ra mới:

```bash
pnpm -F @angela/evals-companion-generation eval --live --resume /tmp/interrupted.json \
  --output /tmp/resumed.json --model MODEL --timeout-ms 90000
```

Giữ mô hình, nhà cung cấp ban đầu, lựa chọn, thời gian chờ, tập dữ liệu và đánh giá prompt. Tiếp tục kiểm tra các danh tính này và cây nguồn sản xuất trước khi chạy trường hợp khác. Nó giữ kết quả hoàn thành, bao gồm cả các lỗi cơ sở hạ tầng. Nó không thử lại hoặc thay thế chúng. Báo cáo ghi lại từng phân đoạn thực thi, cam kết của nó và hàm băm điểm kiểm tra ban đầu. `--concurrency` chấp nhận một đến bốn trường hợp độc lập. Mặc định là một. Các trường hợp đồng thời giữ lại thứ tự tập dữ liệu và sử dụng store riêng biệt. Điểm kiểm tra theo từng lô hoàn thành.

| Thoát | Ý nghĩa |
| --- | --- |
| 0 | Đã hoàn thành chạy mà không có lỗi cơ sở hạ tầng. Lỗi chất lượng vẫn là dữ liệu báo cáo trừ khi nghiêm ngặt. |
| 1 | Chạy nghiêm ngặt có những thất bại, những câu trả lời không được đánh giá hoặc những trường hợp chỉ chuẩn bị. |
| 2 | Đầu vào không hợp lệ, lỗi nhà cung cấp, câu trả lời trống hoặc đầu ra đánh giá không hợp lệ. |

<a id="production-boundary"></a>

## Ranh giới sản xuất

```text
fixture state -> Memory / MemoryStore / session archive / Tasks / taskTools
  -> RuntimeSession.send -> buildContext / buildTools
    -> Chat.send -> Context.prepare -> core-agent -> configured provider
      -> deterministic checks -> separate semantic judge -> report
```

bộ kiểm thử chỉ chấp nhận `input`. Nó không thể đọc `expected`. mẫu kiểm thử đặt văn bản nguồn, quyền hạn, quyền sở hữu, workspace và lịch sử hiện tại. Nhiệm vụ mẫu kiểm thử thực thi các công cụ tác vụ thực tế. Phân phối mẫu kiểm thử sử dụng các phương thức xác nhận và xác nhận thực tế mà không cần thông báo bên ngoài. Công cụ trợ lý Canonical lần lượt giữ lại kết quả trả về thực tế. Trường hợp `live_task_create_001` cũng yêu cầu sự kiện miền đã lưu từ các công cụ sản xuất do mô hình chọn. Discord thực hiện đường dẫn chỉ có văn bản hiện có. Nó không khởi tạo đồng hành riêng tư store.

bộ kiểm thử ghi lại các nội dung yêu cầu giao thức chính xác tại ranh giới tìm nạp nhà cung cấp. Điều này bao gồm bối cảnh sau khi nén sản xuất. Nó ghi lại vùng đồng bằng văn bản, sự kiện công cụ, kết quả runtime, cảnh báo, ID nguồn và trạng thái lâu dài sau yêu cầu. Đường dẫn tạm thời và ID trang mẫu kiểm thử ngẫu nhiên nhận được bí danh. Văn bản nguồn gốc vẫn còn nguyên. Dấu thời gian và ID được tạo vẫn còn trong các sự kiện runtime thô. Các lần chạy trực tiếp lặp đi lặp lại không giống nhau về byte. Tiêu đề và thông tin xác thực nhà cung cấp bị loại trừ. Sử dụng mẫu kiểm thử tổng hợp, vì các báo cáo có chủ ý giữ lại văn bản cuộc hội thoại và bộ nhớ.

Truy xuất sử dụng chế độ từ vựng hiện có với tính năng nhúng bị vô hiệu hóa trong runtime dùng một lần. Không có yêu cầu nhúng trả phí, store người dùng thực, trình kết nối hệ thống tệp hoặc thông báo transport tham gia đánh giá. Những kết quả này không chứng nhận trí nhớ học tập, khả năng nén trong các cuộc trò chuyện dài hoặc gửi thông báo thực của desktop.

<a id="dataset-and-expectations"></a>

## Tập dữ liệu và kỳ vọng

`cases.jsonl` chứa một trường hợp trên mỗi dòng. `schema.ts` xác thực các trường hợp thông qua phần phụ thuộc Valibot hiện có. Mọi trường hợp đều có ID, danh mục, mẫu kiểm thử `input` và đối tượng `expected` có cấu trúc.

| Kỳ Vọng | Kiểm tra |
| --- | --- |
| `requiredClaims` | Thẩm phán kiểm tra từng ý nghĩa được yêu cầu một cách độc lập. |
| `forbiddenClaims` | Thẩm phán kiểm tra khẳng định ý nghĩa. Những lời từ chối và trích dẫn lịch sử được cho là vẫn có hiệu lực. |
| `allowedUncertainty` | Thẩm phán kiểm tra mức độ yêu cầu và biểu hiện của sự không chắc chắn. |
| `expectedEvidenceType` | Thẩm phán kiểm tra quy kết và giới hạn bằng chứng. |
| `expectedRuleIds` | Liên kết trường hợp với các quy tắc thông số kỹ thuật cố định. |
| `expectedActionState` | Thẩm phán kiểm tra trạng thái hành động mục tiêu, độc lập với việc ghi bộ nhớ hợp lệ ngẫu nhiên. |
| `expectedMemoryUse` | Nguồn phải đạt yêu cầu sinh nội dung hoặc kết quả công cụ thực tế. |
| `forbiddenMemoryUse` | Nguồn phải nằm ngoài các yêu cầu và kết quả của công cụ sinh nội dung. |
| `forbiddenDurableText` | Kiểm tra chuỗi con xác định của bộ nhớ và quan sát sau yêu cầu. |
| `requiredEvents` | Kiểm tra xác định các sự kiện miền runtime thành công. |

Kiểm tra nguồn phân biệt truy xuất rõ ràng, bối cảnh được chèn và đọc qua trung gian công cụ. Họ không suy ra Recall thành công từ văn xuôi hợp lý. Kiểm tra chuỗi con bền là các đầu dò rò rỉ hẹp. Họ không thể phát hiện mọi cách diễn giải hoặc viết ngữ nghĩa không chính xác. Do đó, các trường hợp nhập vai và ưu tiên tạm thời cũng cần xem xét ngữ nghĩa của các quyết định lưu trữ.

<a id="judge-contract-and-metrics"></a>

## Hợp đồng thẩm phán và số liệu

`scoring.ts` sở hữu một phiên bản đánh giá prompt và một lược đồ kết quả nghiêm ngặt. Yêu cầu của người đánh giá sử dụng đầu ra Lược đồ native JSON thông qua nhà cung cấp SDK hiện có. Đầu ra có cấu trúc không được hỗ trợ là lỗi cơ sở hạ tầng. runner không bao giờ âm thầm thay thế chế độ đầu ra ít nghiêm ngặt hơn. Giám khảo chỉ nhận được danh sách tiêu chí cố định sau sinh nội dung. Nó không thể thêm, bỏ, sắp xếp lại hoặc đổi tên tiêu chí. Bằng chứng câu trả lời được trích dẫn phải xuất hiện chính xác trong câu trả lời. Thiếu các xác nhận quyền sở hữu bắt buộc có thể sử dụng trích dẫn trống kèm theo lời giải thích. Đầu ra không đúng định dạng là lỗi cơ sở hạ tầng. runner giữ lại đầu ra đánh giá thô và không âm thầm thử lại hoặc sửa chữa nó.

Tỷ lệ vượt qua hành vi ngữ nghĩa chỉ tính các trường hợp có phán đoán hợp lệ. Tỷ lệ vượt qua trường hợp hoàn chỉnh cũng yêu cầu kiểm tra nguồn, trạng thái bền vững và sự kiện hành động để vượt qua. Cả hai mẫu số đều loại trừ những thất bại về cơ sở hạ tầng, sự chuẩn bị và những câu trả lời không được đánh giá. Báo cáo hiển thị tất cả số lượng bị loại trừ. Thống kê quy tắc đếm các trường hợp lỗi liên quan. Họ không thiết lập quy tắc riêng nào gây ra từng lỗi. Các lớp lỗi tách biệt việc truy xuất, bối cảnh, ghi bộ nhớ, sinh nội dung, kết quả công cụ và cơ sở hạ tầng.

Các báo cáo bao gồm cam kết, hàm băm khác biệt sản xuất, hàm băm tập dữ liệu, hàm băm prompt đánh giá, mô hình, giao thức, cài đặt lấy mẫu và đồng hồ. Nhiệt độ bằng 0 làm giảm độ biến thiên. Các thay đổi của nhà cung cấp, suy luận ngẫu nhiên, đồng hồ trực tiếp và đánh giá mô hình vẫn hạn chế khả năng tái tạo. Kiểm tra các câu trả lời thô và đưa ra quyết định trước khi chọn bất kỳ bản sửa lỗi sản xuất nào. Giữ nguyên tập dữ liệu và đường cơ sở khi so sánh các bản sửa lỗi sau này.

Nếu pnpm thử cài đặt tự động không liên quan, hãy đặt `pnpm_config_verify_deps_before_run=false` cho lệnh.

<a id="privacy-storage-probe"></a>

## Thăm dò lưu trữ quyền riêng tư

Đầu dò trạng thái bền bỉ đọc thông tin cá nhân, các trang và quan sát của Bộ nhớ V2, điểm kiểm tra dự án, kỹ năng, nhiệm vụ và kho lưu trữ phiên đã lưu. Nó kiểm tra sản phẩm store sản xuất dùng một lần sau khi runtime ngừng hoạt động. Chỉ riêng trạng thái công cụ không thể chứng minh rằng văn bản được bảo vệ không được lưu trữ. Kiểm tra hồi quy thực hiện ghi dự án, kỹ năng và nhiệm vụ thực tế để kiểm tra phạm vi thăm dò. Các vụ án bị đóng băng và kỳ vọng của thẩm phán vẫn không thay đổi.
