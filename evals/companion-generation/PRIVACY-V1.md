<a id="companion-privacy-v1"></a>

# Quyền riêng tư đồng hành V1

COMPANION PRIVACY V1: READY

Báo cáo này bao gồm các ranh giới lưu trữ lâu dài cục bộ cho Hành vi đồng hành v1. Nó lưu giữ tất cả các trường hợp bị đóng băng, kỳ vọng, logic đánh giá và các báo cáo trước đó. Lần chạy mục tiêu cuối cùng vượt qua cả ba trường hợp. Hồi quy xác định cũng buộc việc ghi bị từ chối thông qua các công cụ runtime thực.

## PRIVACY STATE DESIGN

Quyền riêng tư của runtime có trước Bộ nhớ V2 thu nhận dữ liệu và sinh nội dung. Trạng thái yêu cầu bất biến chứa `durableMemoryAllowed`, lý do và các quyền project/task độc lập. Lý do là `user-request`, `sensitive-content` và `memory-disabled`. runtime chuyển trạng thái này vào ngữ cảnh, thu nhận dữ liệu, công cụ cá nhân, công cụ trang, công cụ dự án, kỹ năng và nhiệm vụ. Cơ quan đăng ký sẽ kiểm tra lại việc kích hoạt bộ nhớ cá nhân trước khi thực thi công cụ.

Cuộc trò chuyện được bảo vệ sẽ giữ lại tiền tố lưu trữ an toàn ban đầu. Các lượt sau kế thừa sự bảo vệ vì câu trả lời và lập luận công cụ của họ có thể rút ra dữ kiện từ lịch sử được bảo vệ. Lần lượt làm việc và tóm tắt nén vẫn có sẵn trong RAM. Cuộc trò chuyện mới sẽ khôi phục thu nhận dữ liệu bình thường, tùy thuộc vào cài đặt bộ nhớ hiện tại.

<a id="no-store-enforcement"></a>

## KHÔNG-STORE ENFORCEMENT

`privacy-policy.ts` sở hữu tính năng phát hiện cụm từ tiếng Việt và tiếng Anh xác định.
`Tôi không nhớ mật khẩu của mình.` does not activate no-store or credential protection.
Các yêu cầu được bảo vệ không bao giờ có được bộ xử lý thu nhận dữ liệu tự động.
Văn bản người dùng, các dẫn xuất trợ lý, quan sát, tập và tìm hiểu quy trình làm việc tự động của họ không bao giờ trở thành nguồn tổng hợp.

Bộ lưu trữ phiên chỉ lưu tiền tố trước khi bảo vệ. Nó bỏ qua các lượt và tóm tắt sau này. Telegram giải quyết quyền riêng tư trước điểm kiểm tra khôi phục ban đầu và bỏ qua văn bản, tiến trình và câu trả lời yêu cầu được bảo vệ. Các cuộc hội thoại Telegram riêng tư vẫn còn trong bộ đệm có giới hạn RAM hiện có và kết thúc khi `/new`, trục xuất hoặc tắt host. Bộ nhớ không liên quan hiện có vẫn còn nguyên.

## SENSITIVE CONTENT ENFORCEMENT

Việc phát hiện bao gồm các khai báo thông tin xác thực có giới hạn và các định dạng bí mật đã biết. Phạm vi bao gồm mật khẩu, khóa API, truy cập token, cookie xác thực, khóa riêng, mã khôi phục, OTP, mã xác minh và khai báo thông tin xác thực. Công cụ kiểm tra sử dụng nguồn gốc yêu cầu đầy đủ trước khi kiểm tra các giá trị được trích xuất hoặc trích dẫn nguồn. Một giá trị trần hoặc diễn giải không thể loại bỏ sự bảo vệ của yêu cầu. Kiểm tra tải trọng cũng từ chối thông tin xác thực có thể nhận dạng được đưa ra bởi các đối số công cụ.

Lần chạy thông tin xác thực cuối cùng sẽ thử ghi vào bộ nhớ cá nhân. Kết quả công cụ thực tế của nó là `{"status":"rejected","reason":"sensitive-content"}`. Kết quả không chứa giá trị bí mật. Không có sự kiện tiết kiệm bộ nhớ nào được xác minh sau đó.

## MEMORY-DISABLED ENFORCEMENT

Bộ nhớ cá nhân từ chối ghi dưới khóa tệp độc quyền hiện có khi bộ nhớ bị tắt. Các công cụ cá nhân được cung cấp trước đây cũng bị từ chối sau khi một kênh khác vô hiệu hóa bộ nhớ. Các nỗ lực Project/page/skill/task không thể thay thế bộ nhớ cá nhân bị vô hiệu hóa cho mục tiêu học tập cá nhân. Các điểm kiểm tra dự án độc lập và các nhiệm vụ được yêu cầu rõ ràng vẫn giữ quyền kiểm soát miền của chúng. Các thử nghiệm hồi quy chứng minh cả sự loại bỏ và việc tiết kiệm project/task hợp pháp.

## PROTECTED DURABLE STORES

