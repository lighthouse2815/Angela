<a id="recall-quality-improvements"></a>

# Cải tiến chất lượng Recall

<a id="initial-investigation"></a>

## Điều tra ban đầu

Đọc tất cả 21 trường hợp thất bại trước khi thực hiện. Tập dữ liệu và nhãn dự kiến ​​không thay đổi.

| Thất bại ban đầu | Đếm | Nguyên nhân gốc rễ |
| --- | ---: | --- |
| `no_shared_memory_004`, `no_shared_memory_005` | 2 | Một âm tiết gấp phù hợp với văn bản nghiên cứu không liên quan |
| `irrelevant_memory_001`, `002`, `003`, `004`, `006`, `007` | 6 | OR khớp các từ yếu hoặc mơ hồ được thừa nhận |
| `last_conversation_001`, `002`, `003`, `004`, `006`, `007`, `008` | 7 | Tóm tắt chung không có chủ đề token và không có lựa chọn nguồn tạm thời |
| `semantic_paraphrase_001`, `004`, `006`, `007`, `008` | 5 | Không chồng chéo từ vựng và không nhúng cấu hình nhà cung cấp |
| `vietnamese_variants_005` | 1 | Tên và biệt hiệu sử dụng các từ khác nhau, ngoài dấu gấp |

Accent folding already removes Vietnamese combining marks and maps `đ` to `d`.
RRF sử dụng vị trí ứng viên chứ không phải điểm phù hợp tuyệt đối. Một kết quả yếu duy nhất vẫn xếp thứ nhất.
Trọng số của cơ quan làm cho các sự kiện rõ ràng được xếp hạng tốt nhưng không thiết lập được mức độ liên quan của chủ đề.
Ngữ cảnh tự động chấp nhận mọi kết quả được xác thực phù hợp với ngân sách ký tự của nó.
Việc tăng K hoặc ngân sách hàng đầu không thể giải quyết được những nguyên nhân này.

<a id="relevance-gate"></a>

## Mức độ liên quan cổng kiểm tra

Ngữ cảnh tự động hiện yêu cầu hai nội dung truy vấn riêng biệt token hoặc truy vấn đầy đủ khi chỉ còn lại một nội dung token. Hai token cung cấp sự chứng thực ngoài một từ mơ hồ. Đây là một quy tắc từ vựng thận trọng, không phải là ước tính xác suất. Truy vấn tạo khung ban đầu bị xóa trước cổng kiểm tra. Đối sánh tài liệu đọc toàn bộ đoạn trích có giới hạn chứ không phải 32 token cuối cùng của nó. Tầng tương tự vectơ hiện có vẫn là route độc lập với mức độ liên quan về mặt ngữ nghĩa. Hợp nhất cấp bậc và quyền hạn không thể ghi đè cổng kiểm tra. Tìm kiếm bộ nhớ rõ ràng giữ lại kết quả rộng rãi để kiểm tra thêm.

Giới hạn ứng viên vẫn là 80 cho mỗi kênh truy xuất. Recall vẫn trả về tối đa 12 kết quả được xác thực và hai kết quả cho nguồn gốc thông thường. Ngân sách bối cảnh không thay đổi. Các nguồn được xác thực sau khi truy xuất và chỉ được củng cố sau khi lựa chọn. Thông tin cá nhân cốt lõi vẫn giữ nguyên chính sách hồ sơ rõ ràng hiện có của họ.

Các xét nghiệm dương tính và âm tính bao gồm một kết quả yếu duy nhất, hai mươi kết quả yếu, chẩn đoán chính xác, cụm từ mạnh và bằng chứng vectơ. Kiểm tra bối cảnh kiểm tra hành vi thiếu sót, gia cố và ngân sách thông qua Recall API thực.

cổng kiểm tra cố tình hiển thị các kết quả từ vựng yếu mà đường cơ sở trước đó được coi là hữu ích. Các điểm kiểm tra sau này báo cáo tỷ lệ trúng ngữ cảnh và các trường hợp lỗi mới cùng với chỉ số Recall được yêu cầu.

