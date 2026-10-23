<a id="kirie-ablation-review"></a>

# Xem đánh giá loại bỏ thành phần

Ngày đánh giá: 29-09-2026 đến 30-09-2026. Cơ sở thử nghiệm lịch sử: Kirie 0.6.5, Godot 4.7.2, macOS Metal Forward+.

Đánh giá này phân tích các ranh giới khung, tính trừu tượng, quyền sở hữu và phương pháp triển khai. Nó không mở rộng ma trận chấp nhận nền tảng [](../MIGRATION.md#capability-matrix) hoặc đóng Windows CEF. Đánh giá đầy đủ [immutable](https://github.com/BeanDz/airi/blob/ef7eb50e5a76265f2675e9072a7430d2dc46f09c/apps/stage-tamagotchi-kirie/docs/ablation-review.md) giữ lại nhật ký và lệnh cho mỗi thử nghiệm.

<a id="whole-framework-decisions"></a>

## Quyết định toàn bộ khuôn khổ

Quá trình di chuyển cung cấp desktop host xung quanh ứng dụng Vue hiện có. Các lớp thiết yếu của nó là renderer, một chủ sở hữu transport, các khả năng của desktop và các dịch vụ ứng dụng Angela. Lựa chọn runtime bên trong mỗi bộ chuyển đổi không bổ sung thêm yêu cầu nào đối với ứng dụng chỉ dành cho Kirie.

| Lớp | Quyết định | Lý do và ranh giới |
| --- | --- | --- |
| Ứng dụng Electron gốc và Godot sidecar | Giữ lại | Cả hai vẫn được hỗ trợ. Các yêu cầu runtime của họ không phù hợp với mã Electron phương án dự phòng bên trong bộ điều hợp cục bộ Kirie. |
| Bộ chuyển đổi Kirie renderer host | Chuyên | Một chủ sở hữu Kirie cung cấp ứng dụng khách Nền tảng bắt buộc và bối cảnh Sự kiện. Xóa thẻ runtime, đường dẫn Nền tảng tùy chọn và các lựa chọn thay thế Electron có thể thực thi được. |
| Hợp đồng desktop UI được chia sẻ | Giữ lại | UI được chia sẻ hiện tại vẫn sử dụng bộ chọn bản dựng `RUNTIME_ENVIRONMENT='electron'` và ID sự kiện có tên Electron. Tên không chọn Electron transport. |
| Khởi động renderer | Xóa khởi động bị trì hoãn | Kênh máy chủ, cầu máy chủ ký tự, plugin, Artistry và MCP thiếu Node runtime được hỗ trợ. Việc khởi tạo chúng không được tạo ra các yêu cầu chưa đăng ký hoặc thử lại các vòng lặp. |
| Thanh tra plugin | Hiển thị trạng thái không có sẵn | Không có cầu Kirie giả nào quảng cáo nhập thư mục. Tính khả dụng được chia sẻ là sai và các hoạt động không được hỗ trợ sẽ giữ lại các lỗi rõ ràng. |
| Dịch vụ C# và trình quản lý cửa sổ | Giữ quyền sở hữu tên miền | Devtools có khóa, Trò chuyện có thể sử dụng lại, Cài đặt route mới nhất, Ẩn tiêu điểm và Hoàn thành thông báo có hành vi khác nhau. Người quản lý chung thêm chi nhánh và quyền sở hữu tối nghĩa. |
| Tóm tắt vòng đời | Sử dụng Godot và quyền sở hữu người gọi | Đăng ký con và đăng ký thuộc sở hữu của người gọi thay thế các bộ đăng ký ngược và gọi lại đóng thủ công. |
| Trạng thái sẵn sàng, trọng tâm và thông báo | Giữ lại trạng thái riêng biệt | Yêu cầu trước khi sẵn sàng khác với khả năng hiển thị. Thời gian gia hạn tập trung bảo vệ đầu vào native. Thông báo phải hoàn thành một lần trước khi xóa. |
| Biến đổi chung | Sử dụng các API hiện có | Godot chọn màn hình. .NET mã hóa Base64URL. Nền tảng sở hữu các lệnh native. Người trợ giúp chuyển tiếp không thêm hành vi nào. |
| Triển khai con trỏ | Giữ lại phiếu bầu | Nguyên mẫu sự kiện đã giảm yêu cầu nhưng đã thêm trạng thái và mã. Trạng thái bên trong cửa sổ native loại bỏ hình học trùng lặp mà không có vòng đời mới. |
| Bản sao nguồn renderer | Trì hoãn khai thác | Quá trình kiểm tra đếm được 207 tệp, 168 bản sao Electron, 93 tệp giống hệt nhau và 75 bản sao khác nhau. Số lượng này mô tả sự chồng chéo, xóa không an toàn. |
| Tắt máy CEF | Giữ trở ngại mở | Vi phạm quyền truy cập Windows và rò rỉ ObjectDB vẫn còn. Đơn giản hóa nguồn và mã thoát macOS 0 không thiết lập việc phân tách an toàn. |

Số lượng tệp mô tả quá trình kiểm tra nguồn tại `ef7eb50e5` cơ sở, trước đợt này. Bản sao renderer vẫn là ranh giới trùng lặp lớn nhất. Việc trích xuất yêu cầu quyền sở hữu các điểm truy cập được chia sẻ, route, hợp đồng, tài sản, bí danh xây dựng và hành vi dành riêng cho nền tảng. Một thiết kế khai thác riêng biệt có thể so sánh 75 đối tượng khác nhau trước khi hợp nhất. Không thay thế công việc này bằng một tấm gương được tạo ra hoặc một renderer có điều kiện rộng.

Lô hiện tại chuyên hóa bộ điều hợp và loại bỏ các phần phụ thuộc khởi động không được hỗ trợ. Nó loại bỏ cầu nối bối cảnh máy chủ và khởi động ký tự phụ thuộc vào `ensureConnected`. Sau đó, đường dẫn tải trước trình duyệt của người lãnh đạo sẽ có thể truy cập được. [Kiến trúc máy chủ](host-architecture.md) ghi lại các yêu cầu kết quả.

kiểm tra kiểu dữ liệu gốc bao gồm Kirie. Các lệnh kiểm tra gốc không chạy bộ giao diện người dùng cục bộ hoặc C# bộ kiểm thử. Bộ giao diện người dùng cục bộ bao gồm các bộ điều hợp host và ngữ cảnh cửa sổ. Các bài kiểm tra renderer được sao chép bên ngoài lựa chọn đó không phải là bằng chứng chấp nhận. [Xác minh hiện tại](verification.md#current-framework-batch) ghi lại các lệnh lô rõ ràng và phạm vi phủ sóng native.

<a id="historical-experiments-120"></a>

## Thí nghiệm lịch sử 1–20

Những hàng này giữ lại các quyết định thử nghiệm ban đầu. Chuyên môn hóa host đơn lẻ sau này thay thế các lựa chọn thay thế Electron cục bộ Kirie được mô tả trong thí nghiệm 17. Bảng mô tả bằng chứng lịch sử chứ không phải sự chấp nhận mới cho lô hiện tại.

| ID | Quyết định và loại bỏ | Bằng chứng được ghi nhận mạnh mẽ nhất |
| --- | --- | --- |
| 1 | Giữ lại tra cứu `KirieNode/KirieCefWebView` trực tiếp. Xóa tìm kiếm con và tiêu điểm `KirieNode` không hợp lệ phương án dự phòng (36 dòng). | Đường cơ sở và thay đổi đầu vào mở đầu tiên của native, Thoát ẩn, mở lại, làm mờ và tiêu điểm mở lặp lại đã được thông qua. Tên addon được ghim và thứ tự sẵn sàng vẫn là yêu cầu. |
| 2 | Giữ lại đăng ký Trò chuyện do người gọi sở hữu. Xóa `OpenBinding`, lệnh gọi lại tách ngược ngược và bộ đăng ký (35 dòng). | native mở, mở lặp lại, đóng thanh tiêu đề và mở lại Spotlight đã qua. Trang Trò chuyện thay thế đã được khởi tạo. Cả hai lối ra đều báo cáo bốn lần rò rỉ. |
| 3 | Giữ lại các ràng buộc Devtools do người gọi sở hữu. Xóa quyền sở hữu ngược, bộ đăng ký và vòng lặp xử lý (16 dòng). | Chính và Cài đặt đã sử dụng lại các cửa sổ có khóa, đóng và tạo lại chúng. Cài đặt được tạo lại đã mở Thanh tra chính. Cả hai lối thoát hiểm đã hoàn thành đều báo cáo có năm lần rò rỉ. |
| 4 | Giữ lại `Window.Visible`. Xóa `_userVisible` trùng lặp (ba dòng). | Đầu vào native, Thoát, ẩn lặp đi lặp lại, mở lại và làm mờ Cài đặt được thông qua với một mục tiêu Spotlight. Cả hai lối ra đều báo cáo ba lần rò rỉ. Khoảng thời gian toàn màn hình cơ sở không giải thích được đã bị loại trừ. |
| 5 | Yêu cầu người lãnh đạo thanh tra mục tiêu. Xóa phương án dự phòng trang đầu tiên (bảy dòng). | Hồi quy chỉ dành cho người theo dõi mới không thành công đối với bộ chọn cũ và được thông qua sau khi xóa. trực tiếp Yêu cầu chính và cài đặt được chọn Chính mặc dù thứ tự mục tiêu của người theo dõi là đầu tiên. |
| 6 | Xóa `_closing` trùng lặp trong cửa sổ Trò chuyện, Cài đặt, Giới thiệu và Nhà phát triển (28 dòng). | Tất cả bốn cửa sổ native đều đóng và mở lại. Thoát khỏi Devtools trả về mã 0 và chín rò rỉ. Thông báo giữ lại bảo vệ hoàn thành của nó. |
| 7 | Xóa bộ sưu tập đăng ký người gọi của Auth (chín dòng). Giữ lại các tấm bảo vệ ràng buộc và sinh nội dung. | Các đầu dò baseline/changed thực tế tạm thời bao gồm các lỗi xếp hàng, xử lý người gọi, sử dụng lại đăng ký và vô hiệu hóa đăng xuất. Họ không thực hiện đăng nhập trình duyệt đang hoạt động. |
| 8 | Thay thế sáu lệnh gọi lại đóng cửa sổ thủ công bằng `TreeExiting` (21 dòng). Giữ lại kiểm tra danh tính. | native mở lại và thông báo các luồng true/false đã được thông qua. Spotlight đã sử dụng lại một mục tiêu. Thoát với sáu loại cửa sổ đã báo cáo 13 rò rỉ và các lỗi renderer đã xử lý hiện có. |
| 9 | Sử dụng `string.Join`. Xóa `FormatModifiers` (năm dòng) và xác nhận thư viện tiêu chuẩn (bốn dòng thử nghiệm). | Các thử nghiệm chính sách hiện tại và kiểm tra bản dựng đã được thông qua. Luồng lưu trữ lâu dài của UI không được lặp lại. |
| 10 | Sử dụng `DisplayServer.GetScreenFromRect`. Xóa bộ chọn màn hình (27 dòng) và các bài kiểm tra của nó (mười dòng). | Đầu dò native tạm thời đã so sánh 20 điểm ranh giới và ngoài màn hình mà không khớp. Spotlight đã sử dụng lại một mục tiêu. Thoát báo cáo hai rò rỉ. |
| 11 | Trả về trực tiếp các lệnh trên cùng và căn giữa đã chọn (18 dòng). | Các thử nghiệm hành động cửa sổ hiện có đã được thông qua. Nền tảng ghi lại lệnh gọi mà không cần `this`. Không có sự chấp nhận native bổ sung nào sau đó. |
| 12 | **Hủy quan sát con trỏ theo hướng sự kiện.** Giữ lại hành vi thăm dò, thử lại và DPI ban đầu. | Nguyên mẫu đã giảm các yêu cầu cố định từ 41 yêu cầu mỗi giây xuống 0 nhưng đã bổ sung thêm 26 dây chuyền sản xuất và trạng thái vòng đời. Sự giảm thiểu đó không phải là hành vi hiện tại. |
| 13 | Đọc nền tảng từ chủ sở hữu hiện tại. Xóa bộ chuyển tiếp của nó (ba dòng). | Việc xem xét nguồn đã bảo vệ chủ sở hữu trong các thông báo bị trì hoãn thay vì tạo lại một thông báo sau khi xử lý. Không có sự chấp nhận native mới nào được theo sau. |
| 14 | Tin tưởng trạng thái bên trong cửa sổ hiện có. Xóa so sánh giới hạn được lưu trong bộ nhớ cache (sáu dòng). | Quá trình tái tạo trình duyệt tạm thời không thành công trước khi xóa và được chuyển sau đó với chiều rộng được lưu trong bộ nhớ đệm là 800, x=900 và native `inside=true`. Trạng thái sai lầm tiếp theo cũng trôi qua. |
| 15 | Trả lại trực tiếp con trỏ Kirie. Loại bỏ chuyển tiếp boolean. | Hai trường hợp real-Platform/Eventa tạm thời đã được thông qua trước và sau khi loại bỏ để loại bỏ đúng, sai và host. Nhấp qua native không được thực hiện. |
| 16 | Sử dụng lại HTTP(S) URL đã phân tích cú pháp. Loại bỏ phân tích cú pháp trùng lặp. | Sáu trường hợp Chrome tạm thời đã được thông qua trước và sau khi loại bỏ để định tuyến, sơ đồ, từ chối và loại bỏ host. Việc ra mắt trình duyệt OS vẫn bị chế giễu. |
| 17 | Trả lại trực tiếp bốn lệnh gọi Electron hiện có. Loại bỏ các trình bao bọc chỉ lệnh. | Bốn trường hợp Eventa thực tạm thời được thông qua trước và sau khi loại bỏ hình dạng đối số và từ chối. native Electron thoát, đăng nhập và các phím tắt không được thực hiện. |
| 18 | Sử dụng .NET `Base64Url.EncodeToString`. Loại bỏ các thay thế thủ công. | Đầu dò Eventa PKCE thực tế tạm thời đã vượt qua 16 vòng trước và sau khi thay thế. Nó bao gồm việc từ chối trạng thái, mã bị thiếu, gửi lại lệnh gọi lại và hủy bỏ trình nghe đăng xuất. |
| 19 | Để trẻ thoát khỏi cửa sổ Devtools. Xóa trình quản lý close/clear trong quá trình xử lý. | Hai lần chạy native đã mở hai khóa, sử dụng lại một khóa và thoát. Cả hai chẩn đoán xử lý đều báo cáo không có cửa sổ được theo dõi, mã thoát 0 và ba lần rò rỉ. |
| 20 | Cho phép trẻ thoát khỏi các tham chiếu Tiêu điểm và Thông báo rõ ràng. Xóa trình quản lý đóng trong quá trình xử lý. | Hai native chạy Spotlight được sử dụng lại và thoát ra với Thông báo đang chờ xử lý. Chẩn đoán đã báo cáo thông tin hoàn thành sai và tham chiếu rỗng. Cả hai lối ra đều báo cáo ba lần rò rỉ. |

Thí nghiệm 5 vẫn giữ nguyên trường hợp hồi quy có ý nghĩa. Tất cả các thăm dò và chẩn đoán bổ sung khác vẫn là tạm thời và đã bị xóa. Thí nghiệm 9 và 10 đã loại bỏ các bài kiểm tra về những người trợ giúp đã bị xóa. Các bài kiểm tra hành vi hiện tại vẫn còn. Số lượng giao diện người dùng tạm thời là 44 cho thử nghiệm 15, 48 cho 16 và 46 cho 17. Mỗi số lượng bao gồm 42 thử nghiệm hiện có trong lịch sử.

<a id="why-the-retained-design-works"></a>

## Tại sao thiết kế được giữ lại hoạt động

Godot thoát khỏi trẻ em trước cha mẹ của chúng. `TreeExiting` tuân theo `_ExitTree` của trẻ và đi trước việc xử lý của cha mẹ. `TreeExited` chạy quá muộn cho chuỗi quyền sở hữu đó. Xem vòng đời của [](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/node.cpp) được ghim bởi Godot.

`Hide()` và `QueueFree()` lặp đi lặp lại không thêm yêu cầu trạng thái đóng riêng biệt. Thông báo khác vì việc hủy và hoàn thành lệnh gọi lại có thể xảy ra trước khi xóa. Xem triển khai [Window](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/window.cpp) và [queue_free hợp đồng](https://docs.godotengine.org/en/stable/classes/class_node.html#class-node-method-queue-free).

Máy khách Nền tảng [ được ghim](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/platform/src/index.ts) ghi lại các lệnh gọi mà không cần `this`. [native Host](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/GdKirie.Platform/src/GdKiriePlatformHost.cs) của nó sử dụng kích thước cửa sổ hiện tại cho trạng thái bên trong con trỏ. Lựa chọn màn hình [](https://github.com/godotengine/godot/blob/4.7.2-stable/servers/display/display_server.cpp) của Godot cung cấp thuật toán hình chữ nhật hiện có. .NET 10 cung cấp mã hóa [Base64URL](https://learn.microsoft.com/en-us/dotnet/api/system.buffers.text.base64url.encodetostring?view=net-10.0). Đầu dò xác thực tạm thời đã so sánh trình xác minh và thử thách của nó với [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636).

<a id="historical-command-results"></a>

## Kết quả lệnh lịch sử

Các lệnh này mô tả các đợt thử nghiệm trước đó, trước khi chuyên môn hóa khung hiện tại.

| Lệnh | Kết quả được ghi lại |
| --- | --- |
| `mise x -- dotnet build StageTamagotchiKirie.csproj --no-restore` | Đạt sau khi loại bỏ đầu dò, không có cảnh báo hoặc lỗi. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Đạt sau khi loại bỏ đầu dò. Trường hợp mới của Thí nghiệm 5 đã thất bại trên bộ chọn cũ trước tiên. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Đi qua. Cả hai lần kiểm tra định dạng dự án cũng đã được thông qua trong các đợt trước đó có liên quan. |
| `mise x -- pnpm -F @angela/desktop-kirie test:unit` | Đạt sau khi loại bỏ đầu dò: 13 tệp và 42 bài kiểm tra hiện có. |
| `mise x -- pnpm -F @angela/desktop-kirie typecheck` | Đạt sau khi loại bỏ đầu dò. |
| `mise x -- pnpm typecheck` | Đợt xét duyệt đã vượt qua tất cả 54 nhiệm vụ. |
| `mise x -- pnpm exec moeru-lint <changed documentation and host adapters>` | Đã vượt qua cho các tập tin đã thay đổi được ghi lại. Đánh giá đầy đủ bất biến giữ lại các đối số tệp chính xác. |
| `mise x -- pnpm lint` | Thất bại với 1.715 lỗi và 701 cảnh báo. Tất cả các lỗi đều nằm ở 23 tệp artifact bị bỏ qua. |
| `git diff --check` | Đã vượt qua các đợt đã ghi. |

Các thí nghiệm 15–20 đã loại bỏ tổng cộng 37 dây chuyền sản xuất. Đánh giá giao diện người dùng trước đó giữ lại mức giảm 27 dòng. Khôi phục thông thường đã giải quyết nội dung GodotSharp 4.7.1 cũ trong thử nghiệm 2 và xem lại con trỏ. Không có cách giải quyết cấu hình gói hoặc phụ thuộc nào được thêm vào. Một lần chạy định dạng chỉ nhận xét đã báo cáo cảnh báo tải workspace. Kiểm tra định dạng dự án rõ ràng sau đó đã được thông qua. Nguồn đánh giá độc lập không tìm thấy khiếm khuyết nào trong các thí nghiệm được giữ lại. Đánh giá đó bao gồm hệ thống ống nước desktop, không phải mọi khung hoặc chức năng được di chuyển.

<a id="resize-cursor-indicators-2026-09-30"></a>

## Thay đổi kích thước chỉ báo con trỏ (2026-09-30)

Main chuyển tiếp `Node._Input` sang bộ điều khiển thay đổi kích thước native hiện có. Chuyển động của cạnh đặt con trỏ ngang, dọc hoặc chéo, sau đó sử dụng sự kiện. Chuyển động bên trong vẫn khả dụng đối với con trỏ tay hoặc văn bản của WebView. Phát hiện cạnh, chia tỷ lệ DPI, thay đổi kích thước native và dọn dẹp con trỏ vẫn không thay đổi.

Lệnh gọi lại `WindowInput` trước đó đặt con trỏ trước đầu vào GUI. Điều khiển được di chuột đã thay thế nó trong cùng một sự kiện. Xem công văn đầu vào [Window](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/window.cpp#L2020) và [Xử lý khung nhìn](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/viewport.cpp#L3502).

Một đầu dò macOS tạm thời đã tải Main và thêm Điều khiển bằng con trỏ tay và văn bản. Tất cả tám hướng đều giữ con trỏ qua khung tiếp theo. Chuyển động bên trong, thoát cửa sổ và thay đổi kích thước bị vô hiệu hóa đã khôi phục con trỏ Điều khiển. Tất cả 28 khẳng định đã được thông qua. Cuộc thăm dò không bổ sung thêm thử nghiệm vĩnh viễn nào. Đã vượt qua quá trình xây dựng, kiểm tra và kiểm tra định dạng C#. Lối ra native trả về mã 0 với hai lần rò rỉ. Root lint vẫn giữ lại các lỗi artifact đã ghi lại. Việc xem xét con trỏ Windows vẫn đang chờ xử lý.

<a id="coverage-and-blockers"></a>

## Vùng phủ sóng và trở ngại

Các thử nghiệm native trước đây đã sử dụng macOS Metal Forward+. Chúng không thiết lập việc tắt Windows, phím tắt vật lý, nút đóng vật lý, nhấp qua native hoặc hành vi hỗn hợp DPI. Đầu dò màn hình một màn hình không bao gồm nhiều màn hình hoặc Wayland. Đầu dò PKCE không thiết lập khởi chạy trình duyệt hệ thống, đăng nhập tài khoản hoặc trao đổi token.

Mã thoát 0 xảy ra cùng với số lần rò rỉ ObjectDB từ một đến 13. Việc từ chối renderer đã xử lý và lỗi dịch vụ trì hoãn cũng đã xảy ra. Sự cố Windows vẫn là sự di chuyển của trở ngại. Những quan sát này yêu cầu điều tra vòng đời hơn là một sự trừu tượng hóa việc dọn dẹp chung chung. Các bước kiểm tra đang chờ xử lý và các điều kiện mở lại bị trì hoãn vẫn còn trong [MIGRATION.md](../MIGRATION.md#remaining-acceptance-work).

Lô bộ điều hợp và bootstrap hiện tại có số lượng kiểm tra nguồn và giao diện người dùng khác nhau. Kết quả của nó thuộc về [xác minh khung hiện tại](verification.md#current-framework-batch), không phải các hàng lịch sử.
