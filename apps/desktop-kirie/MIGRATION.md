<a id="stage-tamagotchi-kirie-migration"></a>

# Di chuyển stage Tamagotchi Kirie

Tình trạng: Đang tiến hành. Cập nhật: 2026-09-30.

Tài liệu này sở hữu các quyết định về năng lực, trở ngại, công việc bị trì hoãn và các phần phụ thuộc. [README](README.md) sở hữu các lệnh. [Architecture](docs/host-architecture.md) sở hữu các yêu cầu về runtime. [Ablation review](docs/ablation-review.md) phân tích toàn bộ khung được di chuyển.

<a id="current-acceptance"></a>

## Chấp nhận hiện tại

Windows ghi lại **23 mục đạt, một mục không đạt và năm mục bị trì hoãn**. Bài đánh giá macOS ban đầu đã chấp nhận 24 mục và trì hoãn 5 mục. Không có mục ma trận nào vẫn được kiểm tra một phần hoặc chưa được kiểm tra. Mỗi lượt chỉ bao gồm luồng được ghi lại của nó.

Bài đánh giá macOS runtime ban đầu sử dụng Kirie 0.4.2 vào ngày 21-09-2026. Windows đã sử dụng Kirie 0.6.5 vào ngày 29-09-2026. Các đường cơ sở khác nhau không chứng minh được rằng mọi lỗi của Windows đều liên quan đến nền tảng cụ thể. Sự đơn giản hóa sau này không mở rộng quyết định của nền tảng. Các thay đổi của bộ chuyển đổi host đơn và các thay đổi về khởi động chậm yêu cầu phải có sự kiểm tra riêng sau khi triển khai.

<a id="capability-matrix"></a>

## Ma trận năng lực

`Accepted` ghi lại quyết định ban đầu của macOS. `Pass` ghi lại các lần kiểm tra Windows thành công. `Pass (user review)` xác định sự chấp nhận Windows của người dùng. `Fail` ghi lại hành vi bắt buộc nhưng không thành công. `Deferred` xác định công việc nằm ngoài mốc hiện tại.