<a id="recent-conversation-intent"></a>

## Mục đích cuộc trò chuyện gần đây

Tóm tắt chung yêu cầu ba tín hiệu: thời gian đã qua, ngôn ngữ hội thoại và không còn chủ đề nào.
Chuẩn hóa chia sẻ tiếng Việt có dấu và không có dấu. Các câu hỏi đàm thoại bằng tiếng Anh cũng sử dụng chính sách tương tự.
Topical questions keep their FTS/vector path. Mentioning “lần trước” alone never selects a session.

Chỉ mục chọn một phiên đủ điều kiện mới nhất, ngoại trừ phiên hiện tại, các phạm vi khác và các phiên bị chặn. Chỉ các trang lịch sử hoặc phiên nhiều tập mới đủ điều kiện. Tùy chọn ngữ nghĩa không thể thay thế cho các cuộc hội thoại bị thiếu. Hết hạn và thay thế vẫn được thực thi. Recall vẫn xác thực các phiên bản lưu trữ và quyền hạn của trang trước khi trả lại bằng chứng. Tổng quan đã lưu trữ và các trích đoạn nguồn có giới hạn bao gồm phiên mà không đưa vào mọi thư đã lưu trữ.

Các thử nghiệm bao gồm năm cụm từ tóm tắt, hai ngày lịch sử, một workspace nước ngoài mới hơn, loại trừ phiên hiện tại và store chỉ theo từng tập. Các thử nghiệm tiêu cực bao gồm các tài liệu tham khảo mang tính thời sự trong quá khứ, lịch sử đủ điều kiện trống, thời hạn sử dụng, sự ngăn chặn và thay thế. Điểm kiểm tra này thu hồi tất cả tám trường hợp tóm tắt chung. Số liệu Recall từ vựng đầy đủ trở thành 100/106.

<a id="language-and-bounded-query-expansion"></a>

## Mở rộng truy vấn ngôn ngữ và có giới hạn

Tên, biệt danh và dạng địa chỉ ưa thích có mối quan hệ chặt chẽ. Mở rộng truy vấn sử dụng FTS token hiện có và các phép chiếu hiện có. Vòng loại chủ đề vẫn cần bằng chứng. Một câu hỏi về Lan không thể chấp nhận cái tên ưa thích của người khác chỉ dựa trên mối quan hệ. Các phép nối trang phiên gần đây sử dụng chỉ mục khóa chính hiện có. Việc kiểm tra kế hoạch truy vấn SQLite đã xác nhận việc tra cứu được lập chỉ mục thay vì quét trang. Không cần thay đổi chỉ mục hoặc lược đồ mới.

Không có bảng từ đồng nghĩa nào ánh xạ mục tiêu học tập với câu trả lời của tập dữ liệu. Các vectơ tùy chọn hiện có vẫn là route cho các cách diễn giải ngữ nghĩa rộng hơn.

Việc loại bỏ ngữ pháp hiện đi trước việc gấp dấu trong ngữ cảnh cổng kiểm tra.
This preserves Vietnamese `ăn` and `bản` instead of erasing them as English `an` or Vietnamese `bạn`.
Văn bản nguồn được lưu trữ không thay đổi. Các trang được lập chỉ mục hiện tại không cần di chuyển hoặc xây dựng lại.
Cấp thủ tục cộng với token theo chủ đề cũng cung cấp hai tín hiệu độc lập cho câu hỏi về quy trình làm việc rõ ràng.

21 lỗi ban đầu hiện có bộ hồi quy chuyên dụng sử dụng các trường hợp và ID cơ sở không thay đổi. Mười sáu trường hợp đã sửa phải vượt qua mọi nhãn hiệu. Năm cách diễn giải ngữ nghĩa chưa được giải quyết giữ lại tất cả các kiểm tra về ô nhiễm và an toàn. Thử nghiệm toàn bộ kho dữ liệu thực thi Recall được yêu cầu và các mục tiêu ô nhiễm, cùng với bối cảnh cơ bản và tỷ lệ sàn đạt. Không có thử nghiệm nào khẳng định rằng lỗi chất lượng chưa được giải quyết là hành vi đúng.

