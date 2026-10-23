<a id="angela-runtime-and-memory-v2-review"></a>

# Đánh giá Angela runtime và Bộ nhớ V2

Ngày: 22-10-2026. Bản sửa đổi phép đo runtime: `a14ad69`. Bản sửa đổi xác thực lõi cuối cùng: `87f4d77`.

Phạm vi: điểm kiểm tra đánh giá cốt lõi. Việc tích hợp Electron UI được hoãn lại theo yêu cầu của người dùng. Chi nhánh đánh giá: `lighthouse2815/feat/unified-memory-v2`. Nhánh chứa các thay đổi `main` tích hợp thông qua `f1d5a33`.

<a id="architecture-before-and-after"></a>

## Kiến trúc trước và sau

Người bạn đồng hành ban đầu lưu trữ thông tin cá nhân rõ ràng, điểm kiểm tra dự án, trạng thái nhiệm vụ, kỹ năng và lưu trữ cuộc hội thoại một cách độc lập. Recall lập chỉ mục thông tin cá nhân, kỹ năng và lịch sử bằng FTS5 và các vectơ tùy chọn. Quá trình trích xuất runtime đã tồn tại ở đường cơ sở `836a68c`. Bộ nhớ V2 được xây dựng dựa trên quá trình trích xuất đó và tích hợp các thay đổi dọn dẹp tiếp theo từ `main`.

CLI và Telegram hiện sử dụng runtime được chia sẻ cho bối cảnh, công cụ, sinh nội dung, các sự kiện vòng đời và quan sát riêng tư thu nhận dữ liệu. Discord sử dụng cùng một runtime trong khi vẫn giữ chính sách chỉ có văn bản hiện có. Bộ điều hợp transport sở hữu bản trình bày, phê duyệt UI, giọng nói, nhận thức và hủy bỏ. runtime không có sự phụ thuộc vào Telegram hoặc Discord SDK.

`ContextBuilder` bao gồm các mảnh bộ nhớ, dự án, nhiệm vụ và nhận thức có giới hạn. `ToolRegistry` tổng hợp các công cụ hiện có và phân biệt thành công, thất bại đã được xác minh và đầu ra chưa được xác minh. Các sự kiện runtime mang mối tương quan yêu cầu ID và siêu dữ liệu. Bằng chứng riêng tư được chuyển trực tiếp đến tay cầm thu nhận dữ liệu sở hữu của nó. Xe buýt sự kiện giữ lại người nghe, không có lịch sử sự kiện.

Bộ nhớ hoạt động vẫn còn trong Trò chuyện, các yêu cầu hiện hoạt và các điểm kiểm tra hiện tại. Các trang theo giai đoạn, ngữ nghĩa và thủ tục chia sẻ chỉ mục truy xuất và kết nối `memory/recall.sqlite` hiện có. Bộ nhớ cá nhân, ProjectMemory, Nhiệm vụ, Phiên và Kỹ năng giữ lại các hợp đồng lưu trữ hiện có của chúng. Trình kích hoạt SQLite giữ nguyên các phép chiếu các thay đổi trạng thái, FTS của trang và vô hiệu hóa vectơ.

Quyết định về kiến ​​trúc [](../adr/angela-memory-v2.md) ghi lại phạm vi, quyền hạn, quyền riêng tư, lưu giữ và loại bỏ các bất biến.

<a id="reference-implementation"></a>

## Thực hiện tham khảo

Thanh toán bên ngoài là `../ai-memory-reference`, bản sửa đổi `1c86aebc14addccc7ac875913d565c681bfa4a50`. Nghiên cứu bao gồm mã sản xuất và các thử nghiệm trong lõi, store, hợp nhất và các hook. Trình biên dịch zero-nhà cung cấp đã được tìm thấy trong các hook, ngoài ba thùng lõi được yêu cầu.

Các hành vi mượn bao gồm các phiên bản trang, siêu phiên, mâu thuẫn tư vấn, bảo vệ quyền hạn, tăng cường, chính sách cấp độ, nén rút trích và đánh giá truy xuất xác định. Công thức duy trì sử dụng các điều khoản truy cập và độ tuổi riêng biệt. Angela áp dụng thời gian bán hủy theo từng tập là 90 ngày và điều chỉnh tăng cường SQL. Bản tóm tắt Zero-nhà cung cấp lưu giữ các kết quả, thất bại, quyết định, cam kết và chẩn đoán theo nghĩa đen đã được xác minh. Làm giàu nhà cung cấp tùy chọn sử dụng các ứng viên có cấu trúc có giới hạn và trích dẫn nguồn. Thất bại bảo tồn bộ nhớ cơ bản.

