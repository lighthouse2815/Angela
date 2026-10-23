<a id="commitment-and-proactive-follow-up"></a>

# Cam kết và chủ động theo dõi

<a id="existing-architecture"></a>

## Kiến trúc hiện có

Kho lưu trữ bao gồm các điểm vào terminal, Telegram, Discord, Zalo, web và Electron. Thay đổi này nhắm vào CLI runtime hiện có và các bộ điều hợp trò chuyện riêng tư của nó. Web và Electron sử dụng trò chuyện Pinia store riêng biệt và giữ nguyên hoạt động hiện tại của chúng.

- `bin/run.ts` sở hữu đầu vào, đầu ra, tín hiệu, phiên và cấu hình nhà cung cấp.
- `AngelaRuntime` sở hữu các dịch vụ lười biếng, điểm đến nhắc nhở, sự kiện vòng đời và giới hạn tài nguyên.
- `RuntimeSession.send` xây dựng các công cụ thực thi và ngữ cảnh trước khi `Chat.send` gọi `core-agent.streamFrom`.
- `provider-inference` điều chỉnh các giao thức nhà cung cấp và sinh nội dung.
- `Context` thu gọn các cuộc hội thoại đang làm việc. `Sessions` lưu lịch sử di động của họ.
- `Tasks` sở hữu trạng thái nhiệm vụ, lặp lại, thông báo lease, hoàn thành, hủy và báo lại.
- `MemoryFile` ghi JSON riêng tư thông qua các khóa độc quyền và đổi tên nguyên tử.
- `ReminderScheduler` sắp xếp các nhiệm vụ quá hạn và gia hạn phân phối lease trước khi trình bày.
- `ReminderNotifications` đệm bản trình bày trong sinh nội dung và xếp hàng đầu ra giọng nói tùy chọn.
- `RecallIndex` và bộ nhớ-v2 store các tập có thể tìm kiếm, sự kiện ngữ nghĩa và quy trình trong SQLite cục bộ.
- Bus sự kiện CLI mang siêu dữ liệu vòng đời có giới hạn. Electron sử dụng Eventa và Injeca ở ranh giới quy trình.
- `local-config` store đã chia sẻ cấu hình nhà cung cấp. Các biến môi trường và cờ CLI ghi đè lên nó.

<a id="gaps-confirmed-on-main-at-dc2e7f3"></a>

## Khoảng trống được xác nhận trên main tại dc2e7f3

Các công cụ tác vụ và trích xuất cục bộ sử dụng các biểu thức chính quy có ý định riêng biệt. prompt bao gồm mọi nhiệm vụ được giữ lại, bao gồm cả các bản ghi cũ đã hoàn thành và bị hủy. Mọi yêu cầu đều đối chiếu các bản ghi tác vụ với bộ nhớ. Kiểm soát theo ngữ cảnh chỉ kiểm tra lượt trợ lý mới nhất. Loại nhiệm vụ tiếp theo hiện tại không có trình trích xuất cục bộ, ứng viên mô hình có thể giải thích được hoặc vòng đời theo dõi kéo dài. Một sự kiện gửi lời nhắc đã sử dụng thời gian treo tường mặc dù đồng hồ runtime được chèn vào.

<a id="decisions"></a>

## Quyết định

Giữ `Tasks`, `MemoryFile`, bộ lập lịch hiện có và các công cụ mô hình có thể thực thi được. Không giới thiệu cơ sở dữ liệu tác vụ khác, bản tóm tắt mô hình hoặc bus sự kiện.

Phân tích cú pháp thời gian tiếng Việt sử dụng chuyển đổi lịch quốc tế hiện có với đồng hồ được chèn vào. Khoảng thời gian tương đối sử dụng thời gian trôi qua. Biểu thức lịch sử dụng múi giờ IANA đã định cấu hình. Yêu cầu chỉ có ngày và giờ cục bộ không rõ ràng yêu cầu phải làm rõ trước khi tạo cảnh báo. Một ngày trong tuần có nghĩa là lần xuất hiện tiếp theo trong lịch của nó. Một ngày không có tháng có nghĩa là tháng đủ điều kiện tiếp theo. Ngày không có năm có nghĩa là năm đủ điều kiện tiếp theo. Ngày dương lịch không hợp lệ vẫn có lỗi.

Các tác vụ đang chờ xử lý giống hệt nhau sẽ sử dụng lại ID đã lưu của chúng bên trong khóa lưu trữ. Các nhiệm vụ đã hoàn thành và bị hủy không ngăn cản cam kết sau này với cùng tiêu đề và lịch trình. Đồng hồ chấp nhận ranh giới chức năng hiện có và hợp đồng `Clock` rõ ràng.

