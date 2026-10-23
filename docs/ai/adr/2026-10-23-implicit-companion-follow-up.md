<a id="implicit-companion-follow-up"></a>

# Theo dõi đồng hành ngầm

Ngày: 23-10-2026

Trạng thái: Đã chấp nhận

<a id="baseline-and-problems"></a>

## Cơ sở và các vấn đề

Đã kiểm tra GitHub chính: `46212a2a54d5951a30a2893f5402589bac9e4c27`.

Trước thay đổi này, các yêu cầu rõ ràng đã tạo các tác vụ thông qua các công cụ trích xuất cục bộ hoặc mô hình được bảo vệ. Trạng thái sở hữu liên tục của nhiệm vụ, lịch trình, lease, quá trình khôi phục và các lần xuất hiện tiếp theo rõ ràng. Bộ lập lịch bắt nguồn từ các ứng viên nhiệm vụ và áp dụng chính sách xác định trước khi bộ điều hợp thông báo trình bày văn bản. Bộ nhớ cam kết dự kiến ​​các sự kiện nhiệm vụ đã được xác minh. Bối cảnh có giới hạn phân biệt trạng thái nhiệm vụ hiện tại với bằng chứng lịch sử.

Trình phân loại mục đích coi các động từ sáng tạo tiếng Anh chung chung là quyền hạn thực hiện nhiệm vụ. Nó chỉ kiểm tra khung meta trước khi hành động. Một ví dụ về hậu tố có thể trở thành một lời nhắc nhở. Các tham chiếu đang hoạt động đã hợp nhất các sự kiện gần đây và các nhiệm vụ đang chờ xử lý được chọn. Điều này có thể chọn công việc cũ hơn sau khi hoàn thành nhiệm vụ mới nhất. Không có miền độc lập nào đại diện cho công việc đàm thoại chưa được giải quyết.

<a id="architecture"></a>

## Ngành kiến ​​​​trúc

Sau sự thay đổi này:

```text
Explicit user request -> Task store -> task candidate -----------+
                                                               |
Current unresolved statement -> OpenLoops -> OpenLoopSource ----+-> ReminderScheduler
                                                                  -> ProactivePolicy
                                                                  -> notification adapter
                                                                  -> scoped focus group
                                                                  -> user resolution or dismissal

Task store -> verified task events -> CommitmentMemoryProjection
OpenLoops -> metadata events only
Historical memory never decides whether an OpenLoop is open.
```

Bộ lập lịch giữ lại mã phân phối nhiệm vụ của nó và chấp nhận các nguồn chủ động tùy chọn. Phân phối nhiệm vụ chạy đầu tiên. Lỗi nguồn phụ trợ không thể từ chối tác vụ thay đổi trạng thái hoặc bộ lưu trữ tác vụ bị hỏng. runtime đăng ký một nguồn OpenLoop cho mỗi tác vụ store. Nó không thêm lịch trình hoặc chương trình phụ trợ thứ hai. CLI và thông báo đồng hành Telegram riêng tư hỗ trợ gửi văn bản ngầm. Dịch vụ nhắc nhở desktop độc lập chỉ giữ lại việc phân phối nhiệm vụ rõ ràng.

<a id="intent-and-focus"></a>

## Ý định và sự tập trung

Các công cụ tác vụ mô hình và trích xuất cục bộ sử dụng `classifyCommitmentIntent` trước khi lưu giữ. Ủy quyền bằng tiếng Anh yêu cầu mục đích, tiêu đề, hoạt động cá nhân hoặc điều khoản thời gian rõ ràng sau đối tượng tạo. Ví dụ bao gồm `create a task to study`, `add a todo: submit my report` và `add a reminder for tomorrow`. `save this as a task` cũng cho phép chuyển đổi rõ ràng bối cảnh hiện tại. Danh từ nhiệm vụ đơn giản không cấp quyền. `create`, `add` và `save` chung không cấp quyền. Trình phân loại kiểm tra ví dụ và khung triển khai trên toàn bộ yêu cầu. Các đối tượng kỹ thuật như trình phân tích cú pháp tác vụ không cấp quyền. Các chủ đề mã hóa bên trong các yêu cầu quản lý hợp lệ vẫn được hỗ trợ. Các trích dẫn, suy đoán, câu hỏi và yêu cầu không chắc chắn không thể cho phép tạo nhiệm vụ. Lời nhắc trực tiếp về việc kiểm tra trình phân tích cú pháp vẫn là các yêu cầu rõ ràng hợp lệ.