Điểm kiểm tra từ vựng hiện tại: lượt truy cập 101/106 Recall, lượt truy cập ngữ cảnh 98/106, lượt hoàn thành 120/128. Bộ nhớ sai, số phiên thay thế, bộ nhớ chia sẻ sai và số lần tiêm không liên quan đều bằng 0. Tám cách diễn giải ngữ nghĩa vẫn bị loại khỏi ngữ cảnh tự động. Ba trước đó đã được thông qua các trận đấu từ vựng ngẫu nhiên. Chính sách bảo thủ này không suy ra mối quan hệ ngữ nghĩa mà việc truy xuất từ ​​vựng không thể thiết lập được.

<a id="before-and-after"></a>

## Trước và sau

[baseline](./baseline.json) ban đầu vẫn không thay đổi. Kết quả thô cuối cùng có dạng [after.json](./after.json). Cả hai lần chạy đều sử dụng cùng 128 trường hợp, 16 danh mục, kỳ vọng và chế độ từ vựng ngoại tuyến. Bộ nhớ chia sẻ sai đo lường bằng chứng ngữ cảnh bị cấm, không tạo ra xác nhận quyền sở hữu từ mô hình.

| Số liệu | Trước | Sau |
| --- | ---: | ---: |
| Tỷ lệ trúng Recall | 93/106 (87,74%) | 101/106 (95,28%) |
| Tỷ lệ bộ nhớ sai | 0/6 (0,00%) | 0/6 (0,00%) |
| Tỷ lệ lỗi bộ nhớ thay thế | 0/16 (0,00%) | 0/16 (0,00%) |
| Tỷ lệ bộ nhớ chia sẻ sai | 0/8 (0,00%) | 0/8 (0,00%) |
| Tốc độ tiêm bộ nhớ không liên quan | 8/32 (25,00%) | 0/32 (0,00%) |
| Tỷ lệ trúng bối cảnh | 93/106 (87,74%) | 98/106 (92,45%) |
| Tỷ lệ nội dung bị cấm | 0/32 (0,00%) | 0/32 (0,00%) |
| Tỷ lệ vượt qua trường hợp | 107/128 (83,59%) | 120/128 (93,75%) |

Mười sáu thất bại ban đầu bây giờ đã qua. Vẫn còn năm chiếc Recall ban đầu. Ba cách diễn giải trước đây hiện không thể lựa chọn ngữ cảnh tự động vì sự trùng lặp duy nhất của chúng là từ vựng ngẫu nhiên. Tất cả 8 lỗi còn lại đều thuộc về `semantic_paraphrase`.

| Trường hợp còn lại | Rõ ràng Recall | Ngữ cảnh tự động |
| --- | --- | --- |
| `semantic_paraphrase_001` | Cô | Bị loại trừ bởi mức độ liên quan cổng kiểm tra |
| `semantic_paraphrase_002` | Đánh | Bị loại trừ bởi mức độ liên quan cổng kiểm tra |
| `semantic_paraphrase_003` | Đánh | Bị loại trừ bởi mức độ liên quan cổng kiểm tra |
| `semantic_paraphrase_004` | Cô | Bị loại trừ bởi mức độ liên quan cổng kiểm tra |
| `semantic_paraphrase_005` | Đánh | Bị loại trừ bởi mức độ liên quan cổng kiểm tra |
| `semantic_paraphrase_006` | Cô | Bị loại trừ bởi mức độ liên quan cổng kiểm tra |
| `semantic_paraphrase_007` | Cô | Bị loại trừ bởi mức độ liên quan cổng kiểm tra |
| `semantic_paraphrase_008` | Cô | Bị loại trừ bởi mức độ liên quan cổng kiểm tra |