Thùng rỉ sét, sidecar, dịch vụ nhóm, dữ liệu cá nhân được Git hỗ trợ, cơ sở hạ tầng quản trị và đồng bộ hóa đã bị loại trừ. Việc hợp nhất tự động dựa trên sự tương đồng và phân cụm giấc mơ vẫn bị vô hiệu hóa cho đến khi đánh giá chất lượng rộng hơn hỗ trợ chúng. Không có phần phụ thuộc runtime bổ sung hoặc phần phụ trợ bộ nhớ thứ hai.

<a id="measurements"></a>

## Số đo

Tất cả các phép đo được thực hiện tuần tự trên cùng một máy phát triển với Node 26.11.1. Kho văn bản chứa 2.000 đoạn trích lịch sử tổng hợp, 100 trang ngữ nghĩa, 128 quan sát và 100 vectơ với 64 chiều. Việc nhúng mẫu kiểm thử sử dụng máy chủ HTTP cục bộ. Nó đo lường theo đợt và chi phí transport mà không cần suy luận mô hình. Điểm chuẩn của kho văn bản ghi lại một lần chạy đầy đủ cho mỗi lần sửa đổi. Khởi động sử dụng ba mẫu quy trình. Đây là những quan sát cục bộ. Lập lịch host, đồng bộ hóa đĩa và lỗi trang ảnh hưởng đến phần đuôi. Lạnh có nghĩa là cuộc gọi đầu tiên trong giai đoạn đo của nó. Điểm chuẩn không xóa bộ đệm đĩa của hệ điều hành.

Hai đường cơ sở phục vụ các mục đích khác nhau:

- `836a68c`: runtime với Recall kế thừa, trước Bộ nhớ V2 thu nhận dữ liệu. Khởi động sử dụng ba mẫu quy trình xen kẽ.
- `2156d51`: Bộ nhớ V2 trước WAL và phân khối. Đường cơ sở này cho phép so sánh hợp nhất và tranh chấp.

[raw trước data](../../../packages/angela-cli/benchmarks/memory-v2-before-tuning.json) và [raw sau data](../../../packages/angela-cli/benchmarks/memory-v2-after.json) bao gồm các mẫu phân vị và kế hoạch truy vấn.

| Hoạt động | Trước khi điều chỉnh, ms | Sau thưa cô |
| --- | ---: | ---: |
| Thiết lập lược đồ và mở SQLite | 355,29 | 35,52 |
| Viết SQLite p50/p95 | 13/10/16/18 | 2,90 / 5,48 |
| Quan sát viết p50/p95 | 9,73 / 158,99 | 2,44 / 4,70 |
| Recall lạnh | 5,46 | 4.02 |
| Recall ấm p50/p95 | 2,59 / 3,30 | 2,06 / 2,21 |
| Bối cảnh lạnh lùng, trong đó có việc loại bỏ 2.000 nguồn gốc cũ | 36.773,84 | 741,41 |
| Bối cảnh ấm áp p50/p95 | 2,96 / 3,68 | 2,03 / 2,57 |
| Hợp nhất phiên đầu tiên | 17,87 | 15.04 |
| Phát lại hợp nhất p50/p95 | 1,27 / 2,15 | 2,68 / 4,04 |
| Tác giả dự thi p50/p95 | 23/12 / 17,58 | 3,28 / 6,64 |

bên đọc đồng thời đã hoàn thành 1 lần đọc trước khi điều chỉnh và 344 lần đọc sau đó. Cả lần chạy cuối cùng đều không báo cáo lỗi bên đọc. Quá trình chạy WAL cho phép bên đọc phát triển trong quá trình hoạt động của người viết. Truy vấn yêu cầu hiện tại sử dụng `memory_current`. Lão hóa sử dụng chỉ số bao phủ có phạm vi `memory_aging_cursor`. Bối cảnh lạnh bao gồm việc dọn dẹp chỉ số cũ nhân tạo. Nó không đại diện cho việc chuẩn bị bối cảnh thông thường.