Một sự kiện tạo ra một nhóm tập trung. Nhóm mới nhất thay thế nhóm trước đó. Một nhóm chứa các đặc tính nhiệm vụ hoặc OpenLoop. Nhiều danh tính yêu cầu làm rõ. Các nhóm không hoạt động, bị thiếu, hết hạn hoặc quá lớn không thể chọn tác phẩm cũ hơn đang chờ xử lý. Một cụm từ tiêu đề nhiệm vụ hoàn chỉnh hoặc nhiệm vụ đã được xác minh ID có thể thiết lập trọng tâm cuộc trò chuyện. Các câu trả lời của trợ lý không liên quan sẽ giữ nguyên tiêu điểm. Focus giữ lại tối đa tám danh tính cho tám yêu cầu hoặc sáu giờ. Cả hai miền đều nâng cao tiêu điểm trước khi giải quyết yêu cầu hiện tại. Danh tính bền vững bao gồm workspace, phiên và kênh. Đặt lại chỉ xóa danh tính đó. Phiên bản hai sử dụng một tệp tiêu điểm riêng biệt và loại bỏ ngữ nghĩa tham chiếu cũ mà không sửa đổi bản ghi tác vụ.

<a id="domain-and-extraction"></a>

## Tên miền và trích xuất

`OpenLoops` sở hữu chủ đề, danh tính chuẩn hóa, loại, workspace, phiên nguồn, vòng đời, độ tin cậy, mức độ nổi bật, thời gian, số lượng prompt và yêu cầu giao hàng. Các trạng thái là `open`, `resolved`, `expired` và `dismissed`. OpenLoop không bao giờ trở thành Nhiệm vụ tổng hợp.

| Tuyên bố | Tên miền |
| --- | --- |
| `Mai 9h nhắc tao làm auth.` | Explicit reminder Task |
| `Mai hỏi tao xem auth xong chưa.` | Explicit follow-up Task |
| `Tao đang bí phần refresh token.` | Implicit problem OpenLoop |

Các quy tắc xác định của Việt Nam chấp nhận các vấn đề hiện tại, công việc còn dang dở, sự chờ đợi, các sự kiện đã cũ và các mục tiêu cụ thể. Ví dụ, văn bản được trích dẫn, giả thuyết, sự việc cũ, sở thích, cảm xúc đơn thuần, nhận xét thông thường và chủ đề đọc đều bị từ chối. Chủ đề không xác định và từ ngữ không được hỗ trợ không tạo ra trạng thái ngầm định. Không có trích xuất mô hình hoặc cho phép tồn tại ngầm định.

Các chủ thể bằng nhau được chuẩn hóa hợp nhất trong workspace khi mở. Nhóm quy tắc bí danh ban đầu `auth`, `login` và `refresh token`. Quy tắc bảo thủ này có thể hợp nhất các vấn đề xác thực riêng biệt. Đề cập đến làm mới-token cụ thể hơn sẽ cập nhật chủ đề được hiển thị. Cập nhật trì hoãn nhắc nhở sau công việc gần đây. Họ không bao giờ đặt lại giới hạn hoặc gia hạn thời hạn ban đầu. Một tuyên bố mới chưa được giải quyết sau khi bị sa thải hoặc hết hạn sẽ tạo ra một danh tính mới.