Năm lỗi Recall không có sự chồng chéo từ vựng có thể sử dụng được. Không có nhà cung cấp nhúng nào được cấu hình trong chế độ đánh giá này.
The three additional context failures previously matched words such as `khi` or `ngày` without establishing the requested relationship.
Không có nội dung ưu tiên chung hoặc mở rộng từ đồng nghĩa dành riêng cho câu trả lời nào được thêm vào để khôi phục các điểm đó.
Các phần nhúng thực sự cần có đánh giá riêng dành riêng cho mô hình trước khi xác nhận chất lượng ngữ nghĩa mạnh mẽ hơn.
Vectơ route hiện có được bao phủ bởi các vectơ xác định, không phải là dịch vụ trả phí.

<a id="production-scope"></a>

## Phạm vi sản xuất

- `recall.ts`: tách biệt tính năng lọc ngữ cảnh tự động khỏi tìm kiếm rõ ràng và tóm tắt cuộc hội thoại chung của route.
- `recall-index.ts`: áp dụng mức độ liên quan của cổng kiểm tra sau khi xếp hạng và chọn bằng chứng có giới hạn từ phiên trước đủ điều kiện.
- `recall-query.ts`: chuẩn hóa ngôn ngữ truy vấn, phát hiện mục đích tóm tắt và mở rộng quan hệ tên hẹp.

Bộ nhớ lưu trữ, kiến ​​trúc thu nhận dữ liệu, quyền hạn, thanh lọc, thay thế và cấu hình nhà cung cấp không thay đổi. Không có phần phụ thuộc, cơ sở dữ liệu vectơ, sinh nội dung nền hoặc API trả phí nào được thêm vào. Không có kỳ vọng về tập dữ liệu, kết quả cơ sở ban đầu hoặc xác nhận hồi quy hiện có nào bị xóa.

<a id="new-regression-coverage"></a>

## Phạm vi hồi quy mới

CLI đạt được 29 bài kiểm tra trên `recall-index.test.ts`, `recall.test.ts` và `recall-query.test.ts`. Họ kiểm tra chỉ mục thực tế và ranh giới nguồn Recall chứ không phải việc triển khai bộ nhớ thay thế. Phạm vi bao gồm từ chối không phụ thuộc vào xếp hạng, chẩn đoán chính xác, bằng chứng vectơ ngữ nghĩa, cách ly workspace, siêu phiên và ngân sách ngữ cảnh. Các bài kiểm tra phiên gần đây bao gồm ngày tháng, cụm từ thay thế, lịch sử bị thiếu, các nguồn bị chặn, các nguồn đã hết hạn và các tài liệu tham khảo mang tính thời sự trong quá khứ. Các bài kiểm tra ngôn ngữ bao gồm các giọng soạn thảo, các biến thể chính tả, từ ngữ biệt hiệu và các truy vấn tên của người thứ ba đủ tiêu chuẩn.

Đánh giá đồng hành đạt được 22 bài kiểm tra: một bài kiểm tra cho mỗi lỗi ban đầu và một bài kiểm tra mục tiêu toàn bộ kho văn bản. Các cách diễn giải chưa được giải quyết vẫn giữ nguyên các kỳ vọng ban đầu và kiểm tra độ an toàn. Họ vẫn được báo cáo là thất bại về chất lượng. Do đó, runner đầy đủ với `--strict` vẫn là cổng kiểm tra có chất lượng khác 0 cho đến khi mọi trường hợp đều trôi qua.

<a id="final-validation"></a>

## Xác nhận cuối cùng

Cam kết nguồn runtime cuối cùng: `1989b0e09da7b17e460e7c4778712a3ed823d252`. artifact ghi lại cam kết nguồn này và hàm băm tập dữ liệu không thay đổi. Hai lần chạy cuối cùng tạo ra các báo cáo giống hệt byte sau khi nhận dạng nguồn và chuẩn hóa đường dẫn tạm thời.

