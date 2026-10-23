<a id="angela-runtime-and-memory-v2"></a>

# Angela runtime và Bộ nhớ V2

<a id="storage-decision"></a>

## Quyết định lưu trữ

Bộ nhớ V2 mở rộng `memory/recall.sqlite`. Có một chương trình phụ trợ SQLite native, một chỉ mục FTS5 và một phép chiếu vectơ tùy chọn. Bộ nhớ cá nhân JSON, điểm kiểm tra dự án, nhiệm vụ, phiên JSON và các kỹ năng vẫn giữ nguyên chủ sở hữu hiện tại của chúng. `dataDir` vẫn là ranh giới người dùng riêng tư. Phạm vi trang là workspace chuẩn bên trong ranh giới đó.

Các trang có cấp độ rõ ràng, khóa yêu cầu, quyền hạn, mức độ nổi bật, thời hạn sử dụng và phiên bản. Giá trị bù trừ hết hạn chuẩn hóa thành UTC trước khi SQLite so sánh dấu thời gian của chúng. Trình kích hoạt SQLite cập nhật các phép chiếu trang bên trong giao dịch trang. Tính năng tăng cường truy cập có thời gian hồi chiêu SQL và không bao giờ ghi lại FTS hoặc vectơ. Supersession loại bỏ phép chiếu cũ và giữ lại lịch sử rõ ràng của nó. Các cạnh mâu thuẫn ghi lại sự bất đồng mà không có người chiến thắng tự động. Chỉ có nhiều trang bị phân rã. Bộ nhớ cá nhân cốt lõi, ngữ nghĩa, thủ tục và được ghim không bao giờ tự động phân rã.

<a id="reference-implementation"></a>

## Thực hiện tham khảo

Thanh toán tham chiếu nằm bên ngoài Angela tại `../ai-memory-reference`. Nó không phải là một sự phụ thuộc hay một dịch vụ. Bản sửa đổi tham khảo: `1c86aebc14addccc7ac875913d565c681bfa4a50`.

| Hành vi của Angela | Mã sản xuất tham khảo | Kiểm tra tham khảo và bất biến |
| --- | --- | --- |
| Bốn tầng và phiên bản trang | `ai-memory-core/src/page.rs` | Riêng phiên bản hiện tại nhập truy xuất mặc định |
| Giữ chân | `ai-memory-store/src/decay.rs` | Sự nổi bật chỉ ảnh hưởng đến thời hạn. Truy cập lặp lại gần đây sẽ bảo tồn các tập phim cũ |
| Gia cố | `ai-memory-store/src/ops.rs`, `bump_access_for_pages_for_actor` | ID không xác định là vô hại. Truy cập cập nhật bỏ qua FTS |
| Nén khai thác | `ai-memory-consolidate/src/compaction.rs`, `keep_tokens.rs` | Giữ nguyên bản tóm tắt, đường dẫn, URL, mã lỗi. Không bao giờ nén hai lần |
| Quyền riêng tư của thu nhận dữ liệu | `ai-memory-core/src/sanitize.rs` | Vệ sinh trước khi cắt và kiên trì |
| Thẩm quyền | `ai-memory-store/src/belief.rs`, `reader.rs` | Bằng chứng suy luận yếu hơn không thể thay thế sự thật rõ ràng |
| Đánh giá truy xuất | `ai-memory-consolidate/tests/suite/recall_eval.rs` | Dữ liệu cố định và đầu dò đo vị trí Recall và ô nhiễm |
| Tóm tắt Zero-nhà cung cấp | `ai-memory-hooks/src/synth.rs`, `session_end_equivalence.rs` | Bằng chứng không có nhà cung cấp vẫn hữu ích. Kết thúc phiên phát lại tương đương |
| Làm giàu tùy chọn | `ai-memory-consolidate/src/consolidator.rs`, `consolidator_oracle.rs` | Các ứng viên có cấu trúc cần có bằng chứng nguồn. Thất bại trong việc bảo tồn tập phim gốc |
| Quá trình lão hóa | `ai-memory-consolidate/src/sweep.rs`, kiểm tra `compaction_sweep.rs` | Chính sách cấp đi trước việc nén. Truy cập nóng bảo vệ các tập phim cũ |
| nhúng tăng dần | `ai-memory-consolidate/src/embed.rs`, kiểm tra `embed_backfill.rs` | Văn bản không thay đổi sẽ sử dụng lại các vectơ. sinh nội dung cũ không thể thay thế phiên bản mới hơn |