Legacy Recall đo được 5,00 ms khi lạnh và 3,37/5,93 ms ấm p50/p95. Mẫu hiện tại cải thiện từ vựng Recall. Các hoạt động khám phá khác nhau tùy theo tải host, do đó, đánh giá này không yêu cầu cải thiện độ trễ phổ quát. Recall được hỗ trợ bằng véc tơ đo được 11,14 ms khi lạnh và 4,47 / 12,85 ms ấm áp p50 / p95. Chỉ có 100 vectơ tham gia. Tập đoàn vector lớn hơn cần các phép đo riêng biệt. mẫu kiểm thử nhúng cục bộ đã xử lý 3.082 documents/second trước khi điều chỉnh và 3.207 sau đó. Đây không phải là kết quả thông lượng nhúng-mô hình.

| Hoạt động runtime, trung vị của ba mẫu quy trình | runtime kế thừa, ms | Hiện tại, ms |
| --- | ---: | ---: |
| Nhập khẩu runtime | 127,63 | 20.38 |
| Yêu cầu đầu tiên | 232,83 | 158,76 |
| Văn bản đầu tiên, yêu cầu lạnh lùng | 227,28 | 148,49 |
| Yêu cầu ấm áp p50 | 2,68 | 9.19 |
| Yêu cầu nồng nhiệt p95 | 4.20 | 10.72 |
| Ấm áp văn bản đầu tiên p50 | 2,45 | 5,38 |
| Ấm áp văn bản đầu tiên p95 | 3,75 | 6h30 |

Các yêu cầu nồng nhiệt hiện vẫn tiếp tục quan sát và biên soạn một tập phim. Điều đó làm tăng thêm khoảng 6,5 ms vào yêu cầu mẫu kiểm thử trung bình. Chi phí trung bình của văn bản đầu tiên tăng khoảng 2,9 mili giây. Chi phí này bảo tồn bộ nhớ an toàn khi gặp sự cố. Độ trễ nhà cung cấp sản xuất được loại trừ khỏi mẫu kiểm thử này. Những mẫu khởi động đó giữ lại một phạm vi. Thay vào đó, các phép đo vòng đời của Telegram bên dưới sẽ thực hiện bộ điều hợp thực tế.

Các mẫu khởi động [](../../../packages/angela-cli/benchmarks/runtime-startup-after.json) giữ lại mọi kết quả của quá trình. Các mẫu [ cũ](../../../packages/angela-cli/benchmarks/runtime-startup-before.json) sử dụng cùng một yêu cầu mẫu kiểm thử.

Mọi mẫu khởi động đều kết thúc với trạng thái runtime, trình xử lý sự kiện, lời nhắc route và bộ tính giờ nhắc nhở bằng 0. Điểm chuẩn bộ nhớ đã kết thúc với không có chỉ mục Recall, trình theo dõi, bộ hẹn giờ và ứng dụng khách nhúng nào. Các thử nghiệm vòng đời tài nguyên cũng bao gồm việc thu thập, phát hành, hủy lặp lại và kích hoạt tính năng dọn dẹp MCP.

<a id="memory-quality"></a>

## Chất lượng bộ nhớ

Đánh giá xác định sử dụng tám trang có ý nghĩa, 100 tập tiếng ồn và bảy thăm dò từ vựng. Nó đo lường các sự kiện, các mốc quan trọng của phiên, quyết định dự án, quy trình công việc, sở thích hiện tại, mâu thuẫn và các sự cố lịch sử được nhắm mục tiêu. Các đầu dò tương tự chạy sau khi nén nguội.

Recall@5 là 7/7 trước và sau khi nén. Các trang dự kiến ​​​​được xếp hạng đầu tiên, với các lựa chọn thay thế mâu thuẫn ở vị trí 1 và 2. Không có kết quả nào nằm trong top 5 bất ngờ xuất hiện trong kho dữ liệu nhỏ này. Kiến thức về React bị thay thế đã không còn sau khi sửa lỗi Vue rõ ràng. Các thăm dò này thiết lập các bất biến, không phải độ chính xác Recall đàm thoại chung. Chúng không đo lường hiệu suất diễn giải đa ngôn ngữ hoặc chất lượng nhúng-mô hình thực sự.

<a id="initial-core-validation-4bece26"></a>

## Xác thực lõi ban đầu (4bece26)

Kiểm tra chạy tuần tự. Vitest đã sử dụng một chiếc worker.