Kiểm tra được chạy tuần tự với một Vitest worker và tính năng song song của tệp bị vô hiệu hóa.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm -F @angela/cli test --maxWorkers 1 --no-file-parallelism --testTimeout 30000 --hookTimeout 30000` | 50 hồ sơ, 413 bài kiểm tra đã vượt qua |
| Các bài kiểm tra CLI có liên quan sau lần sàng lọc liên kết được lập chỉ mục cuối cùng | 16 hồ sơ, 154 bài kiểm tra đã vượt qua |
| `pnpm -F @angela/evals-companion test` | 2 hồ sơ, 45 bài kiểm tra đã thành công |
| `pnpm -F @angela/cli typecheck` | Đã qua sau lần thay đổi mã cuối cùng |
| `pnpm -F @angela/evals-companion typecheck` | Đã qua sau lần thay đổi mã cuối cùng |
| ESLint được nhắm mục tiêu cho các tệp CLI và eval đã thay đổi | Đã vượt qua |
| `pnpm -F @angela/cli build` | Đã qua sau lần thay đổi mã cuối cùng |
| `node packages/angela-cli/dist/bin/run.mjs --help` | Đã vượt qua |
| `pnpm lint` | Đã vượt qua, ESLint 0 lỗi và 603 cảnh báo hiện có. Oxlint 12 cảnh báo |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm typecheck --concurrency=1` | 53 nhiệm vụ đã được thông qua trước khi sàng lọc tham gia SQL cuối cùng |
| Người bạn đồng hành hoàn chỉnh cuối cùng runner, hai lần | 120/128 đã vượt qua, báo cáo byte giống hệt nhau |
| `git diff --check` | Đã vượt qua |

Lệnh CLI có liên quan sau lần sàng lọc kết nối cuối cùng là:

```bash
pnpm -F @angela/cli exec vitest run --config vitest.config.ts \
  src/memory-v2 src/recall-index.test.ts src/recall-query.test.ts src/recall.test.ts \
  src/memory.test.ts src/project-memory.test.ts src/context.test.ts \
  src/runtime src/cli.test.ts --maxWorkers 1 --no-file-parallelism \
  --testTimeout 30000 --hookTimeout 30000
```

Lần chạy CLI đầy đủ đầu tiên sử dụng thời gian chờ mặc định là 5 giây. Nó đã vượt qua 389 bài kiểm tra và hết thời gian chờ trong một bài kiểm tra căng thẳng duy trì nhiệm vụ không thay đổi, sau đó là lỗi dọn dẹp. Lần chạy hoàn chỉnh cuối cùng sử dụng kho lưu trữ CI có thời gian chờ là 30 giây và vượt qua tất cả 413 bài kiểm tra. Không có cấu hình thời gian chờ thử nghiệm hoặc mã tác vụ sản xuất nào được thay đổi.

kiểm tra kiểu dữ liệu gốc đầu tiên đã cạn kiệt vùng Node mặc định trong `stage-ui` sau 46 tác vụ thành công. Một lần thử lại tuần tự duy nhất với vùng nhớ 4 gigabyte đã hoàn thành tất cả 53 nhiệm vụ. Không có cấu hình TypeScript dự án nào được thay đổi để ngăn chặn lỗi.

Đầu ra bản dựng vẫn giữ lại cảnh báo nhập `task-commands.ts` dynamic/static hiện có. runner đồng hành đầy đủ vẫn khác 0 với `--strict` vì tám trường hợp chất lượng vẫn chưa được giải quyết. Đây là những sai sót về chất lượng được ghi lại, không phải là những kỳ vọng bị che giấu hoặc thay đổi.

<a id="reproduce"></a>

## sinh sản

```bash
pnpm -F @angela/evals-companion eval --output /tmp/recall-after.json
pnpm -F @angela/evals-companion test
pnpm -F @angela/cli exec vitest run --config vitest.config.ts \
  src/recall-index.test.ts src/recall-query.test.ts src/recall.test.ts \
  --maxWorkers 1 --no-file-parallelism
```

Sử dụng `pnpm_config_verify_deps_before_run=false` nếu pnpm cục bộ thử cài đặt phụ thuộc tự động không liên quan. Tệp nhị phân pnpm native được đặt đầu tiên trên PATH để kiểm tra kiểu Turbo gốc nhằm tránh sự cố trình khởi chạy cục bộ đã biết. Không có thông tin xác thực, lịch sử người dùng thực hoặc cuộc gọi API trả phí nào được đưa vào các báo cáo này.