Sáu thẻ Windows bao gồm các quyết định chấp nhận của người dùng. Người dùng đã chấp nhận thay đổi kích thước native mặc dù con trỏ không thay đổi trong quá trình xem xét Windows. Vào ngày 30-09-2026, người dùng đã yêu cầu thay đổi kích thước các chỉ báo con trỏ. Xem [thay đổi kích thước chỉ báo con trỏ](docs/ablation-review.md#resize-cursor-indicators-2026-09-30). Việc đánh giá không ngụ ý mức độ bao phủ chưa được báo cáo của nhiều màn hình hoặc mọi nhánh đăng nhập và đăng nhập.

| ID | Năng lực | Quyết định macOS gốc | Windows | Bằng chứng về Windows |
| --- | --- | --- | --- | --- |
| GAP-001 | Lãnh đạo cửa sổ | Đã chấp nhận | Vượt qua | Trạng thái lãnh đạo rõ ràng được sử dụng chính. Cài đặt và trạng thái người theo dõi được sử dụng trong Trò chuyện. |
| GAP-002 | Thay đổi kích thước cạnh native | Đã chấp nhận | Vượt qua (đánh giá của người dùng) | Người dùng xác nhận rằng việc thay đổi kích thước cạnh native hoạt động. Thay đổi chỉ báo con trỏ sau này có bằng chứng [macOS riêng biệt](docs/ablation-review.md#resize-cursor-indicators-2026-09-30). |
| GAP-003 | Trạng thái con trỏ | Đã chấp nhận | Vượt qua | Chuyển động native AUV đã thay đổi tọa độ con trỏ host và trạng thái bên trong. |
| GAP-004 | Hiển thị ảnh chụp nhanh | Đã chấp nhận | Vượt qua (đánh giá của người dùng) | RPC hiển thị và giới hạn hoạt động ở tỷ lệ 200%. Người dùng đã xác nhận hoạt động bình thường của Windows. Không có bằng chứng đa màn hình riêng biệt tồn tại. |
| GAP-005 | Chuyển động và ghim cửa sổ | Đã chấp nhận | Vượt qua (đánh giá của người dùng) | Ghim và bỏ ghim đã thay đổi thứ tự z native so với Explorer. Người dùng đã xác nhận hoạt động bình thường của Windows. |
| GAP-006 | Định tâm cửa sổ | Đã chấp nhận | Vượt qua | Trung tâm đã thay đổi tọa độ native thành `(1150, 400)` cho cửa sổ 900 × 1200. |
| GAP-007 | Tiêu điểm | Đã chấp nhận | Vượt qua | Sau khi sửa cờ cửa sổ, hãy mở trực tiếp và mã quét native Ctrl+Shift+A hiển thị Spotlight. Mở liên tục và hide/reopen đã vượt qua. desktop thu nhận dữ liệu hiển thị đầu vào và độ trong suốt. Hiển thị thông báo trước đó và nhấp để trò chuyện đã được thông qua. Kiểm tra hồi quy bàn phím vật lý và macOS vẫn đang chờ xử lý. |
| GAP-008 | Phím tắt toàn cầu | Đã chấp nhận | Vượt qua | Đăng ký, liệt kê, từ chối trùng lặp và hủy đăng ký đã được thông qua. Ctrl+Shift+K vật lý tạo ra một cặp down/up ở nền trước và một cặp khác ở nền sau. |
| GAP-009 | Vòng đời cửa sổ | Đã chấp nhận | Vượt qua | Các hành động native tạo ra các sự kiện thu nhỏ, khôi phục, làm mờ và lấy nét. |
| GAP-010 | Kênh máy chủ | Trì hoãn | Trì hoãn | Cấu hình và vòng đời của máy chủ Angela yêu cầu hoạt động sidecar bị trì hoãn. |
| GAP-011 | Ngôn ngữ | Đã chấp nhận | Vượt qua | Các thay đổi về ngôn ngữ đã đến một cửa sổ khác và vẫn tiếp tục khởi động lại quá trình. Ngôn ngữ Trung Quốc được chuẩn hóa thành `zh-Hans`. Tiếng Anh cũng sống sót sau lần khởi động lại tiếp theo. |
| GAP-012 | Giới thiệu | Đã chấp nhận | Vượt qua (đánh giá của người dùng) | Việc tạo và tái sử dụng cửa sổ đã được thông qua. Người dùng báo cáo rằng việc giới thiệu có vẻ bình thường trên Windows. |
| GAP-013 | Cửa sổ cài đặt | Đã chấp nhận | Vượt qua | Các cài đặt đã mở, định tuyến, đóng thông qua thanh tiêu đề native và mở lại. |
| GAP-014 | Cửa sổ trò chuyện | Đã chấp nhận | Vượt qua | Trò chuyện đã đóng thông qua thanh tiêu đề native và mở lại. Hai yêu cầu mở tiếp theo đã sử dụng lại một cửa sổ theo dõi tối thiểu. |
| GAP-015 | Thoát ứng dụng | Đã chấp nhận | Thất bại | Cả việc đóng và thoát ứng dụng của native đều dẫn đến vi phạm quyền truy cập CEF. |
| GAP-016 | Trạng thái cho phép micrô | Đã chấp nhận | Vượt qua (đánh giá của người dùng) | Trạng thái cấp phép và thiết lập lại đã hoạt động. Người dùng đã chấp nhận kết quả và loại trừ ngoại lệ renderer khỏi lỗi di chuyển. Xem [Bằng chứng cho phép micrô của Windows](docs/verification.md#windows-microphone-permission-evidence). |
| GAP-017 | Chính sách truy cập micrô | Đã chấp nhận | Vượt qua | Cho phép, từ chối, yêu cầu lặp lại, từ chối người theo dõi, cấp quyền duy trì và thu hồi luồng thuộc sở hữu ứng dụng đã được thông qua. Một thu nhận dữ liệu sau khi khởi động lại tạm thời không thành công. Xem [Bằng chứng cho phép micrô của Windows](docs/verification.md#windows-microphone-permission-evidence) và [quan sát bổ sung](#additional-observations). |
| GAP-018 | Cửa sổ thông báo | Đã chấp nhận | Vượt qua | Xác nhận trả về `true`. Thanh tiêu đề native đóng và mỗi hợp đồng hủy đều trả về `false`. Mỗi thao tác đều đóng cửa sổ. |
| GAP-019 | Đăng nhập tài khoản | Đã chấp nhận | Vượt qua (đánh giá của người dùng) | Người dùng đã xác nhận hành vi đăng nhập Windows. Phiên tự động cũng hiển thị trạng thái tài khoản hiện có. Các chi nhánh hủy đơn lẻ thiếu bằng chứng riêng biệt. |
| GAP-020 | Cửa sổ trong suốt | Đã chấp nhận | Vượt qua | Các ảnh chụp AUV desktop hiển thị các pixel desktop và Explorer xung quanh nhân vật và điều khiển mà không có hình chữ nhật cửa sổ mờ. |
| GAP-021 | Liên kết ngoài | Đã chấp nhận | Vượt qua | URL RPC bên ngoài đã được giải quyết. AUV desktop thu nhận dữ liệu sau này đã hiển thị trang GitHub được yêu cầu trong Chrome. |
| GAP-022 | Thư mục dữ liệu ứng dụng | Đã chấp nhận | Vượt qua | Thư mục dữ liệu RPC trả về thư mục người dùng Godot dự kiến. AUV thu nhận dữ liệu sau này hiển thị thư mục đó trong Explorer. |
| GAP-023 | Plugin host | Trì hoãn | Trì hoãn | Plugin Node.js host và vòng đời tiện ích mở rộng yêu cầu hoạt động sidecar bị trì hoãn. |
| GAP-024 | Artistry | Trì hoãn | Trì hoãn | Cấu hình Artistry và sinh nội dung yêu cầu công việc sidecar bị trì hoãn. |
| GAP-025 | MCP | Trì hoãn | Trì hoãn | Cấu hình MCP và quản lý quy trình stdio yêu cầu công việc sidecar bị trì hoãn. |
| GAP-026 | Đóng gói và cập nhật | Trì hoãn | Trì hoãn | Việc đóng gói, cài đặt và cập nhật sản xuất vẫn nằm ngoài phạm vi di chuyển này. |
| GAP-027 | Thanh tra và Devtools | Đã chấp nhận | Vượt qua | Các yêu cầu của công cụ phát triển native được sử dụng lại một trang. desktop thu nhận dữ liệu hiển thị Thanh tra được kết nối, renderer DOM chính và bản xem trước trực tiếp của nó. |
| GAP-028 | Bối cảnh trình duyệt được chia sẻ | Đã chấp nhận | Vượt qua | Cookie, localStorage, BroadcastChannel và Khóa Web vượt qua các cửa sổ. Các thăm dò cookie liên tục và localStorage vẫn tồn tại trong quá trình khởi động lại. |
| GAP-029 | Khởi tạo trò chuyện và gửi | Đã chấp nhận | Vượt qua | Quá trình khởi tạo, hai yêu cầu và các câu trả lời đã lưu đã được thông qua. Lỗi xử lý thiếu quyền ban đầu không tái diễn. Quan sát lựa chọn phiên thiếu bản sao được xác nhận thông qua các hành động thông thường của người dùng. Xem [Bằng chứng trò chuyện trên Windows](docs/verification.md#windows-chat-evidence). |

<a id="open-windows-failures"></a>

## Mở Windows bị lỗi

<a id="gap-015-application-exit-can-crash"></a>

### GAP-015: Thoát ứng dụng có thể bị lỗi

native đóng đã tái tạo sự cố lúc 17:41:53. Ứng dụng thoát đã sao chép nó vào lúc 18:10:52 với bốn WebViews và một lần nữa vào lúc 19:11:48. host đã ghi lại `destroy_webview`. Sự kiện ứng dụng Windows 1000 đã được báo cáo:

| Lĩnh vực | Giá trị |
| --- | --- |
| Ứng dụng | `Godot_v4.7.2-stable_mono_win64.exe` |
| Mô-đun | `libcef.dll_unloaded`, phiên bản `152.0.6.0` |
| Ngoại lệ | `0xc0000005` |
| Bù đắp | `0x000000000452217a` |

Sự cố xảy ra gần tắt máy. Bằng chứng không xác định được chủ sở hữu của quyền truy cập bộ nhớ không hợp lệ. Xem tham chiếu vi phạm quyền truy cập [](https://learn.microsoft.com/en-us/shows/inside/c0000005) của Microsoft. Lần thoát sau đó trả về mã 0 với hai lần rò rỉ ObjectDB. Thành công không liên tục này không đóng được GAP-015.

<a id="additional-observations"></a>

### quan sát bổ sung

- Trẻ em đóng `Angela host context disposed.` đã ghi nhật ký lúc 18:34:04 thông qua `disposeHostContext` và `disposeRendererHost`. Đóng và mở lại thành công. Lời hứa dọn dẹp vẫn chưa được giải quyết.
- Một yêu cầu micrô sau khi khởi động lại đã trả về `AbortError: Failed due to shutdown`. Việc lặp lại ngay lập tức sẽ trả về trực tiếp track.
- Lỗi lint gốc khác nhau khi thanh toán artifact: Windows ghi lại 41 lỗi. Bài đánh giá macOS sau này ghi nhận 1.715 lỗi và 701 cảnh báo.

<a id="remaining-acceptance-work"></a>

## Công tác nghiệm thu còn lại

| Mục | Yêu cầu theo dõi |
| --- | --- |
| GAP-015 | Giải quyết việc tắt CEF, sau đó lặp lại thao tác đóng native và thoát ứng dụng trên Windows. |
| GAP-002 | Xem lại các chỉ báo thay đổi kích thước con trỏ trên Windows. Việc chấp nhận thay đổi kích thước ban đầu vẫn riêng biệt. |
| GAP-007 | Lặp lại phím tắt vật lý của Windows và kiểm tra hồi quy macOS để điều chỉnh khả năng hiển thị. |
| Vòng đời | Điều tra việc từ chối bối cảnh đã xử lý và rò rỉ ObjectDB. Mã thoát 0 không giải quyết được chúng. |
| Sau này thay đổi nguồn | Lặp lại các luồng native có liên quan. Những bước đi lịch sử không bao gồm những sự đơn giản hóa hiện tại. |
| Bảo hiểm | Bảo toàn [limits](docs/ablation-review.md#coverage-and-blockers) cho đầu vào vật lý, nhiều màn hình, DPI hỗn hợp và xác thực. |

<a id="scope-and-change-rules"></a>

## Phạm vi và quy tắc thay đổi

Mục tiêu là duy trì hoạt động của stage Tamagotchi trong Kirie desktop host. Electron vẫn được hỗ trợ và cung cấp tham chiếu hành vi. Quá trình thiết lập ban đầu, điều chỉnh renderer, phát hiện lỗ hổng, quyền sở hữu bối cảnh và các giai đoạn tích hợp Nền tảng đã hoàn tất. Sự chấp nhận nền tảng vẫn mở.

Cột mốc này không bao gồm kết xuất mô hình, nội dung, gói và phương tiện dành riêng cho mô hình cho Live2D, VRM và MMD. Thông báo Linux vẫn nằm ngoài phạm vi xem xét. [Kirie Platform](https://github.com/moeru-ai/godot-kirie/blob/v0.10.0/packages/platform/README.md#desktop-notifications) liệt kê các chương trình phụ trợ thông báo của macOS và Windows.

1. Tái tạo lỗi trong phạm vi trước khi thêm khả năng.
2. Sử dụng Godot API hoặc vòng đời sở hữu hành vi.
3. Giữ các khả năng chung của desktop trong các dịch vụ Nền tảng và Angela trong Angela.
4. Giữ một bối cảnh Eventa cho mỗi hoạt động của cửa sổ renderer và Godot trên luồng chính.
5. Ghi lại giới hạn Godot đã được chứng minh trước khi tích hợp native hoặc sidecar hoạt động.
6. Nhận được sự phê duyệt rõ ràng đối với các phần phụ thuộc native, các sidecar và các giải pháp phụ thuộc.
7. Giữ nguyên ứng dụng Electron gốc và tách riêng Godot runtime.
8. Không thêm mặt tiền `BrowserWindow` hoặc mock một khả năng còn thiếu.
9. Giữ các lỗi mô hình nằm ngoài mốc này.
10. Không tạo các cam kết trừ khi người dùng yêu cầu chúng.

<a id="deferred-work"></a>

## Công việc bị trì hoãn

| Khoảng cách | Thiếu hành vi | Điều kiện mở lại |
| --- | --- | --- |
| GAP-010 | Cấu hình máy chủ, tải trọng QR, trình nghe và vòng đời WebSocket | Người dùng mở lại công việc sidecar. Angela xác định artifact và vòng đời hoặc chấp nhận máy chủ bên ngoài. |
| GAP-023 | Khám phá plugin, worker, nhập thư mục và vòng đời tiện ích mở rộng | Người dùng mở lại tác phẩm sidecar. Angela sở hữu các tập tin, mô-đun runtime, tắt máy và đóng gói. |
| GAP-024 | Cấu hình Artistry và sinh nội dung | Người dùng mở lại công việc sidecar. Angela sở hữu thông tin xác thực, tính bền bỉ, nhà cung cấp, công việc, nội dung tải xuống và cập nhật Widget. |
| GAP-025 | Cấu hình MCP và quy trình stdio | Người dùng mở lại tác phẩm sidecar. Angela sở hữu cấu hình, tắt quy trình và đóng gói. |
| GAP-026 | Cài đặt và cập nhật sản xuất | Người dùng mở lại bản phát hành. Angela xác định phiên bản, xuất, chữ ký, bảng kê khai, cài đặt và khởi chạy lại. |

Lệnh workspace Node.js không phải là sidecar sản xuất. Không chuyển giao thức máy chủ sang C# như một giải pháp thay thế. Không để lộ thông tin xác thực Artistry trong renderer hoặc phụ thuộc vào trình duyệt CORS để truy cập desktop nhà cung cấp.

<a id="deferred-startup-reference"></a>

### Tham chiếu khởi động bị trì hoãn

Khởi động Kirie không còn kết nối các dịch vụ bị trì hoãn này nữa. store, hợp đồng và triển khai Electron của họ vẫn là tài liệu tham khảo di chuyển. Việc xóa lệnh gọi khởi động không xóa việc tạo store gián tiếp hoặc mọi mục nhập trang. [orie App.vue](https://github.com/BeanDz/airi/blob/ef7eb50e5a76265f2675e9072a7430d2dc46f09c/apps/stage-tamagotchi-kirie/src-web/src/renderer/App.vue#L136-L361) gốc giữ nguyên thứ tự khởi động và đăng ký đã bị xóa.

| Khoảng cách | Việc thực hiện được giữ lại | Đã xóa kết nối khởi động |
| --- | --- | --- |
| GAP-010 | [Cài đặt kênh](src-web/src/renderer/stores/settings/server-channel.ts), [cửa hàng kênh](../../shared/ui/stage/src/stores/mods/api/channel-server.ts) và [Edịch vụ điện tử](../desktop/src/main/services/angela/channel-server/index.ts) | Tìm nạp cấu hình host, áp dụng nó và khởi tạo kênh. |
| GAP-010 | [Cầu ngữ cảnh](../../shared/ui/stage/src/stores/mods/api/context-bridge.ts) và [bộ điều phối nhân vật](../../shared/ui/stage/src/stores/character/orchestrator/store.ts) | Đặt vai trò Spark host, khởi tạo cả store và loại bỏ cầu ngữ cảnh. Những điều này phụ thuộc vào kênh. |
| GAP-023 | [Công cụ plugin](src-web/src/renderer/stores/tools/plugins.ts), [inspector](../../shared/ui/stage/src/stores/devtools/plugin-host-debug.ts) và [Emáy chủ điện tử](../desktop/src/main/services/angela/plugins/host/index.ts) | Cài đặt cầu kiểm tra, khám phá các công cụ, đăng ký thay đổi, đăng ký truy vấn nhà cung cấp và xuất bản các khả năng. |
| GAP-024 | [Cửa hàng nghệ thuật](../../shared/ui/stage/src/stores/modules/artistry.ts) và [Ecầu điện tử](../desktop/src/main/services/angela/widgets/artistry-bridge.ts) | Quan sát cấu hình, loại bỏ ảnh chụp nhanh trùng lặp và gửi cấu hình tới host. |
| GAP-025 | [MCP công cụ](src-web/src/renderer/stores/tools/mcp.ts) và [Edịch vụ điện tử](../desktop/src/main/services/angela/mcp-servers/index.ts) | Khám phá các công cụ MCP khi renderer chính trở thành người dẫn đầu. |
| Phạm vi hiển thị mô hình | [Exe điện tử Godot](../desktop/src/main/services/angela/godot-stage/index.ts) | Truy vấn trạng thái sidecar, đăng ký các thay đổi và chọn Godot renderer. |

Khi một khoảng trống mở lại, hãy triển khai trình xử lý host và quyền sở hữu runtime trước khi khôi phục kết nối khởi động của nó. Đối với GAP-010, hãy khởi tạo kênh trước cầu ngữ cảnh và bộ điều phối ký tự. Giữ trách nhiệm thiết lập và dọn dẹp của họ rõ ràng. Khám phá công cụ và công bố khả năng thuộc về renderer chính. Chỉ khôi phục tính khả dụng của thanh tra khi hoạt động host. Khởi động chậm không được chặn tải trước suy luận cục bộ. Yêu cầu con trỏ Electron cũ vẫn được thay thế bằng triển khai con trỏ [Kirie](src-web/src/renderer/host-context/pointer.ts).

<a id="plugin-directory-import"></a>

### Nhập thư mục plugin

Trình kiểm tra plugin [ được chia sẻ](../../shared/ui/stage/src/stores/devtools/plugin-host-debug.ts) yêu cầu các phương thức chuẩn bị, cam kết và hủy. Kirie không cung cấp cầu nối thanh tra nên `isAvailable` được chia sẻ là sai. store được chia sẻ vẫn giữ lại các lỗi hoạt động không được hỗ trợ rõ ràng. Nó không tạo ra kế hoạch và không ghi tập tin. [page](../../shared/ui/pages/src/pages/devtools/plugin-host.vue) được chia sẻ vẫn giữ trạng thái không khả dụng. Giao diện vẫn không được hỗ trợ cho đến khi GAP-023 mở lại.

Quá trình kiểm tra đóng gói không tìm thấy giá trị đặt trước xuất, quy trình phát hành, nguồn phiên bản hoặc bảng kê khai cập nhật. Phiên bản gói là `0.0.0`. Gói tài nguyên không thể cập nhật các tập hợp C# hoặc thư viện native CEF. Xem hướng dẫn xuất khẩu [](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_projects.html#exporting-from-the-command-line) và hướng dẫn gói tài nguyên [](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_pcks.html#opening-pck-or-zip-files-at-runtime) của Godot. Không thay thế trình cài đặt Electron hoặc đánh dấu bản tải xuống là đã cài đặt. Việc chấp nhận cập nhật yêu cầu tải xuống, kiểm tra tính toàn vẹn, cài đặt, khởi chạy lại và chọn kênh với Kirie artifact đã được phiên bản.

<a id="dependency-baseline"></a>

## Đường cơ sở phụ thuộc

Kirie npm, NuGet và addon Godot sử dụng 0.10.0. Godot và Godot.NET.Sdk sử dụng 4.7.2. Godot CEF sử dụng 2.0.0. Bản phát hành [0.10.0](https://github.com/moeru-ai/godot-kirie/releases/tag/v0.10.0) cung cấp artifact chính thức.

Plugin cốt lõi gói phần bổ trợ Kirie và ghim kho lưu trữ CEF SHA-256. Trạng thái plugin đã cài đặt ghi lại thông báo CEF. macOS artifact đã vượt qua các chữ ký nghiêm ngặt. Windows đã sử dụng D3D12 Forward+ với OSR được tăng tốc.

Vào ngày 29-09-2026, nguồn cấp dữ liệu NuGet v3 đã bỏ qua cả hai gói 0.6.5 và khôi phục không thành công với `NU1102`. Phiên đó đã sử dụng thành công nguồn cấp dữ liệu v2 chính thức:

```sh
mise x -- dotnet restore tests/StageTamagotchiKirie.Tests/StageTamagotchiKirie.Tests.csproj --source https://www.nuget.org/api/v2/ --no-http-cache
```

Kho lưu trữ vẫn giữ lại nguồn NuGet mặc định của nó. Addon[0.10.0 addon](https://github.com/moeru-ai/godot-kirie/blob/v0.10.0/packages/kirie/addon/addons/kirie/csharp/KirieClient.cs) cung cấp trình bao bọc ứng dụng khách C#. Các mục Kirie chính xác bỏ qua `minimumReleaseAge`. Các bản phát hành sau tuân theo chính sách [pnpm thông thường](https://pnpm.io/settings/dependency-resolution).

Việc chấp nhận yêu cầu các gói được xuất bản phối hợp. Không cam kết các phần phụ thuộc `link:`, các mục nhập `ProjectReference` anh chị em hoặc các triển khai Kirie được sao chép. Công việc nguồn anh chị em tạm thời yêu cầu phê duyệt ranh giới phụ thuộc và khoảng cách API được tái tạo.

<a id="completion-requirements"></a>

## Yêu cầu hoàn thành

- Mọi khả năng trong phạm vi đều vượt qua luồng nền tảng của nó hoặc có quyết định bị chặn hoặc trì hoãn rõ ràng.
- Các gói đã xuất bản, CEF artifact và chữ ký khớp với đường cơ sở đã chọn.
- Hợp đồng TypeScript và C# đồng ý, lỗi lan truyền và các hoạt động Godot vẫn nằm trên luồng chính.
- Luồng desktop hoàn chỉnh đi qua mỗi nền tảng chấp nhận.
- Các mục bị trì hoãn vẫn giữ quyền sở hữu rõ ràng và các điều kiện mở lại.

Đối với một lỗi mới, hãy ghi lại thông tin đầu vào, kết quả thực tế, kết quả mong đợi và chủ sở hữu của nó. Sử dụng bản sao tập trung và [README sẽ kiểm tra](README.md#checks-and-build). Đối với thay đổi IPC, hãy bao gồm yêu cầu và phản hồi thực. Hoàn thành đánh giá độc lập trước khi chấp nhận.

[Kiểm tra nền tảng](docs/verification.md) và [đánh giá loại bỏ thành phần](docs/ablation-review.md) lưu bằng chứng kèm ngày tháng. [Bản ghi di chuyển đầy đủ trước đây](https://github.com/BeanDz/airi/blob/ef7eb50e5a76265f2675e9072a7430d2dc46f09c/apps/stage-tamagotchi-kirie/MIGRATION.md) giữ các mô tả dài hơn. Việc sắp xếp lại tài liệu này không bổ sung kết quả nghiệm thu runtime.