| Kiểm tra | Kết quả |
| --- | --- |
| Hoàn thành bộ `airi-cli` sau những thay đổi cốt lõi cuối cùng | 46 hồ sơ, 369 bài kiểm tra đã vượt qua |
| Kiểm tra gói TypeScript | Đã vượt qua |
| Kiểm tra gốc TypeScript | 53 nhiệm vụ đã được thông qua, 52 nhiệm vụ từ bộ đệm chung và CLI đã thay đổi được kiểm tra mới |
| Gốc lint | 0 lỗi, 603 cảnh báo. Cam kết các hook cũng đã kiểm tra các tệp đã thay đổi tiếp theo |
| Bản dựng `airi-cli` | Đã vượt qua |
| Được xây dựng `--help` có thể thực thi được | Đã vượt qua |
| Đầu dò chất lượng bộ nhớ | 7/7 trước và sau khi nén |
| Tài nguyên Recall và runtime sau khi tắt điểm chuẩn | Tất cả các quầy thuộc sở hữu đều bằng 0 |

Quá trình chạy Vitest gốc đã hoàn thành 367 tệp: 356 tệp đã vượt qua, 8 tệp không thành công và 3 tệp bị bỏ qua. Nó báo cáo 3.152 bài kiểm tra đã vượt qua, 19 bài kiểm tra thất bại và 5 bài kiểm tra bị bỏ qua. Quá trình này diễn ra trước các bổ sung về quyền riêng tư cuối cùng, được thông qua trong bộ CLI hoàn chỉnh cuối cùng. Các tệp lỗi không thay đổi so với bản sửa đổi bắt đầu:

- Kiểm tra Apple IAP: worktree thiếu chứng chỉ gốc mẫu kiểm thử.
- Kiểm tra lệnh tia lửa Core-agent: worktree thiếu đường dẫn phụ tự nhập được xây dựng.
- Đồng bộ nhịp được chia sẻ stage: Vite đã từ chối nội dung URL bên ngoài worktree thông qua các phần phụ thuộc được chia sẻ.
- Bộ nhớ cục bộ được chia sẻ stage: Node 26 hiển thị bộ nhớ API không khả dụng mà không có tệp sao lưu cần thiết.
- Bản kê khai cập nhật điện tử: thử nghiệm mong đợi tên AIRI artifact cũ hơn trong khi quá trình triển khai phát ra Angela.
- Thay đổi sản phẩm RevenueCat: số dư Capacitor hiện tại khác với kỳ vọng thử nghiệm.

Do đó, bài kiểm tra monorepo hoàn chỉnh cổng kiểm tra vẫn có màu đỏ. Không có thử nghiệm, xác nhận hoặc triển khai không liên quan nào được thay đổi để che giấu những lỗi này. Root kiểm tra kiểu dữ liệu ban đầu không thành công khi khởi chạy pnpm. Việc chạy tệp nhị phân native pnpm đã cài đặt đã giải quyết được lỗi môi trường đó.

<a id="reproduction"></a>

## sinh sản

Chạy các lệnh từ thư mục gốc của kho lưu trữ, từng lệnh một:

```sh
pnpm exec tsx packages/angela-cli/scripts/benchmark-memory-v2.ts WAL memory-v2-result.json
pnpm exec tsx packages/angela-cli/scripts/benchmark-runtime-startup.ts startup-result.json
pnpm -F @angela/cli exec vitest run --config vitest.config.ts src/memory-v2 --maxWorkers=1
```

`ANGELA_BENCH_SOURCE` chọn thư mục nguồn được trích xuất sử dụng cùng các phụ thuộc workspace đã cài đặt. Đối số `DELETE` yêu cầu bản sửa đổi nguồn cũ hơn. Kịch bản kiểm tra chế độ nhật ký thực tế trước khi đo. Đường cơ sở thô có trước các trường thời gian vectơ-Recall bổ sung. Độ bền vectơ mẫu kiểm thử của nó giống hệt nhau. Cơ sở dữ liệu tạm thời sẽ bị xóa khi mỗi điểm chuẩn kết thúc.

<a id="limitations-and-next-work"></a>

## Hạn chế và công việc tiếp theo