Named resolution recognizes outcomes such as `Fix được auth rồi`, `Xong phần slide rồi`, and `Thầy trả lời rồi`.
Bí danh chủ đề và loại bỏ tiền tố tránh việc chỉ khớp chính xác với tiêu đề.
`Xong rồi` and `Đừng hỏi vụ này nữa` require one exact focused OpenLoop.
Các kết quả được đặt tên sử dụng workspace hiện tại. Tiêu điểm thông báo có thể giải quyết vòng lặp chính xác của nó trên workspace trong cùng một người dùng store.
Một kết quả mơ hồ không bao giờ hoàn thành được một Nhiệm vụ khác.
Named opt-outs include `Quên vụ auth đi`, `Đừng nhớ chuyện auth nữa`, and `Đừng hỏi tôi về auth nữa`.
Họ chỉ loại bỏ một chuỗi workspace hiện tại phù hợp. Việc chọn không tham gia chung yêu cầu một trọng tâm hiện tại chính xác và nếu không thì yêu cầu làm rõ.
Yêu cầu không hỏi chỉ thay đổi theo dõi chủ động.
Việc quên rõ ràng cũng sử dụng `Memory.forget` hiện có cho một hồ sơ cá nhân phù hợp, bao gồm cả các bước kiểm tra dọn dẹp và ghi cũ hiện có.
Nhiều bản ghi trùng khớp, bộ nhớ cá nhân bị vô hiệu hóa hoặc lỗi xóa sẽ khiến bộ nhớ cá nhân không thay đổi và hướng người dùng đến `/memory`.
Việc theo dõi vẫn bị loại bỏ ngay cả khi việc xóa bộ nhớ cá nhân không thành công. Không có sự xóa bỏ lịch sử rộng rãi nào được giới thiệu.
Tính năng chọn không tham gia rõ ràng vẫn khả dụng khi thu nhận dữ liệu tự động bị tắt hoặc yêu cầu hiện tại cấm nội dung lâu bền mới.

<a id="timing-and-eligibility"></a>

## Thời gian và tính đủ điều kiện

| Loại | Thời gian sớm nhất ban đầu | Hết hạn |
| --- | --- | --- |
| Vấn đề hoặc công việc chưa hoàn thành | 4 giờ | 48 giờ |
| Chờ đợi | 12 giờ | 7 ngày |
| Mục tiêu cụ thể | 12 giờ | 48 giờ |
| Sự kiện ngày mai | 09:00 sau toàn bộ sự kiện tại cục bộ | 48 giờ sau thời điểm sớm nhất |

Thời gian sự kiện sử dụng chuyển đổi lịch cục bộ qua các thay đổi về tiết kiệm ánh sáng ban ngày. Ngày diễn ra sự kiện không ghi ngày tháng hoặc không được hỗ trợ sẽ không tạo ra cơ hội chủ động. Tính đủ điều kiện cũng yêu cầu độ tin cậy ít nhất là 0,95, độ mặn ít nhất là 0,7, trạng thái mở và giới hạn prompt chưa sử dụng. Mỗi bản cập nhật sẽ thêm ít nhất bốn giờ không hoạt động trước prompt. prompt tiềm ẩn đợi ít nhất 15 phút sau hoạt động hội thoại. Sáu yêu cầu gần đây trở lên sẽ thêm thời gian trì hoãn hoạt động là một giờ. Cửa sổ hoạt động giữ lại tối đa tám dấu thời gian. Giờ yên tĩnh ngầm định mặc định là 22:00–08:00 trong múi giờ đã định cấu hình. Giờ yên tĩnh được cấu hình sẽ thay thế mặc định đó. Các yêu cầu runtime đang hoạt động cũng chặn việc trình bày ngầm.