Angela sử dụng chu kỳ bán rã theo từng tập là 90 ngày. Sự phân rã vô hướng mặc định tham chiếu khác nhau. Angela sử dụng điều chỉnh tăng cường SQL thay vì bản đồ quy trình không giới hạn. Nén chặt thay thế cơ thể lạnh cục bộ. Nó không tạo ra các bản sao dữ liệu cá nhân được hỗ trợ bởi Git. Các thao tác Quên loại bỏ các phép chiếu trang, vectơ, cạnh và các bản sao dẫn xuất.

Máy chủ nhóm, thùng Rust, bộ nhớ sidecar, bộ nhớ cá nhân được hỗ trợ bởi Git, cơ sở hạ tầng quản trị và đồng bộ hóa giữa các máy đều bị loại trừ. Tính năng loại bỏ trùng lặp cụm lạnh và thẻ trong mơ đã được xem xét trong `cold_cluster.rs`, `dream.rs` và các thử nghiệm quét của chúng. Ban đầu, Angela loại bỏ các bản phát lại chính xác và chuẩn hóa trùng lặp trong một xác nhận quyền sở hữu. Nó không tự động hợp nhất các sự kiện độc lập tương tự. Việc phân cụm giấc mơ cần một kho dữ liệu đánh giá lớn hơn trước khi có thể thay đổi kiến ​​thức lâu bền một cách an toàn.

## Runtime capture

CLI và các yêu cầu Telegram riêng tư sử dụng `RuntimeSession.send` cho ngữ cảnh, công cụ, thực thi mô hình, sự kiện và bộ nhớ thu nhận dữ liệu. Discord giữ chính sách chỉ có văn bản hiện tại và không khởi tạo store đồng hành. runtime chấp nhận bộ chuyển đổi desktop mà không cần nhập desktop API. Bộ điều hợp transport tiếp tục được phê duyệt UI, phân phối, giọng nói, nhận thức và hủy bỏ.

Mỗi sự kiện có một ID duy nhất và yêu cầu tương quan ID, cùng với phiên, kênh và workspace của nó. Bus sự kiện được gõ đồng bộ chỉ giữ lại người nghe. Nó không bao giờ giữ lại tin nhắn hoặc kết quả công cụ. Mỗi yêu cầu sở hữu một bộ xử lý thu nhận dữ liệu riêng. Nó xác nhận phiên chính xác và workspace trước khi viết quan sát. thu nhận dữ liệu tôn vinh các công tắc tự động và kích hoạt Bộ nhớ cá nhân cũng như công tắc kích hoạt Recall. runtime kiểm tra lại các công tắc đó ở ranh giới quan sát. Các công cụ trang được cung cấp trước đây cũng kiểm tra lại chính sách trước khi viết. store vệ sinh lại văn bản quan sát trước khi lưu giữ và giữ lại 256 quan sát mỗi phiên.

Trình biên dịch zero-nhà cung cấp tạo một trang nhiều tập sau mỗi yêu cầu, bao gồm cả các yêu cầu bị gián đoạn.
Mục tiêu ban đầu của nó là tồn tại khi cuộn qua cửa sổ quan sát. Phần giới hạn các bản tóm tắt bị ràng buộc và giữ cho sự hợp nhất lặp đi lặp lại bình thường.
Chỉ các kết quả được xác minh host mới được tính là công cụ thành công. Các cam kết hỗ trợ mang nhãn rõ ràng chưa được xác minh.
Explicit `Workflow: ...` and `Quy trình: ...` statements can create procedural pages with source-episode edges.

<a id="native-knowledge-and-forgetting"></a>

## native kiến ​​thức và sự quên lãng

`memory_page_save` lưu các trang thủ tục và ngữ nghĩa kỹ thuật từ các trích dẫn nguyên văn của người dùng hiện tại hoặc công cụ đã được xác minh. host phân quyền. Kiểm tra phiên bản giao dịch sẽ từ chối các thay thế cũ đồng thời. Sở thích cá nhân tiếp tục thông qua `personal_memory`. Các trang kỹ thuật được suy luận không thể thay thế các trang rõ ràng mạnh mẽ hơn.