- Trò chuyện renderer hiện có của Electron chưa được di chuyển sang Node runtime này. Hợp đồng kênh desktop có sẵn nhưng việc di chuyển UI cần có bộ chuyển đổi IPC.
- Discord vẫn giữ nguyên trạng thái chỉ có văn bản hiện có và không mở bộ nhớ đồng hành store.
- Tính năng phát hiện trùng lặp bao gồm các lần phát lại chính xác và chuẩn hóa trong một xác nhận quyền sở hữu. Việc hợp nhất các yêu cầu bảo hộ độc lập dựa trên sự tương đồng không phải là tự động.
- Mâu thuẫn là những cạnh rõ ràng. Hệ thống không suy ra mọi mâu thuẫn từ ngôn ngữ tự nhiên tùy tiện.
- Làm giàu nhà cung cấp tùy chọn là một lệnh rõ ràng. Giấc mơ trôi qua và hàng đợi làm giàu nền lâu dài không được bật.
- Biên tập thông tin xác thực nhận dạng các định dạng và khai báo phổ biến. Bản lưu trữ cuộc hội thoại vẫn giữ lại vòng đời xóa phiên rõ ràng hiện có của chúng.
- Quên chặn các phép chiếu lưu trữ bị ảnh hưởng để ngăn chặn sự phục hồi. Chính sách bảo thủ này có thể loại trừ lịch sử khác khỏi cùng một phiên lưu trữ.
- Tính điểm vectơ quét các vectơ đã được cấu hình. Điểm chuẩn không thiết lập hiệu suất cho các bộ sưu tập vectơ lớn.
- Tính bền vững của vectơ sử dụng các bản cập nhật được bảo vệ cho mỗi mục. Việc phân nhóm giao dịch để nhúng ghi cần có sự thay đổi đo lường riêng biệt.
- Các phiên bản trang bị thay thế vẫn tồn tại cho đến khi có một cuộc thanh lọc rõ ràng. Các phiên chạy dài cần đo lường mức tăng trưởng lưu trữ trước khi tự động cắt bớt lịch sử.
- Các bài kiểm tra trực tiếp Telegram, Discord, giọng nói, máy ảnh và bên ngoài-nhà cung cấp vẫn yêu cầu các thiết bị và thông tin xác thực thông thường của họ.

Bước tích hợp tiếp theo, sau quá trình xem xét cốt lõi, là bộ điều hợp Electron IPC giúp duy trì hoạt động giọng nói, hình ảnh, phê duyệt và phiên của renderer. Bước chất lượng tiếp theo là một kho dữ liệu ẩn danh lớn hơn với các cách diễn giải, các yếu tố phân tâm chồng chéo và các chuỗi chỉnh sửa.

<a id="telegram-production-lifecycle-baseline-pr-1"></a>

## Đường cơ sở về vòng đời sản xuất Telegram (PR #1)

`benchmark-telegram-lifecycle.ts` thúc đẩy các bản cập nhật ngữ pháp thực sự thông qua `TelegramChat`, tính bền bỉ của phiên, runtime, Bộ nhớ V2 và SQLite. mô hình trả về văn bản SSE xác định. Máy chủ HTTP cục bộ thay thế việc phân phối Telegram. Không sử dụng API trả phí. Mỗi chế độ gửi 31 tin nhắn đến một phiên, sau đó gửi 20 tin nhắn cho bốn người dùng. So sánh được giữ lại thêm một tham chiếu cho mỗi phạm vi. Nó đại diện cho tiêu chuẩn ấm áp trước đó, không phải hành vi sản xuất cơ bản.

| Chế độ cơ bản | Yêu cầu p50/p95 | Văn bản đầu tiên p50/p95 | SQLite mở/Recall bắt đầu |
| --- | --- | --- | --- |
| Sản xuất open/send/close | 22,01 / 42,57 mili giây | 13,47 / 28,41 mili giây | 51/51 |
| Tài liệu tham khảo được giữ lại | 12,79 / 15,94 mili giây | 7,84 / 11,49 mili giây | 4/4 |