<a id="delivery-guarantees"></a>

## Đảm bảo giao hàng

Xác nhận xảy ra liên tục sẽ ngăn chặn việc phân phối trùng lặp sau khi khởi động lại bình thường. Khiếu nại và lease có thể tái tạo ngăn cản hai chủ sở hữu trực tiếp xuất hiện cùng một sự cố cùng một lúc. Lời nhắc ngoại tuyến được thu gọn thành một đợt khôi phục. Các phần tiếp theo sẽ được phục hồi riêng lẻ theo chính sách hết hạn và thời gian hồi chiêu của store được chia sẻ. Sự cố sau khi trình bày bên ngoài nhưng trước khi xác nhận có thể lặp lại bản trình bày đó. Việc phân phối chính xác một lần qua ranh giới đó yêu cầu đích thông báo bên ngoài bình thường.

<a id="integrated-flow"></a>

## Dòng chảy tích hợp

`RuntimeSession.send` trước tiên áp dụng quyền riêng tư của yêu cầu và khởi tạo các dịch vụ bộ nhớ và tác vụ hiện có. `CommitmentConversation` xử lý các yêu cầu rõ ràng được hỗ trợ trước mô hình sinh nội dung. Kết quả của nó đi vào `Chat` thông qua cùng một bản trình bày luồng và ranh giới duy trì phiên. Các cụm từ không được hỗ trợ tiếp tục thông qua các công cụ mô hình đã được xác thực và bản tóm tắt nhà cung cấp hiện có.

Bộ lập lịch đánh giá `ProactivePolicy`, xác nhận các lần xuất hiện đủ điều kiện và gọi ranh giới thông báo của nó. Các sự kiện siêu dữ liệu runtime hiển thị ID nhiệm vụ đến hạn và đã giao mà không lưu trữ nội dung tin nhắn trong bus sự kiện. Bản ghi trình bày đã công bố ID theo nhận dạng kênh, phiên và workspace chính xác của đích. Tài liệu tham khảo chỉ chứa ID và vẫn tồn tại khi khởi động lại. Tám yêu cầu và sáu giờ ràng buộc sự liên quan của họ. Tạm ẩn, hoàn thành và hủy cục bộ sẽ giữ lại các tham chiếu gần đây thông qua cuộc trò chuyện không liên quan. Một số tài liệu tham khảo đang chờ xử lý yêu cầu làm rõ. Đặt lại phiên chỉ xóa các tham chiếu của chính nó.

Tác vụ phát ra các sự kiện thay đổi trạng thái đã nhập sau khi ghi nguyên tử. Recall đăng ký các sự kiện này và chiếu tác vụ có thẩm quyền bị ảnh hưởng vào một khóa cam kết theo từng giai đoạn hiện tại. MemoryCapture giữ lại các quan sát phiên ngày tháng. Nó không còn sở hữu các trang cam kết hiện tại. Khởi động và điều chỉnh trong 5 phút sẽ sửa chữa các thay đổi trạng thái bên ngoài và các dự đoán không thành công. Nguồn gốc tác vụ thuộc sở hữu của host cho phép khôi phục dự báo ban đầu bị thiếu. Các yêu cầu bị vô hiệu hóa bộ nhớ sẽ không nhận được nguồn gốc chiếu. Việc ngăn chặn ngăn nội dung bị lãng quên quay trở lại trong quá trình khôi phục. Người quan sát phép chiếu không thể khôi phục tác vụ đã ghi thành công. Ảnh chụp nhanh tác vụ có giới hạn ghi đè bộ nhớ lịch sử trong sinh nội dung. Lịch sử cũ hơn vẫn có thể truy cập được thông qua các công cụ.

Các lệnh tác vụ độc lập sử dụng cùng một dịch vụ và đường dẫn thu nhận dữ liệu mà không cần xây dựng mô hình nhà cung cấp. Hệ thống vẫn là cục bộ đầu tiên. Không cần máy chủ, nhà môi giới hoặc người phụ thuộc mới.

<a id="writer-crash-recovery"></a>

## Khôi phục sự cố của nhà văn