`/memory purge memory:<id>` xóa xác nhận quyền sở hữu trang, tất cả các phiên bản của nó và các trang dẫn xuất downstream. Các thao tác sửa và quên cá nhân cũng loại bỏ các bản sao đã chụp và các phép chiếu lịch sử trùng khớp. Bia mộ phiên chỉ nhận dạng ngăn chặn các sự kiện muộn hoặc lập chỉ mục lại khôi phục các sự kiện đã quên. Hãy quên đi các mối tương quan yêu cầu trước đó trong khi các yêu cầu mới có thể tạo ra bộ nhớ mới. Danh tính phiên đã xóa vẫn bị chặn. Bản lưu trữ cuộc trò chuyện mà người dùng có thể nhìn thấy vẫn giữ lại vòng đời `angela sessions delete <id>` rõ ràng hiện có của chúng. Việc xóa một kho lưu trữ cũng sẽ xóa các dẫn xuất Bộ nhớ V2 của nó.

FTS và các vectơ tùy chọn vẫn cung cấp phản ứng tổng hợp cấp bậc đối ứng. Tín hiệu cấp và quyền hạn có giới hạn giải quyết các cuộc thi xếp hạng chặt chẽ. Lịch sử vẫn đủ điều kiện khi truy vấn khớp cụ thể với nó. Kiến thức ngữ nghĩa không có hình phạt tự động gần đây. Đánh giá tất định đo lường các sự kiện, tình tiết, quyết định, thủ tục, sự thay thế, mâu thuẫn, tiếng ồn và sự nén Recall.

<a id="optional-provider-enrichment"></a>

## Làm giàu nhà cung cấp tùy chọn

`/memory consolidate` làm phong phú tập hiện tại bằng trò chuyện nhà cung cấp đã được định cấu hình. Tập zero-nhà cung cấp luôn tồn tại đầu tiên. Lỗi nhà cung cấp khiến nó có thể tìm kiếm được. Hợp đồng công cụ có cấu trúc cho phép tối đa sáu ứng viên ngữ nghĩa hoặc thủ tục kỹ thuật, mỗi ứng viên có một trích dẫn nguồn thực sự. Việc làm giàu có thời hạn 15 giây và mức trần sản lượng. Nó không có hệ thống tập tin hoặc công cụ transport. Sau sinh nội dung, host kiểm tra lại các công tắc quyền riêng tư, phiên bản tập, loại bỏ, quyền hạn và ghim trước khi áp dụng ứng viên. Có nguồn gốc từ các cạnh bảo tồn xuất xứ. Xóa nguồn cũng xóa kiến ​​​​thức downstream. Phân cụm giấc mơ vẫn là tùy chọn và không được kích hoạt bởi thay đổi này.

<a id="lifecycle-and-maintenance"></a>

## Vòng đời và bảo trì

Ranh giới phiên tuân theo việc mua lại và phát hành runtime. Ranh giới yêu cầu có các sự kiện riêng biệt. Lỗi của trình quan sát không thể làm gián đoạn quá trình thực thi mô hình hoặc ngăn các trình quan sát khác nhận được sự kiện. Trình bày lời nhắc thành công sẽ phát ra một sự kiện giao hàng tương quan. Chính sách xác nhận và lease hiện có vẫn còn trong bộ lập lịch. Các quan sát dự án bao gồm điểm kiểm tra mà host thực sự đã lưu, thay vì chỉ có tên công cụ. Các lệnh tác vụ thành công cũng phát ra các sự kiện miền và thu nhận dữ liệu kết quả đã lưu của chúng mà không cần lệnh gọi nhà cung cấp. Các lệnh không hợp lệ sẽ không tạo ra sự kiện thành công. Trình biên dịch duy trì các chẩn đoán theo nghĩa đen ngoài đoạn trích văn xuôi của nó, sau đó ưu tiên các quyết định và thất bại trong ngân sách tóm tắt. Lão hóa nguội chạy trong các bước lập chỉ mục nhàn rỗi của có giới hạn. `/memory age` cũng chạy một đường chuyền rõ ràng. Quá trình chuẩn bị bối cảnh tiền cảnh sẽ tạm dừng các lô nhúng và quá trình nén nền mới. Nếu tệp bộ nhớ tùy chọn không hợp lệ, runtime sẽ bỏ qua các công cụ của nó và tiếp tục cuộc trò chuyện kèm theo cảnh báo.

<a id="sqlite-performance-and-cleanup"></a>

## Hiệu suất và dọn dẹp SQLite