Phần trăm sử dụng 30 tin nhắn tiếp theo của một người dùng. Số lượng bao gồm tất cả 51 yêu cầu. Độ trễ yêu cầu bao gồm tính bền bỉ của bộ chuyển đổi Telegram và phân phối HTTP cục bộ. Văn bản đầu tiên dừng ở sự kiện phát trực tiếp runtime. Chuẩn bị bối cảnh bao gồm khởi tạo store, Recall và chuẩn bị công cụ. Thời gian SQLite bao gồm việc tạo thư mục, quyền, mở cơ sở dữ liệu và công việc lược đồ. Nó không cô lập thời gian của tòa nhà SQLite. Chế độ đầu tiên cũng trả tiền khởi động mô-đun quy trình. Phần trăm ấm loại trừ yêu cầu đầu tiên của từng chế độ. Lần chạy này hỗ trợ tái sử dụng ấm có giới hạn. Nó không dự đoán độ trễ mạng thực hoặc mô hình. Số đo thô: `packages/angela-cli/benchmarks/telegram-lifecycle-before.json`.

<a id="telegram-lifecycle-closure"></a>

## Đóng vòng đời của Telegram

Nguồn runtime cho các phép đo này: `1c9e3d3`, bao gồm cả việc dọn dẹp thời hạn yêu cầu rõ ràng. Node 26.11.1. Cả hai chế độ đều sử dụng cùng một runtime cuối cùng và bộ chuyển đổi Telegram thực tế. Chế độ lạnh cấu hình `maxIdle: 0`. Chế độ ấm sử dụng đường dẫn `acquire` sản xuất với `maxIdle: 32`. Đầu ra mô hình là SSE xác định. Việc gửi điện tín sử dụng HTTP API cục bộ. Không có nhà cung cấp trả phí hoặc dữ liệu người dùng sản xuất nào được tham gia.

| Hoạt động | Vòng đời lạnh lùng, ms | Vòng đời ấm áp, ms |
| --- | ---: | ---: |
| Tin nhắn đầu tiên | 111,42 | 24/10 |
| Tin nhắn thứ hai | 21.29 | 6,85 |
| 10 tin nhắn tiếp theo, yêu cầu p50/p95 | 18.18 / 29.42 | 6,93 / 10,02 |
| 30 tin nhắn tiếp theo, yêu cầu p50/p95 | 15,25 / 21,29 | 7,36 / 13,66 |
| 30 tin nhắn tiếp theo, văn bản đầu tiên p50 / p95 | 13/9 / 13,61 | 4,39 / 7,25 |
| Khởi tạo Recall p50/p95 | 2,17 / 3,75 | 0,00 / 0,00 |
| SQLite open/schema p50/p95 | 2,07 / 3,51 | 0,00 / 0,00 |
| Chuẩn bị bối cảnh p50/p95 | 5,32 / 9,52 | 1,77 / 3,82 |
| Hợp nhất theo yêu cầu p50/p95 | 2,27 / 2,83 | 0,88 / 1,36 |
| 4 người dùng, yêu cầu tuần tự p50/p95 | 13.15 / 15.58 | 8,48 / 11,31 |
| 4 người dùng đồng thời, hoàn thành hàng loạt p50 / p95 | 44,05 / 57,78 | 27,42 / 30,65 |
| SQLite mở/Recall bắt đầu, 51 yêu cầu đầu tiên | 51/51 | 4/4 |

Phần trăm bao gồm 30 yêu cầu của một người dùng sau tin nhắn đầu tiên. Số lượng open/start bao gồm 51 yêu cầu tuần tự trên bốn người dùng. Kết quả đồng thời đo lường mức độ hoàn thành của mỗi đợt bốn người dùng. Công cụ đo lường không đồng bộ cục bộ phân bổ chi phí văn bản đầu tiên và chi phí ranh giới cho mỗi yêu cầu. Tin nhắn đầu tiên bao gồm các chi phí khởi động module/JIT khác nhau. Sự khác biệt của chúng không tạo nên sự cải tiến khi bắt đầu nguội. Thời gian khởi tạo bằng 0 có nghĩa là tái sử dụng chứ không phải truy vấn SQLite không tốn phí. Truy vấn và hoạt động của thu nhận dữ liệu vẫn nằm trong các phép đo context/request. Hợp nhất bao gồm hoàn thành yêu cầu và kết thúc phiên ngay lập tức ở chế độ nguội. Đẩy ấm củng cố phiên kết thúc sau đó. Thời gian tuyệt đối khác nhau giữa các lần chạy. So sánh các chế độ trong lần chạy cuối cùng này. Đường cơ sở ban đầu vẫn có sẵn ở trên.