Một vòng lặp cho phép một lần trình bày. Mỗi người dùng store cho phép tối đa một lần thử ngầm trong tám giờ. Việc theo dõi rõ ràng cũng trì hoãn các ứng viên tiềm ẩn thông qua hoạt động lập lịch trình hiện có. Bộ lập lịch điều chỉnh công việc tiềm ẩn trong vòng một phút. Nó không đọc kho ngữ liệu bộ nhớ ngữ nghĩa hoặc lịch sử hội thoại.

<a id="task-suppression"></a>

## Ngăn chặn nhiệm vụ

Nhiệm vụ đang chờ xử lý có chủ đề được chuẩn hóa tương đương và `memoryProjection.scope` thuộc sở hữu của host phù hợp sẽ loại bỏ vòng lặp ngầm và ghi lại `supersededByTaskId`. runtime quan sát việc tạo và cập nhật tác vụ. Nguồn cũng sửa chữa sự đàn áp trong mỗi lần hòa giải và trước khi trình bày. Người quan sát tác vụ không thể quay lại quá trình ghi Tác vụ thành công. Nếu một Nhiệm vụ tương đương đang chờ xử lý tồn tại, các câu lệnh ẩn sau này sẽ không tạo ra một vòng lặp khác. Việc hủy tác vụ không âm thầm phục hồi vòng lặp bị loại bỏ. Một câu lệnh người dùng mới có thể mở ra một vòng lặp khác. Nhiệm vụ vẫn mang tính toàn cầu cho mỗi người dùng store. Việc ngăn chặn yêu cầu phạm vi workspace tương thích chính xác. Nguồn gốc dự báo hiện tại cung cấp bằng chứng đó mà không thay đổi lược đồ Nhiệm vụ hoặc sử dụng bộ nhớ lịch sử. Nguồn gốc không xác định và bối cảnh Nhiệm vụ dạng tự do không cho phép loại bỏ. runtime OpenLoops mới sử dụng phạm vi dự án chuẩn hiện có, bao gồm các thư mục Git lồng nhau.

<a id="persistence-and-delivery"></a>

## Sự kiên trì và giao hàng

store sử dụng xác thực `MemoryFile` hiện có, quyền truy cập tệp riêng tư, đổi tên nguyên tử và khóa đa quy trình. Tệp của nó là `open-loops/state.json` trong thư mục dữ liệu người dùng. Lược đồ tác vụ, trạng thái phân phối, lặp lại, khởi động lại khôi phục và chiếu bộ nhớ giữ nguyên các hợp đồng hiện có của chúng.

Yêu cầu kéo dài 30 giây và mang theo hàng rào token. Trước khi trình bày, nguồn sẽ kiểm tra quyền riêng tư hiện tại, ngăn chặn tác vụ mới, hoạt động mới nhất, trạng thái vòng lặp hiện tại và quyền sở hữu lease. Lỗi trình bày trước sẽ hủy bỏ xác nhận quyền sở hữu và đợi 60 giây trước khi thử lại. Chủ sở hữu yêu cầu bồi thường bị lỗi sẽ có thể phục hồi được sau khi lease hết hạn.

`reservePresentation` cam kết `promptCount = 1` và `lastPromptedAt` trước tác dụng phụ bên ngoài. Điều này cung cấp các nỗ lực trình bày tối đa một lần đối với các lỗi và khởi động lại nhiều lần. Một thất bại sau khi đặt trước và trước khi trình bày bên ngoài được xác nhận có thể làm mất đi sự theo dõi ngầm. Điều này bao gồm sự cố quy trình, lỗi Telegram API, lỗi ghi thiết bị xuất chuẩn, ngoại lệ bộ điều hợp và lỗi mạng. Những nỗ lực này không được thử lại. Sự kiện `proactive.prompted` ghi lại nỗ lực đã cam kết nhưng không được người dùng xác nhận. Lời nhắc nhiệm vụ giữ lại hành vi xác nhận và trình bày ít nhất một lần hiện có của chúng.