Kết nối sử dụng WAL, `synchronous=FULL`, thời gian chờ bận ba giây và điểm kiểm tra tự động dài 512 trang. Bộ đệm câu lệnh đã chuẩn bị sẵn chứa tối đa 48 mục nhập cho mỗi chủ sở hữu. Họ lưu vào bộ nhớ đệm SQL đã biên dịch, không bao giờ là văn bản cá nhân hoặc kết quả tìm kiếm. Tệp đối chiếu cắt tỉa tối đa 32 nguồn gốc cho mỗi giao dịch và sản lượng giữa các lô. Các phép chiếu trang vẫn nằm ngoài việc cắt tỉa tập tin. Văn bản nguồn không thay đổi sẽ giữ lại các vectơ và các trình bảo vệ phiên bản sẽ từ chối việc ghi nhúng cũ.

Gia cố kiểm tra thời gian hồi chiêu của SQL trước khi có được khóa ghi. Ngữ cảnh tự động loại trừ tập riêng của phiên này vì Trò chuyện đã sở hữu lịch sử hoạt động của nó. Recall rõ ràng vẫn có thể truy xuất tập đó. Chỉ có bộ nhớ thực sự được chọn cho bối cảnh mới nhận được sự gia cố. Các phiên bản điểm kiểm tra phiên duy trì lịch sử truy cập hiện có của chúng.

Con trỏ lão hóa có phạm vi sẽ vượt qua các tập được gia cố cũ và tồn tại sau khi phát hành bộ điều hợp. Thẻ nhàn rỗi kiểm tra bốn ứng viên. Quá trình lão hóa rõ ràng kiểm tra tối đa 128 ứng viên. Chỉ số lão hóa trong phạm vi bao gồm thời gian và con trỏ ID của nó. Không yêu cầu chỉ mục truy cập lần cuối hoặc chỉ mục trùng lặp suy đoán riêng biệt.

Hãy quên đi việc duyệt đạo hàm và thay thế cùng nhau. Nó xóa các hình chiếu, vectơ, quan sát nguồn và các cạnh trong một giao dịch. Việc xóa phiên nguồn sẽ bảo tồn kiến ​​thức rõ ràng độc lập sau này. Các mối tương quan bị chặn chỉ nhận dạng sẽ dừng kết quả muộn. Các yêu cầu mới sau khi quên vẫn đủ điều kiện cho thu nhận dữ liệu. Điểm kiểm tra hoạt động phá hủy các khung WAL đã lỗi thời trước khi trả về thành công. Nếu bên đọc bên ngoài ngăn chặn điểm kiểm tra đó, quá trình dọn dẹp sẽ báo lỗi và yêu cầu thử lại sau khi bên đọc phát hành ảnh chụp nhanh của nó. Một cuộc thanh lọc tạm thời sẽ thử dọn dẹp vật lý ngay cả khi cuộc gọi trước đó đã xóa trang. Lọc thông tin xác thực cũng bao gồm các khai báo tiếng Anh và tiếng Việt. Các loại và khóa xác nhận quyền sở hữu nhạy cảm sẽ bị từ chối trước khi lưu trữ. Các chỉnh sửa cá nhân sẽ lọc sạch dữ liệu phái sinh trong khi khóa tệp cá nhân hiện có vẫn được giữ trước khi thay thế JSON nguyên tử. Việc dọn dẹp không thành công khiến thông tin cũ có căn cứ có thể được thử lại một cách rõ ràng. Bia mộ phiên bản nguồn chỉ có danh tính từ chối ảnh chụp nhanh cá nhân cũ từ một người lập chỉ mục khác sau khi quá trình thanh lọc hoàn tất. Thông tin rõ ràng mới có phiên bản nguồn mới và vẫn đủ điều kiện để lập chỉ mục. Việc quên do mô hình điều khiển cũng ngăn chặn phiên đã ghi của yêu cầu đang hoạt động, do đó, việc xác nhận trợ lý của nó không thể tìm hiểu lại ngay sự thật đã quên. Các công cụ mô hình bộ nhớ cá nhân từ chối thông tin xác thực được công nhận bằng cách sử dụng cùng một trình khử trùng. Các chỉnh sửa cục bộ rõ ràng trực tiếp sẽ giữ nguyên hợp đồng lưu trữ hiện tại của họ.

<a id="telegram-session-retention"></a>

## Duy trì phiên Telegram