Sau khi tự động trục xuất TTL, trường hợp ấm sẽ mở lại sau **13,06 mili giây**, với văn bản đầu tiên sau **9,10 mili giây**. Yêu cầu đã mở SQLite một lần và khởi động Recall một lần. Trước yêu cầu đó, các trạng thái, chỉ mục, trình theo dõi và bộ hẹn giờ Recall được lưu trong bộ nhớ đệm đều bằng 0. Lời nhắc route vẫn hoạt động để gửi thông báo và đóng khi host tắt. Điểm chuẩn sử dụng TTL một giây để thực hiện hết hạn. Mặc định sản xuất vẫn còn mười phút. Mặc định đó khớp với thời gian tồn tại ở trạng thái cấp phép hiện tại của Telegram. mẫu kiểm thử không xác định TTL tối ưu cho lưu lượng truy cập thực.

Giới hạn nhàn rỗi mặc định là 32. Mức tối đa bên trong là 64. LRU chỉ áp dụng sau khi tham chiếu cuối cùng và yêu cầu hiện hoạt kết thúc. Giới hạn ngữ cảnh hoạt động hiện tại vẫn là tám. Các mục đang hoạt động, không hoạt động và ngừng hoạt động cùng nhau không thể vượt quá `maxIdle + 8`. Một bộ đếm thời gian nhàn rỗi thuộc về host. Việc mua lại chỉ chờ đợi sự nghỉ hưu của cùng một danh tính chính xác. Nếu tổng dung lượng đã đầy, bối cảnh mới sẽ bị từ chối. Hàm tạo cấu hình TTL/cap thông qua `RuntimeOptions.telegramSessions`. Nó có thể vô hiệu hóa khả năng lưu giữ bằng `maxIdle: 0`.

<a id="resource-ownership"></a>

### Quyền sở hữu tài nguyên

Tài nguyên mẫu kiểm thử điều khiển các chu trình runtime acquire/send/release trực tiếp với các quá trình vận chuyển SQLite thực và MCP trong bộ nhớ. Nó sử dụng năm người dùng store, năm lời nhắc route và một LRU nhàn rỗi bốn mục. Nó không bao gồm chi phí Telegram HTTP. Mỗi Recall đã đóng phải báo cáo tài nguyên bằng 0 trước khi công cụ của chủ sở hữu trực tiếp phát hành tham chiếu của nó. Do đó, báo cáo phát hiện chủ sở hữu Recall mồ côi sau khi trục xuất bản đồ, cũng như các tài nguyên trong bộ đệm hiện tại.

| Điểm kiểm tra | Nhàn rỗi / chỉ mục / người theo dõi | Bộ hẹn giờ Recall / bộ hẹn giờ nhàn rỗi | Khách hàng / người nghe MCP | Nhắc nhở route / bộ hẹn giờ | Thu hồi trực tiếp |
| --- | --- | --- | --- | --- | --- |
| 100 chu kỳ | 4/4/4 | 4/1 | 0 / 0 | 5/1 | 4 |
| 500 chu kỳ | 4/4/4 | 4/1 | 0 / 0 | 5/1 | 4 |
| 1000 chu kỳ | 4/4/4 | 4/1 | 0 / 0 | 5/1 | 4 |
| Tắt máy lần cuối | 0 / 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 |

Lần chạy cuối cùng đã hoàn thành 1.000 chu kỳ trong 8,94 giây và đóng chính xác 1.000 máy khách MCP. Yêu cầu, bộ điều khiển runtime, MCP clients/servers, trực tiếp Thu hồi, nhúng, gỡ bỏ mục nhập, trình nghe và mọi bộ đếm thời gian sở hữu đều bằng 0 sau khi tắt máy. Bộ đếm thời hạn của Telegram cũng bằng 0 sau khi phát hành yêu cầu và tắt bộ điều hợp cuối cùng trong điểm chuẩn bộ điều hợp. Không có việc thu gom rác hoặc gọi lại FinalizationRegistry là điều kiện đúng đắn.

<a id="correctness-and-validation"></a>

### Tính chính xác và xác nhận