Không có sinh nội dung nhà cung cấp nào được gọi để giao hàng. Các mẫu tiếng Anh và tiếng Việt cung cấp các câu hỏi về vấn đề, công việc, sự chờ đợi, mục tiêu và sự kiện theo từng loại cụ thể.
Bản trình bày loại bỏ các tiền tố chủ đề thừa ở đầu mà không thay đổi khóa nhận dạng.
For example, waiting for `thầy` produces `Thầy đã phản hồi chưa?`.
Lỗi nhà cung cấp trong quá trình trò chuyện thông thường không xóa vòng lặp hợp lệ do người dùng căn cứ đã được host duy trì.

<a id="privacy-bounds-and-failures"></a>

## Quyền riêng tư, giới hạn và thất bại

Việc tạo và giải quyết yêu cầu phải có sự đồng ý lâu dài về bộ nhớ cá nhân. Nguồn kiểm tra các bộ chuyển mạch bộ nhớ cá nhân, bộ nhớ tự động và Recall hiện tại mà không cần mở chỉ mục ngữ nghĩa. Các điều khiển bộ nhớ bị vô hiệu hóa, không khả dụng hoặc không hợp lệ sẽ chặn việc phân phối ngầm định. Nhiệm vụ rõ ràng giữ lại các biện pháp kiểm soát quyền riêng tư độc lập. Các yêu cầu được bảo vệ không tạo ra vòng lặp, nhiệm vụ chiếu hoặc ứng viên tiềm ẩn. Đối tượng không bao giờ tham gia các sự kiện toàn cầu. Sự kiện chỉ chứa ID, lý do và siêu dữ liệu vòng đời.

store thừa nhận tối đa 50 vòng lặp mở. Nó từ chối việc nhập học quá mức mà không loại bỏ công việc đang hoạt động. Lịch sử không hoạt động giữ lại tối đa 30 bản ghi trong bảy ngày. Hết hạn chạy theo khóa store. Tệp lưu trữ vẫn là có giới hạn theo hợp đồng lưu trữ 128.000 ký tự hiện có. Ngữ cảnh mô hình bao gồm tối đa sáu bản tóm tắt vòng lặp cục bộ workspace, mỗi bản tóm tắt có chủ đề tối đa 120 ký tự. Sắp xếp các chủ đề mở trước lịch sử không hoạt động, sau đó theo thời gian cập nhật. Người quan sát siêu dữ liệu chạy theo sự kiên trì và không thể thay đổi kết quả có thẩm quyền. Các tập tin bị hỏng vẫn còn nguyên. Lỗi nguồn được báo cáo mà không dừng nhắc nhở Tác vụ.

<a id="limits-and-next-milestone"></a>

## Giới hạn và cột mốc tiếp theo

Nền tảng này công nhận ngữ pháp tiếng Việt có giới hạn. Nó không hiểu các chủ đề tùy tiện chưa được giải quyết hoặc các lịch sự kiện tùy ý. Việc kết hợp bí danh xác thực có thể kết hợp quá mức các vấn đề liên quan. Các chủ đề khác yêu cầu sự bình đẳng được chuẩn hóa. Phân phối ngầm cần có CLI đang chạy hoặc host đồng hành của Telegram. Giọng nói và nền độc lập tiềm ẩn prompt không được triển khai. Giao hàng tối đa một lần cố tình chấp nhận mất mát có thể xảy ra sau khi đặt trước. Nó không hứa hẹn nhận mạng chính xác một lần. Lịch sử OpenLoop vẫn tách biệt với các lệnh thanh lọc bộ nhớ ngữ nghĩa. Các yêu cầu quên ngôn ngữ tự nhiên loại bỏ việc theo dõi và sử dụng việc quên bộ nhớ cá nhân hiện có khi rõ ràng.

Cột mốc tiếp theo: đánh giá việc trích xuất và loại trừ đối với kho ngữ liệu hội thoại tiếng Việt đã được đồng ý trước khi mở rộng ngữ pháp.