Cơ sở sản xuất đã mở lại Recall và SQLite cho mọi tin nhắn. So sánh được giữ lại được đo đã làm giảm độ trễ yêu cầu mẫu kiểm thử cục bộ. `AngelaRuntime.acquire` hiện vẫn giữ lại cơ sở hạ tầng Telegram sau khi phát hành. CLI và Discord tiếp tục sử dụng bản phát hành ngay lập tức thông qua `open`. Khóa bộ đệm chứa `dataDir`, workspace, phiên ID và kênh.

TTL không hoạt động mặc định là mười phút, phù hợp với thời gian tồn tại ở trạng thái cấp phép hiện có của Telegram. Giới hạn mặc định là 32 phiên nhàn rỗi. `RuntimeOptions.telegramSessions` định cấu hình cả hai giá trị, với giới hạn tối đa là 64. Giới hạn tám ngữ cảnh hoạt động hiện tại vẫn tách biệt. Các yêu cầu đang hoạt động không bao giờ được đưa vào LRU nhàn rỗi. Các bối cảnh hoạt động, nhàn rỗi và ngừng hoạt động cùng nhau không thể vượt quá `maxIdle + 8`. Một bộ đếm thời gian host hết hạn các mục nhập không hoạt động. Tràn LRU đóng mục nhập ít được phát hành gần đây nhất trước khi quá trình phát hành hoàn tất. Việc mua lại đang chờ xử lý khóa tương tự. Người dùng có các khóa khác nhau tiếp tục đồng thời.

Recall, chỉ mục SQLite, trình theo dõi và bộ đếm thời gian điều chỉnh vẫn tồn tại khi được phát hành nồng nhiệt. Máy khách MCP đóng sau mỗi yêu cầu. Lệnh gọi lại phê duyệt thu nhận dữ liệu của họ yêu cầu kết quả đầu ra và tính bền bỉ, vì vậy việc giữ lại chúng có nguy cơ dẫn đến phê duyệt cũ. Phát hành xóa trình kết nối và gọi lại cảnh báo. Việc mua lại sau này cung cấp các cuộc gọi lại mới. Đặt lại và tắt bộ điều hợp sẽ đóng các danh tính Telegram chính xác, kể cả khi runtime được chia sẻ phục vụ các kênh khác. Tắt máy host hủy bỏ các yêu cầu, chờ ngữ cảnh ngừng hoạt động và đóng tất cả các tài nguyên thuộc sở hữu.

`session.started` xảy ra theo yêu cầu đầu tiên của phiên runtime. `session.ended` xảy ra khi đặt lại, trục xuất TTL/LRU hoặc tắt máy. Yêu cầu bị hủy không kết thúc phiên ấm áp. Tin nhắn sau có thể sử dụng lại Recall của nó. Cuộc trò chuyện liên tục được mở lại sẽ bắt đầu một phân đoạn phiên runtime khác sau khi bị trục xuất hoặc khởi động lại quá trình. Các trang bộ nhớ vẫn bền bỉ trên các phân đoạn đó. Không có tác phẩm LLM nền mới nào được bật.

<a id="observer-diagnostics"></a>

## Chẩn đoán người quan sát

Người quan sát không thể thất bại một yêu cầu. `EventBus.emit` vẫn trả về ngoại lệ của người quan sát cho người gọi rõ ràng. Xe buýt cũng giữ lại tối đa 16 chẩn đoán siêu dữ liệu và một bộ đếm lỗi bão hòa. Mỗi chẩn đoán chỉ chứa loại sự kiện và số lần lỗi. Thông báo lỗi, đối tượng sự kiện và tải trọng riêng tư đều bị loại trừ. runtime ghi tối đa 16 cảnh báo siêu dữ liệu cho mỗi host. `RuntimeOptions.observerError` có thể thay thế cuộc gọi lại này. Lỗi gọi lại bị cô lập. Tắt máy sẽ xóa trình nghe, chẩn đoán và tham chiếu gọi lại.

Telegram cũng sở hữu bộ đếm thời gian có thể hủy cho mỗi yêu cầu hoạt động. Khối `finally` của nó xóa thời hạn, hủy bỏ các bộ điều khiển thời hạn và thời hạn liên tục, đồng thời đóng khóa phiên liên tục. Bộ điều khiển công việc sẽ hủy bỏ khi công việc kết thúc. Yêu cầu thành công không phải đợi năm phút để dọn dẹp thời hạn.