- Bộ CLI cục bộ đầy đủ: **Kiểm tra 384/384, 47 tệp**, trước khi điều chỉnh bộ hẹn giờ thời hạn cuối cùng.
- Theo dõi Telegram/lifecycle sau lần điều chỉnh đó: **Thử nghiệm 34/34**. Chúng bao gồm thành công, hủy, đặt lại, trục xuất và tắt host được chia sẻ.
- `pnpm -F @angela/cli typecheck`: đã thông qua sau khi điều chỉnh thời hạn.
- `pnpm typecheck --concurrency=1`: **Tác vụ 53/53**, 52 tác vụ được lưu vào bộ nhớ đệm, với CLI đã thay đổi được kiểm tra lại.
- Root kiểm tra kiểu dữ liệu yêu cầu tệp nhị phân pnpm native được cài đặt trên PATH vì trình bao bọc cục bộ thiếu shebang.
- `pnpm -F @angela/cli build` và `--help` có thể thực thi được đã xây dựng: đã vượt qua sau khi điều chỉnh thời hạn.
- `pnpm exec eslint packages/angela-cli/src packages/angela-cli/scripts`: đã vượt qua mà không có lỗi gói nào.
- `pnpm lint`: đã qua. ESLint báo cáo 0 lỗi và 603 cảnh báo. Giai đoạn Oxlint báo cáo 12 cảnh báo.
- `.github/workflows/cli-core.yml` chạy CLI cổng kiểm tra đầy đủ trên PR #1 với một công việc và một Vitest worker.
- [ chạy lõi thành công đầu tiên](https://github.com/lighthouse2815/Angela/actions/runs/39723476242) đã xác minh cài đặt mới và các bản dựng tiên quyết.
- Việc đóng [runtime run](https://github.com/lighthouse2815/Angela/actions/runs/39724072409) đã vượt qua CLI cổng kiểm tra đầy đủ sau khi dọn dẹp thời hạn.
- Các bản cập nhật chi nhánh sau này chạy lại cổng kiểm tra. Kiểm tra PR hiển thị kết quả cho đầu hiện tại.

Các thử nghiệm xác minh một lần khởi động trên nhiều tin nhắn Telegram, tách người dùng, đặt lại, TTL, LRU, hủy và tắt máy. Họ cũng xác minh giới hạn tám lần hoạt động bên cạnh bộ đệm không hoạt động đầy đủ và việc thu thập lại trong khi chủ sở hữu trước đó nghỉ hưu. Ký ức cá nhân ấm áp và các tập phim luôn bị cô lập bởi store riêng tư. Recall/search rõ ràng truy xuất các tập sau khi tái sử dụng ấm, trục xuất TTL và khởi động lại runtime. Tập của phiên hiện tại vẫn bị loại khỏi bối cảnh tự động vì lịch sử hoạt động liên tục đã sở hữu các lượt đó. Chính sách đó vẫn không thay đổi. Các đầu dò chất lượng Bộ nhớ V2 hiện có và tất cả các bài kiểm tra runtime hiện có vẫn là một phần của bộ CLI đầy đủ.

Chẩn đoán của người quan sát giữ lại tối đa 16 bản ghi siêu dữ liệu và một bộ đếm lỗi bão hòa. Việc gửi cảnh báo được giới hạn ở 16 lệnh gọi lại trên mỗi host. Cả ngoại lệ gọi lại của người quan sát và chẩn đoán đều không đi vào đường dẫn lỗi yêu cầu. Các chuỗi lỗi, prompt và tải trọng sự kiện đều bị loại trừ. Tắt máy sẽ xóa siêu dữ liệu được giữ lại và tham chiếu gọi lại.

Tác vụ không thay đổi việc triển khai lưu trữ, cấp quyền, thanh lọc, nén hoặc làm giàu Bộ nhớ V2. 19 lỗi Vitest gốc hiện có vẫn nằm ngoài nhiệm vụ này. Chúng không được sửa đổi, bỏ qua hoặc chạy lại dưới dạng cổng kiểm tra cốt lõi. desktop IPC, mở rộng bộ nhớ đồng hành Discord, giấc mơ tự động và công việc LLM trong nền vẫn bị trì hoãn. trực tiếp Telegram transport, models/embeddings thực, giọng nói và máy ảnh yêu cầu kiểm tra sản xuất riêng biệt.

Bằng chứng thô: [Vòng đời của Telegram](../../../packages/angela-cli/benchmarks/telegram-lifecycle-after.json), [chu kỳ tài nguyên](../../../packages/angela-cli/benchmarks/session-resources-after.json) và [lệnh sao chép](../../../packages/angela-cli/benchmarks/README.md#telegram-lifecycle-closure).
