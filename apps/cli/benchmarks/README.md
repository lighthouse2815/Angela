<a id="angela-runtime-memory-measurements"></a>

# Đo bộ nhớ Angela runtime

Các phép đo và giới hạn độ trễ của bộ nhớ V2 có trong báo cáo [ của Bộ nhớ V2](../../../docs/ai/audits/angela-memory-v2.md).

Chạy từng kịch bản trong quy trình Node mới với tính năng thu thập rác rõ ràng:

```sh
node --expose-gc --import tsx apps/cli/scripts/benchmark-memory.ts cli
node --expose-gc --import tsx apps/cli/scripts/benchmark-memory.ts telegram
ANGELA_BENCHMARK_CYCLES=2560 node --expose-gc --import tsx apps/cli/scripts/benchmark-memory.ts release
node --import tsx apps/cli/scripts/benchmark-entry.ts
```

Điểm chuẩn sử dụng bộ nhớ tạm thời, trò chuyện thực tế sinh nội dung, Recall, tác vụ store, phiên và trình xử lý cập nhật Telegram. Ranh giới mạng mô hình và Telegram trả về Responses xác định. Điểm chuẩn điều phối không sử dụng API, thiết bị hoặc MCP transport được kết nối. Mỗi kịch bản Telegram hoàn thành một yêu cầu và giải phóng khóa phiên của nó trước người dùng tiếp theo. Các phép đo bao gồm `rss`, `heapUsed`, `heapTotal`, `external` và các loại tài nguyên được tham chiếu hoạt động sau GC. Node không báo cáo bộ tính giờ không được tham chiếu thông qua `getActiveResourcesInfo`. Các bài kiểm tra vòng đời của runtime sẽ kiểm tra riêng các tài nguyên được sở hữu. Điểm chuẩn đầu vào khởi chạy CLI thực tế với MCP tích hợp mặc định và đầu vào theo đường ống. Tải trước quan sát đầu vào nhàn rỗi và quá trình hoàn thành. Các phép đo của nó bao gồm quy trình CLI, nhưng loại trừ quy trình con MCP. Cả điểm chuẩn đều không đo kích thước bộ nhớ GPU hoặc kích thước phản hồi trực tiếp-mô hình. Điểm chuẩn điều phối cũng ghi lại bộ nhớ Telegram trong khi yêu cầu mô hình đầu tiên của nó đang hoạt động. Điểm chuẩn phát hành sử dụng bộ đếm quyết toán mà không giữ lại phiên hoặc đối tượng Recall.

<a id="initial-audit"></a>

## Kiểm toán ban đầu

| Mô-đun | Trạng thái và tuổi thọ được giữ lại |
| --- | --- |
| `bin/run.ts` | Bộ nhớ háo hức, ProjectMemory, Recall, Máy ảnh, Nhiệm vụ, bộ lập lịch, nhà cung cấp và Trò chuyện trong suốt thời gian sử dụng CLI. MCP kết nối trước khi nhập. |
| `chat.ts` | Cuộc trò chuyện đầy đủ vẫn là trực tiếp. Việc nén bối cảnh chỉ làm giảm các yêu cầu gửi đi. Yêu cầu bộ nhớ sao chép các tham chiếu lần lượt. |
| `memory.ts` | Thông tin được sao lưu trên đĩa, giới hạn ở 50 mục. Yêu cầu đóng công cụ sẽ giữ lại ảnh chụp nhanh cho đến khi sinh nội dung hoàn tất. |
| `project-memory.ts` | Một điểm kiểm tra đĩa có giới hạn. Khám phá gốc Git bắt đầu một tiến trình con tồn tại trong thời gian ngắn. |
| `recall.ts` | Chỉ mục SQLite, một trình theo dõi, một khoảng thời gian, ứng dụng khách nhúng từ xa tùy chọn, bộ đệm workspace và các đoạn trích được chọn cho mỗi phiên bản. |
| `tasks.ts`, `task-tools.ts` | Các tác vụ được sao lưu bằng đĩa. Đăng ký bộ lập lịch cần dọn dẹp. Các định nghĩa và bối cảnh đồng hồ có thể theo yêu cầu cục bộ. |
| `reminder-scheduler.ts` | Một bộ hẹn giờ điều chỉnh cho mỗi store, bộ hẹn giờ lease tạm thời trong quá trình phân phối và đăng ký tác vụ. |
| `telegram.ts` | Công việc biến mất sau khi hoàn thành. Quyền trò chuyện, ứng dụng khách MCP và lời hứa đồng hành vẫn tồn tại cho đến khi host ngừng hoạt động. |
| `telegram-companion.ts` | Bộ nhớ háo hức, Nhiệm vụ, Recall, thông báo và lập lịch cho mỗi người dùng được phép, bao gồm cả người dùng không hoạt động. |
| `discord.ts` | Cuộc trò chuyện và khóa là yêu cầu cục bộ. Mỗi hàng đợi kênh có bốn vị trí, nhưng số lượng kênh đồng thời không có giới hạn rõ ràng. |
| `mcp.ts` | Lược đồ khám phá, bộ tên, ứng dụng khách và lời hứa phê duyệt nối tiếp vẫn còn cho đến khi bộ điều hợp đóng. |
| `sessions.ts` | Người viết phản chiếu toàn bộ tin nhắn di động trong khi Trò chuyện cũng sở hữu cuộc hội thoại đã chuyển đổi. Danh sách đọc tất cả các phiên đồng thời. |
| `skills.ts` | Bộ đệm ẩn dấu tệp giữ lại hướng dẫn đầy đủ cho mọi kỹ năng được liệt kê mà không bị trục xuất. |