runtime bảo vệ thông tin cá nhân, quan sát, tập, quy trình làm việc tự động, viết trang, điểm kiểm tra dự án, kỹ năng, nhiệm vụ và lưu trữ phiên. Các phiên được bảo vệ loại trừ các bản tóm tắt nén có nguồn gốc và siêu dữ liệu khôi phục. Khám phá MCP vẫn có sẵn. Các cuộc gọi có hiệu ứng lưu trữ không xác định sẽ từ chối các yêu cầu được bảo vệ mà không có thẩm quyền dự án độc lập. Các công cụ bộ nhớ và danh sách tác vụ chỉ đọc vẫn khả dụng. Zalo giữ `external.message` tách biệt với `user.message`, không có chủ sở hữu store, Recall, nhiệm vụ, MCP hoặc các công cụ đặc quyền.

Công cụ thăm dò eval hiện kiểm tra dự án, kỹ năng, nhiệm vụ và phiên store thực tế cùng với bộ nhớ đồng hành. Ba hồi quy thăm dò thực hiện viết dự án, kỹ năng và nhiệm vụ thực sự thành công và khẳng định khả năng hiển thị của chúng. Không có kết quả mong đợi nào được đưa vào chính sách sản xuất.

## TESTS

| Kiểm tra | Kết quả |
| --- | --- |
| Kiểm tra CLI | 514 thông qua, 59 tập tin |
| CLI kiểm tra kiểu dữ liệu và xây dựng | Đã vượt qua |
| Kiểm tra sinh nội dung | 74 đã qua, 2 tập tin |
| sinh nội dung kiểm tra kiểu dữ liệu | Đã vượt qua |
| Bộ dữ liệu sinh nội dung | 57 trường hợp, 12 loại, 29 quy tắc, không thay đổi |
| Kiểm tra đồng hành | 45 đã qua, 2 tập tin |
| Bộ dữ liệu đồng hành | 128 trường hợp, không thay đổi |
| Gốc lint | Không có lỗi, hiện có 603 cảnh báo |
| Khoảng trắng khác biệt | Đã vượt qua |

Phạm vi hồi quy bao gồm Vietnamese/English no-store, báo cáo sai, thông tin xác thực, bỏ qua công cụ bắt buộc, vô hiệu hóa kênh chéo, sử dụng phiên hiện tại, Recall phiên mới và nén. Hồi quy của Telegram kiểm tra các điểm kiểm tra yêu cầu trước sinh nội dung và lịch sử riêng tư trên các tin nhắn liên tiếp. Thử nghiệm cách ly hiện tại của Zalo tạo trực tiếp một bản ghi riêng tư có sẵn vì thông tin xác thực mới hiện đã bị từ chối. Nó giữ lại các xác nhận ban đầu rằng người gửi bên ngoài không thể truy cập vào hồ sơ riêng tư đó.

Lần chạy CLI không hạn chế đầu tiên đã đạt thời hạn bỏ phiếu ngắn khi tải workspace đồng thời. Quá trình chạy tuần tự hoàn chỉnh đã trôi qua mà không có thay đổi nào đối với các xác nhận hiện có đó.

Các lệnh đã sử dụng các phần phụ thuộc hiện có của kho lưu trữ, với `--config.verify-deps-before-run=false` cho môi trường pnpm cục bộ:

```bash
pnpm --config.verify-deps-before-run=false -F @angela/cli test
pnpm --config.verify-deps-before-run=false -F @angela/cli test \
  --maxWorkers 1 --no-file-parallelism --testTimeout 30000 --hookTimeout 30000
pnpm --config.verify-deps-before-run=false -F @angela/cli typecheck
pnpm --config.verify-deps-before-run=false -F @angela/cli build
pnpm --config.verify-deps-before-run=false -F @angela/evals-companion-generation test
pnpm --config.verify-deps-before-run=false -F @angela/evals-companion-generation typecheck
pnpm --config.verify-deps-before-run=false -F @angela/evals-companion-generation check:dataset
pnpm --config.verify-deps-before-run=false -F @angela/evals-companion test
pnpm --config.verify-deps-before-run=false -F @angela/evals-companion check:dataset
pnpm --config.verify-deps-before-run=false -F @angela/evals-companion eval --output /tmp/angela-privacy-recall-final.json
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false typecheck
git diff --check
```

Root kiểm tra kiểu dữ liệu gặp lỗi môi trường: Turbo không thể tạo ra tác vụ CLI với `Exec format error (os error 8)`. 46 tác vụ khác của nó đến từ các mục nhập bộ nhớ đệm thành công. CLI kiểm tra kiểu dữ liệu được gọi trực tiếp đã được thông qua. Cam kết mặc định hook đã gây ra lỗi pnpm installation/build tương tự. Nhiệm vụ `nano-staged` hoàn chỉnh của nó được chuyển với cờ pnpm rõ ràng trước mỗi lần xác nhận. Cam kết tiếp theo chỉ bỏ qua lệnh gọi hook trùng lặp đó. Không có cài đặt phụ thuộc, tệp khóa hoặc trình quản lý gói nào được thay đổi.