Người viết phiên đã xác định các khóa bị bỏ qua thông qua tên máy chủ và quy trình ID. Việc triển khai đó hiện có trong `file-lock.ts`, được chia sẻ bởi các phiên và `MemoryFile`. Liên kết cứng nguyên tử xuất bản siêu dữ liệu chủ sở hữu hoàn chỉnh trước khi một quy trình khác có thể quan sát khóa. Chỉ ESRCH từ quá trình kiểm tra quy trình host tương tự mới cho phép khôi phục. Chủ sở hữu trực tiếp, lỗi cấp phép, dữ liệu chủ sở hữu không xác định và host nước ngoài vẫn bị khóa. Sơ yếu lý lịch CLI cho phép kiểm tra này. Nhiệm vụ các thay đổi trạng thái luôn kích hoạt nó. Các ổ khóa không xác định và các điểm đánh dấu khôi phục bị bỏ rơi cần được kiểm tra thủ công. Hệ thống tập tin đích phải hỗ trợ các liên kết cứng cục bộ và đổi tên nguyên tử.

Quá trình kiểm tra quy trình sẽ giết chết người viết trong khi `MemoryFile.edit` giữ khóa của nó. Bộ lập lịch được khởi động lại sẽ khôi phục khóa đó và gửi lời nhắc đã lưu trước đó một lần.

<a id="proactive-foundation"></a>

## Nền tảng chủ động

Tái sử dụng các tác vụ `follow_up`, thông báo lease và bus sự kiện runtime hiện có. Các ứng viên xuất phát từ những lần xuất hiện nhiệm vụ có thẩm quyền rõ ràng. Họ không giới thiệu hệ thống con kiên trì mới. ID ứng viên kết hợp ID nhiệm vụ và ID lần xuất hiện. Lý do và quyết định chính sách vẫn có thể kiểm tra được. Chính sách này kiểm tra mức độ liên quan, độ tin cậy, mức độ hoàn thành, thời hạn sử dụng, phân phối trùng lặp, số giờ yên tĩnh, thời gian hồi chiêu và hoạt động gần đây. Phần theo dõi sử dụng các khoảng thời gian cục bộ xác định khi người dùng cung cấp ngày hoặc phần ngày. Xác nhận hiển thị thời gian đã chọn. Báo động nhắc nhở chính xác vẫn cần một giờ.

Duy trì số lượng prompt, prompt cuối cùng, tính đủ điều kiện tiếp theo, thời hạn sử dụng và cách giải quyết với nhiệm vụ. Trình bày thành công thừa nhận một lần xảy ra. Khởi động lại không lặp lại nó. Thời gian hồi chiêu tiếp theo mặc định là ba mươi phút. Một lô bao gồm nhiều nhất một lần theo dõi. Các tuyên bố của Atomic tạo ra hàng rào theo dõi riêng biệt trên host và trực tiếp lease trì hoãn các ứng viên cạnh tranh. Các lượt theo dõi không được nhắc nhở sẽ hết hạn sau 48 giờ. Các lần xuất hiện đã hết hạn định kỳ sẽ chuyển sang lịch trình tiếp theo trong tương lai. Báo lại rõ ràng sẽ thực hiện lại cùng một nhiệm vụ với một lần xuất hiện mới.

Ngữ pháp ngôn ngữ tự nhiên vẫn còn bảo thủ. Các yêu cầu không chắc chắn không thể tạo tác vụ thông qua công cụ mô hình. Bộ lập lịch và tất cả từ ngữ thông báo vẫn độc lập với tính khả dụng của mô hình. Không có phần phụ thuộc, cơ sở dữ liệu, trình môi giới, chương trình phụ trợ, bus sự kiện hoặc hệ thống con agent nào được thêm vào.

<a id="focus-and-intent-corrections-2026-10-23"></a>

## Điều chỉnh trọng tâm và ý định (23-10-2026)

Việc tạo tác vụ yêu cầu một cụm từ tác vụ có ngữ nghĩa. `create`, `add` và `save` chung không cấp quyền cho công cụ tác vụ. Việc tạo khung meta trước hoặc sau một hành động sẽ ngăn chặn sự kiên trì. Các công cụ tác vụ và trích xuất cục bộ chia sẻ bộ phân loại.

Một bài thuyết trình sẽ tạo ra một nhóm tập trung. Một lô vẫn không rõ ràng ngay cả khi chỉ có một thành viên đang chờ xử lý. Trình giải quyết chỉ sử dụng nhóm mới nhất. Tiêu điểm đã hoàn thành, bị thiếu, hết hạn hoặc mơ hồ không bao giờ chọn tác phẩm cũ hơn đang chờ xử lý. Tập trung store tối đa tám ID cho tám yêu cầu hoặc sáu giờ theo một workspace, phiên và kênh chính xác. Phiên bản hai sử dụng một tập tin tiêu điểm riêng biệt. Các bản ghi nhiệm vụ hiện có và phân phối lease giữ nguyên định dạng của chúng.