Thiết bị thoại khởi động theo yêu cầu. Nhập CLI tĩnh vẫn tải các mô-đun thoại, máy ảnh, đánh giá và Telegram để khởi động chỉ bằng văn bản. Phần nhúng yêu cầu `ANGELA_EMBEDDING_MODEL`. Không có mô hình cục bộ nào được tải tự động.

<a id="results"></a>

## Kết quả

Nguồn cơ sở: `d430e76`, trước khi di chuyển runtime. Cuộc kiểm tra ban đầu mô tả `d48991f`. Nguồn cơ sở đã được trích xuất vào một thư mục tạm thời riêng biệt và sử dụng cùng các phần phụ thuộc workspace đã cài đặt. Phép đo cơ bản hook đã thu được mẫu Telegram trên chuyến bay giống như tập lệnh cuối cùng. Hành vi của ứng dụng không thay đổi. Tất cả các tệp JSON đều ghi byte trên cùng một máy với Node 26.11.1 và GC rõ ràng. Ảnh chụp nhanh phép đo cuối cùng chứa các thay đổi của runtime thông qua `ba21572`. Nó loại trừ các thay đổi `memory-v2` đồng thời và khôi phục `recall-index.ts` từ `836a68c` cho so sánh này. Các kịch bản CLI bao gồm khởi động, một tin nhắn và 20 tin nhắn trong một cuộc trò chuyện đang hoạt động.

| Kịch bản | RSS trước → sau, MiB | Heap được sử dụng trước → sau, MiB |
| --- | --- | --- |
| `entry.idle` | 202.82 → 169.37 | 40.95 → 31.54 |
| `entry.message.1` | 205.24 → 179.28 | 43.06 → 39.19 |
| `cli.idle` | 179.26 → 164.73 | 39.16 → 35.70 |
| `cli.message.1` | 180.94 → 170.49 | 41.02 → 39.01 |
| `cli.message.20` | 181.07 → 170.99 | 41.85 → 39.92 |
| `telegram.idle` | 173.06 → 156.82 | 39.21 → 35.61 |
| `telegram.user.1.active` | 175.62 → 163.51 | 41.09 → 38.56 |
| `telegram.user.1` | 176.00 → 164.14 | 41.41 → 39.01 |
| `telegram.users.24` | 177.00 → 164.29 | 43.07 → 40.27 |

Các tệp thô cũng chứa `heapTotal` và `external`. RSS thay đổi tùy theo việc đặt trước vùng nhớ heap V8, hoạt động JIT và bộ cấp phát native. Hai phép đo CLI sử dụng bộ kiểm thử khác nhau. Chỉ so sánh từng kịch bản với đường cơ sở tương ứng của nó. Những hoạt động xác định này thiết lập đường cơ sở điều phối chứ không phải đảm bảo hiệu suất thống kê.

Sau 2.560 chu kỳ create/send/release, trạng thái runtime, người nghe, lời nhắc route và bộ hẹn giờ nhắc nhở sở hữu vẫn ở mức 0. Mức sử dụng heap là 39,36 MiB sau 20 chu kỳ và 38,27 MiB sau 2.560 chu kỳ. RSS đạt đỉnh 189,49 MiB ở 1.280 chu kỳ và quay trở lại 133,00 MiB ở 2.560 chu kỳ. Lệnh gọi lại quyết toán đã quan sát thấy 2.559 phạm vi được phát hành và đối tượng Recall tại mẫu đó. Thời gian hoàn thiện vẫn được kiểm soát bởi V8. Các thử nghiệm tập trung cũng xác minh các máy khách Recall indexes/watchers/timers, MCP đã đóng, trục xuất Telegram, giới hạn hàng đợi Discord và lập lịch nhắc nhở được chia sẻ.