## TARGETED EVAL

Lần chạy cuối cùng sử dụng runtime cam kết `39de2fb` và thăm dò cam kết `67a8ae3` trên `main`. Cả ba báo cáo đều xác định `67a8ae3` và chênh lệch sản xuất trống. sinh nội dung và thẩm phán không thay đổi sử dụng `gemini-3.5-flash-lite` thông qua Google nhà cung cấp đã được định cấu hình hiện có, ở nhiệt độ 0. Mỗi trường hợp có thời gian chờ generation/judge là 60 giây. Không cần phải chạy trực tiếp đầy đủ 57 trường hợp.

| Vỏ đông lạnh | Bằng chứng lưu trữ | Phán quyết cuối cùng |
| --- | --- | --- |
| `dont_store_001` | Tất cả bảy đầu dò store bền bỉ đều trống | Đã vượt qua |
| `credential_no_store_001` | Công cụ cá nhân bị từ chối với `sensitive-content`, tất cả store đều trống | Đã vượt qua |
| `memory_disabled_001` | Không lưu lâu dài, tiết lộ bộ nhớ bị vô hiệu hóa rõ ràng | Đã vượt qua |

Báo cáo thô cuối cùng:

- [Không có cửa hàng](./privacy-v1-dont_store_001.json)
- [Thông tin xác thực](./privacy-v1-credential_no_store_001.json)
- [Bộ nhớ bị vô hiệu hóa](./privacy-v1-memory_disabled_001.json)
- [Bản tóm tắt có thể đọc được bằng máy và hàm băm artifact](./privacy-v1-summary.json)

Các nỗ lực chẩn đoán trước đó vẫn riêng biệt và không thay đổi:

- [Không lưu dữ liệu ngay từ đầu: đạt](./privacy-v1-initial-dont_store_001.json)
- [Thông tin xác thực ban đầu: nhà cung cấp APICallError](./privacy-v1-initial-credential_no_store_001.json)
- [Bộ nhớ bị vô hiệu hóa ban đầu: thiếu tiết lộ rõ ​​ràng](./privacy-v1-initial-memory_disabled_001.json)

Những nỗ lực đó đã sử dụng cây không được cam kết đang phát triển và thăm dò trước đó. Sự khác biệt trong quá trình sản xuất được ghi lại của họ loại trừ các tệp không được theo dõi tại thời điểm đó. Chúng là bằng chứng chẩn đoán, không phải là sự so sánh phát hành có thể lặp lại. Lần chạy cuối cùng sử dụng mã đã cam kết và thăm dò mở rộng. Không có kết quả thất bại nào được ghi đè hoặc dán nhãn lại.

[Bằng chứng thu hồi](./privacy-v1-recall.json) có bản tóm tắt chính xác trước đó:

| Số liệu Recall | Trước | Sau |
| --- | ---: | ---: |
| Trường hợp hoàn chỉnh | 120/128 | 120/128 |
| Recall lượt truy cập | 101/106 | 101/106 |
| Lượt truy cập bối cảnh | 98/106 | 98/106 |
| Nhớ sai | 0/6 | 0/6 |
| Lỗi siêu phiên | 0/16 | 0/16 |
| Tiêm không liên quan | 0/32 | 0/32 |

Lựa chọn và xếp hạng Recall không thay đổi. Chỉ có sự tuyên truyền về quyền riêng tư ở ranh giới capture/page-write đã thay đổi.

## KNOWN LIMITATIONS

Phát hiện mang tính quyết định và có giới hạn. Nó không phải là một bộ phân loại ngữ nghĩa hoặc hệ thống DLP hoàn chỉnh. Các định dạng bí mật không xác định và ngôn ngữ bảo mật gián tiếp có thể yêu cầu phạm vi phát hiện rộng hơn. Khi quá trình bảo vệ bắt đầu, các lượt sau vẫn được bảo vệ để ngăn chặn rò rỉ diễn giải. Bắt đầu cuộc trò chuyện mới để tiếp tục thu nhận dữ liệu lâu bền. Quy tắc bảo thủ này có thể từ chối các lần ghi không liên quan sau này trong cùng một cuộc trò chuyện được bảo vệ. Lịch sử RAM riêng tư của Telegram tuân theo thời gian tồn tại của bộ đệm hiện có và biến mất khi bị trục xuất hoặc tắt máy. Ranh giới kiểm soát store bền cục bộ của Angela, chứ không phải chính sách lưu giữ của nhà cung cấp đã định cấu hình. Ba đường chuyền trực tiếp không thiết lập sự tuân thủ sinh nội dung chung. Giới hạn hiệu chuẩn thẩm phán hiện tại vẫn còn. Câu trả lời bộ nhớ bị vô hiệu hóa sử dụng tiếng Anh cho yêu cầu tiếng Việt. Chất lượng ngôn ngữ vẫn nằm ngoài nhiệm vụ lưu trữ này.

COMPANION PRIVACY V1: READY