<a id="remaining-hotspots"></a>

## Các điểm nóng còn lại

- Phiên JSON phân tích cú pháp và thay thế nguyên tử tạm thời hiện thực hóa toàn bộ lịch sử đĩa. Trạng thái làm việc không giữ lại ảnh chụp nhanh di động đó.
- Lượt trợ lý mới nhất và phần tiếp theo của native nhà cung cấp vẫn được duy trì cho đến khi nén bối cảnh. Một kết quả công cụ lớn vẫn có thể tiêu tốn bộ nhớ yêu cầu đáng kể.
- Recall vẫn thực hiện đồng bộ hóa SQLite hiện có và các yêu cầu nhúng từ xa tùy chọn. Mỗi bối cảnh logic hoạt động sở hữu một vòng đời.
- Sổ đăng ký nhà cung cấp và mã mô-đun đã nhập vẫn còn trong bộ đệm mô-đun của Node. Mã giọng nói vẫn được lưu vào bộ nhớ đệm sau lần sử dụng rõ ràng đầu tiên.
- Discord giữ siêu dữ liệu kênh và bang hội cổng mà SDK yêu cầu. Lịch sử tin nhắn không được lưu vào bộ nhớ đệm và bộ nhớ đệm user/member có giới hạn.
- Việc gửi lời nhắc sẽ giữ lại route nhỏ để người dùng được ủy quyền lưu giữ thông báo nền. Nó không loại bỏ lời nhắc với trạng thái hội thoại.

Không có EventStore, lịch sử sự kiện, nhóm worker, phần phụ thuộc hoặc mô hình cục bộ nào được thêm vào.


<a id="telegram-lifecycle-closure"></a>

## Đóng vòng đời của Telegram

Quá trình kiểm tra Bộ nhớ V2 chứa các kết quả của vòng đời hiện tại và các giới hạn của chúng. Các phép đo RSS cũ hơn ở trên mô tả runtime được phát hành ngay trước đó.

```sh
pnpm exec tsx apps/cli/scripts/benchmark-telegram-lifecycle.ts apps/cli/benchmarks/telegram-lifecycle-after.json
pnpm exec tsx apps/cli/scripts/benchmark-session-resources.ts apps/cli/benchmarks/session-resources-after.json
```

Chạy từ kho lưu trữ gốc với các phụ thuộc workspace đã được cài đặt. Trong worktree có các phần phụ thuộc được chia sẻ, hãy đặt `pnpm_config_verify_deps_before_run=false` để ngăn cài đặt tự động. Chạy từng lệnh riêng biệt. Cả hai lệnh đều xóa dữ liệu người dùng tạm thời sau khi hoàn thành.

`telegram-lifecycle-before.json` ghi lại runtime bắt đầu tại `4bece26`. Đường cơ sở đó so sánh các yêu cầu Telegram phát hành ngay lập tức thực sự với phạm vi tham chiếu được giữ lại rõ ràng. `telegram-lifecycle-after.json` so sánh các yêu cầu Telegram thực với tình trạng lưu giữ bị vô hiệu hóa và được bật trên cùng một runtime cuối cùng. Nó cũng đo lường bốn người dùng, các đợt đồng thời và mở lại sau khi TTL tự động bị trục xuất. Số liệu yêu cầu đồng thời đo lường mức độ hoàn thành hàng loạt. Các phép đo văn bản đầu tiên vẫn cụ thể cho từng yêu cầu thông qua công cụ đo lường không đồng bộ cục bộ. Điểm chuẩn đặt TTL thành một giây để kiểm tra hết hạn. Mặc định sản xuất vẫn còn 10 phút và 32 mục không hoạt động. Tất cả các cuộc gọi Telegram API và mô hình Responses đều sử dụng mẫu kiểm thử xác định cục bộ. runtime, tính bền bỉ, Bộ nhớ V2 và SQLite vẫn có hiệu lực.

`session-resources-after.json` thực hiện 1.000 chu kỳ runtime trực tiếp với các lần truyền MCP thực trong bộ nhớ và năm đích nhắc nhở. Nó ghi lại các điểm kiểm tra ở chu kỳ 100, 500 và 1.000 với bốn phiên nhàn rỗi được giữ lại. Mỗi Recall đã đóng phải báo cáo tài nguyên bằng 0 trước khi công cụ phát hành tham chiếu của nó. Tất cả số lượng trực tiếp Recall, MCP, runtime và lời nhắc phải bằng 0 sau khi tắt máy. Tài nguyên mẫu kiểm thử này không đo độ trễ mạng Telegram hoặc hiệu suất nhà cung cấp.
