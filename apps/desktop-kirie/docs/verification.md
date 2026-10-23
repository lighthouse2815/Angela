<a id="kirie-platform-verification"></a>

# Xác minh nền tảng Kirie

[Trạng thái di chuyển](../MIGRATION.md) sở hữu sự chấp nhận hiện tại. [Ablation đánh giá](ablation-review.md) sở hữu bằng chứng đơn giản hóa. Mỗi kết quả chỉ áp dụng cho nền tảng, đường cơ sở phụ thuộc và luồng đã kiểm tra của nó. Các bản dựng và kiểm tra route không thiết lập sự chấp nhận hoặc phạm vi áp dụng của native cho những thay đổi sau này.

Bản ghi đầy đủ [imutable](https://github.com/BeanDz/airi/blob/ef7eb50e5a76265f2675e9072a7430d2dc46f09c/apps/stage-tamagotchi-kirie/docs/verification.md) giữ lại các lệnh, danh sách route và ID thu nhận dữ liệu. artifact cục bộ tạm thời là tài liệu tham khảo bằng chứng, không phải kho lưu trữ mẫu kiểm thử.

<a id="recorded-checks"></a>

## Kiểm tra được ghi lại

| Đường cơ sở | Lệnh và kết quả |
| --- | --- |
| Tích hợp chính, 29-09-2026, hợp nhất `f65867e29` từ `b40e3e87b` | Root kiểm tra kiểu dữ liệu: đã hoàn thành 54 nhiệm vụ. Bản dựng Web/C# và các bài kiểm tra C# đã vượt qua. Vitest: 107 bài kiểm tra đã vượt qua. Đã vượt qua lint nguồn đã stage. Root lint không thành công trên artifact bị bỏ qua. |
| Windows, 2026-09-29, ứng dụng `fdc9161c8` | Ứng dụng kiểm tra kiểu dữ liệu đã được thông qua. Vitest: 13 tệp, 42 bài kiểm tra đã vượt qua. Các bài kiểm tra C# và bản dựng Web/C# đã vượt qua mà không có cảnh báo C#. |
| Cùng phiên Windows | Root kiểm tra kiểu dữ liệu: 53 tác vụ được thông qua, 52 tác vụ được lưu vào bộ nhớ đệm. Root lint: 41 lỗi artifact. `git diff --check` đã vượt qua. |
| Chỉnh sửa Windows Spotlight | Bản dựng C#, bài kiểm tra C#, `dotnet format --verify-no-changes --no-restore` và root kiểm tra kiểu dữ liệu đã vượt qua. Root lint giữ lại 41 lỗi. |

[README](../README.md#checks-and-build) cung cấp chuỗi lệnh. Các kết quả lệnh loại bỏ thành phần lịch sử vẫn còn trong bản ghi lô [ablation](ablation-review.md#historical-command-results). Không có kiểm tra nào trong bảng này mở rộng ma trận nền tảng sau khi đơn giản hóa sau này.

<a id="windows-acceptance-evidence"></a>

## Bằng chứng chấp nhận Windows

Phiên này đã sử dụng Godot 4.7.2 Mono, Kirie 0.6.5, CEF 1.16.1 và Máy tính xách tay NVIDIA RTX 4060 GPU. Một màn hình 3200 × 2000 sử dụng tỷ lệ 200%. Android SDK bị thiếu nằm ngoài phạm vi.

Mười hai cài đặt và Devtools route hiển thị các tiêu đề của chúng mà không gặp lỗi route. native nắm bắt tính minh bạch đã được thiết lập, thứ tự z pin/unpin, hành vi thông báo, liên kết bên ngoài, quyền truy cập thư mục và Trình kiểm tra được kết nối. Cài đặt và Trò chuyện đã đóng qua thanh tiêu đề native và mở lại. Ngôn ngữ Trung Quốc được chuẩn hóa từ `zh-CN` thành `zh-Hans` và vẫn tồn tại khi khởi động lại. Tiếng Anh được khôi phục vẫn tồn tại sau một lần khởi động lại khác. Ngôn ngữ chia sẻ chính và trò chuyện, quyền, localStorage và cookie liên tục. Ctrl+Shift+K vật lý tạo ra các cặp down/up tiền cảnh và hậu cảnh hoàn chỉnh. Người dùng đã chấp nhận hiển thị, chuyển động, đăng nhập, thay đổi kích thước và trạng thái micrô.

<a id="windows-microphone-permission-evidence"></a>

### Bằng chứng cho phép micrô của Windows

Trạng thái, đặt lại, cấp quyền duy trì, từ chối người theo dõi và thu hồi luồng thuộc sở hữu ứng dụng đã được thông qua. track thuộc sở hữu đã thay đổi từ `live` thành `ended` và đầu vào âm thanh vẫn bị tắt. Việc thu hồi Cài đặt sau đó đã trả về `not-determined` và hiển thị `Not set`. Trò chuyện được ghi lại trong ``Must be called at the top of a `setup` function`` thông qua i18n, phân tích và âm thanh store. Việc kiểm tra không chứng minh được việc thu hồi hoặc lỗi Trò chuyện. Người dùng đã chấp nhận GAP-016 và loại trừ ngoại lệ này khỏi lỗi di chuyển. Không có yêu cầu sửa chữa nào được đưa ra sau quan sát này. Một lần khởi động lại thu nhận dữ liệu tạm thời không thành công. [Trạng thái di chuyển](../MIGRATION.md#open-windows-failures) giữ lại quan sát chưa được giải quyết đó.

<a id="windows-chat-evidence"></a>

### Bằng chứng trò chuyện của Windows

Trạng thái chờ ban đầu của micrô không có trình xử lý Trò chuyện. Đã có bản sửa lỗi đính kèm host và lỗi khởi tạo đó không tái diễn. Vòng lặp tạm thời nhà cung cấp trả về các câu trả lời SSE xác định thông qua Trò chuyện UI. Quá trình khởi tạo và hai lần gửi đã hoàn tất. Cả tin nhắn và trả lời vẫn được lưu.

Bài kiểm tra cũng chuyển sang cuộc trò chuyện ban đầu sau khi gửi. Lựa chọn cuộc trò chuyện thử nghiệm đã khôi phục câu trả lời của nó. Bản ghi không tái tạo quá trình chuyển đổi thông qua việc tạo và chọn phiên thông thường hoặc loại trừ các hiệu ứng thiết lập thử nghiệm. Nó không xác định lỗi di chuyển, nguyên nhân nguồn hoặc sửa chữa macOS trước đó.

<a id="windows-spotlight-correction"></a>

### Chỉnh sửa Windows Spotlight

Trước khi sửa, mở trực tiếp đã tạo mục tiêu CEF mà không có cửa sổ native hiển thị. host đã báo cáo `visible=true` và `focused=true`. Kiểu HWND là `0x860B0000` và `IsWindowVisible` trả về `false`. Sau khi sửa, kiểu là `0x960B0000` và khả năng hiển thị trả về `true`. Sự khác biệt là `WS_VISIBLE`.

Lặp lại các bài tập không viền, trên cùng, thay đổi kích thước và khả năng lấy nét sau khi `Show()` viết lại kiểu Windows. Khả năng hiển thị bên trong của Godot vẫn đúng, vì vậy một chiếc `Show()` khác đã không khôi phục khả năng hiển thị của native. Bản sửa lỗi loại bỏ bốn nhiệm vụ lặp lại đó và giữ lại cờ cảnh, độ trong suốt, tiêu điểm native và tiêu điểm CEF. Xem mã hiển thị [Godot Windows](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/display_server_windows.cpp) và [Window code](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/window.cpp).

Mở trực tiếp, mở lặp lại và hide/reopen đã vượt qua. Mã quét `SendInput` Ctrl+Shift+A hiển thị Spotlight và tập trung đầu vào của nó. native thu nhận dữ liệu cho thấy môi trường xung quanh trong suốt tại `(880, 419, 1440, 200)`. Kiểm tra hồi quy bàn phím vật lý và macOS vẫn đang chờ xử lý. Không có sự phụ thuộc nào thay đổi.

<a id="historical-macos-evidence"></a>

## Bằng chứng lịch sử về macOS

| Ngày và đường cơ sở | Phạm vi ghi lại |
| --- | --- |
| 17-09-2026, Kirie 0.3.0, Godot 4.7.1 | Bộ điều hợp host, cửa sổ, quyền, điều hướng và xác thực |
| 18-09-2026 | Tất cả 117 route tĩnh và ba route được tham số hóa ở trạng thái CEF, Thanh tra và tài khoản |
| 19-09-2026, CEF 1.16.0 | Các đầu dò cookie, lưu trữ, BroadcastChannel và Web Lock trên nhiều cửa sổ |
| 20-09-2026, Kirie 0.4.1, CEF 1.16.1 | native mở lại, liên kết, thư mục, thông báo, ngữ cảnh được chia sẻ và sửa chữa Gửi trò chuyện |
| 21-09-2026, Kirie 0.4.2, Godot 4.7.2 | Metal Forward+ tăng tốc OSR, kiểm tra ngữ cảnh lặp đi lặp lại và chấp nhận Spotlight/notification của người dùng |
| 24-09-2026, Kirie 0.6.2 | Khởi động chính và kiểm tra dependency/build |
| 29-09-2026, Kirie 0.6.5 | 36 Node và sáu bài kiểm tra trình duyệt đã vượt qua. Lint trước đó đã ghi lại 32 lỗi artifact. |

Tiện ích, khởi động lớp phủ desktop và cửa sổ lớp phủ thiếu vùng phủ sóng runtime được ghi lại. Kirie không tạo cửa sổ inlay. route của nó giữ lại các tham chiếu Electron. `godot-stage:get-status` vẫn nằm ngoài cột mốc không có mô hình. Một bề mặt sẽ trở thành một khoảng trống sau khi tái hiện lỗi trong phạm vi.

<a id="automation-and-evidence-limits"></a>

## Giới hạn tự động hóa và bằng chứng

AUV 0.0.22, cam kết `2957b9ff`, chạy mà không có bản vá phụ thuộc. Một bản sao mới với `core.symlinks=true` đã giải quyết được lỗi kiểm tra liên kết tượng trưng ban đầu. Xem cấu hình liên kết tượng trưng [Git](https://git-scm.com/docs/git-config#Documentation/git-config.txt-coresymlinks).

Hoạt động của Windows đã thành công thông qua `auv serve` và một Thiết bị rõ ràng, mặc dù CLI gặp lỗi trực tiếp. Xem hướng dẫn [Windows runner](https://github.com/moeru-ai/auv/blob/2957b9ff/docs/ai/references/session-api/2026-08-16-windows-local-runner-ipc-handoff.md). Ở tỷ lệ 200%, việc chụp và giới hạn các pixel vật lý được sử dụng. Nhập tọa độ logic được sử dụng. Đầu vào `(1111, 700)` đặt con trỏ gần `(2223, 1401)` vật lý.

AUV `input.key` đã từ chối Windows. Các kết hợp tổng hợp thông qua `input.holdKeys` đã đạt tới CEF mà không cần gọi lại bằng phím tắt. AUV ghi mã quét bằng 0, trong khi Kirie khớp mã quét. Lời giải thích này vẫn là một giả thuyết. Ctrl+Shift+K vật lý đã vượt qua. Chỉ riêng lỗi tự động hóa không thể từ chối khả năng phím tắt. Xem [AUV input](https://github.com/moeru-ai/auv/blob/2957b9ff/crates/auv-driver-windows/src/input.rs) và [Kirie Thời gian chạy phím tắt Windows](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/GdKirie.Platform/src/GlobalShortcuts/WindowsGlobalShortcutRuntime.cs).

Các bản ghi và bản ghi tạm thời vẫn thuộc `airi-auv-windows-probe/`, `airi-auv-acceptance-records-20260929/` và `airi-gap007/`. Bản ghi đầy đủ bất biến sẽ giữ lại ID chạy của họ. Phiên đã xóa nhà cung cấp, các cuộc hội thoại, cookie, đầu dò lưu trữ, lối tắt và âm thanh track, sau đó dừng nhà cung cấp. Nó khôi phục tiếng Anh, cấp quyền sử dụng micrô và tắt đầu vào âm thanh. Sự chấp nhận ban đầu không thay đổi tệp nguồn hoặc tệp phụ thuộc. Việc sửa Spotlight sau này đã thay đổi nguồn C#.

<a id="current-framework-batch"></a>

## Lô khung hiện tại

Quá trình đơn giản hóa khung 2026-09-30 thay đổi bộ điều hợp host và hệ thống khởi động renderer. Lô này loại bỏ giải pháp thay thế Electron runtime cục bộ và tự động khởi động các dịch vụ Node bị trì hoãn. Nó loại bỏ hai trường hợp kiểm tra Electron lỗi thời và tệp kiểm tra trình cập nhật tĩnh. Không có bài kiểm tra vĩnh viễn nào được thêm vào.

| Lệnh | Kết quả |
| --- | --- |
| `mise x -- pnpm typecheck` | Đã vượt qua, 54 nhiệm vụ bao gồm cả ứng dụng Kirie. |
| `mise x -- pnpm -F @angela/desktop-kirie test:unit` | Đã vượt qua, 12 tệp và 38 bài kiểm tra hiện có. |
| `mise x -- pnpm -F @angela/desktop-kirie build` | Đã vượt qua, nội dung Web và tập hợp C#. C# báo cáo không có cảnh báo hoặc lỗi. Cảnh báo xây dựng Web hiện tại vẫn còn. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests` | Đã chuyển từ thư mục ứng dụng. |
| `mise x -- pnpm kirie dev` | Phiên macOS native bắt đầu với Metal Forward+ và tăng tốc OSR. Ứng dụng thoát đã trả về mã quy trình 0 và bốn rò rỉ ObjectDB. |
| `git diff --name-only --diff-filter=ACMR -z \| xargs -0 mise x -- pnpm exec moeru-lint` | Đã vượt qua mà không có lỗi và có bảy cảnh báo. |
| `mise x -- pnpm lint` | Thất bại với 1.715 lỗi và 698 cảnh báo. Tất cả các tệp lỗi đều bị bỏ qua artifact. |
| `git diff --check` | Đi qua. |

Bài đánh giá native sử dụng Kirie 0.6.5, Godot 4.7.2 và CEF 1.16.1. Yêu cầu Sự kiện thực sự đã mở Cài đặt và Trò chuyện. Các yêu cầu lặp đi lặp lại sẽ sử dụng lại các mục tiêu CEF hiện có của họ. Trang quyền hiển thị tiêu đề của nó và lưu trữ từ chối mà không có lỗi route. Trò chuyện đã khởi tạo và hiển thị thông tin đầu vào của nó. Đánh giá này không gửi yêu cầu nhà cung cấp. Trình kiểm tra plugin chia sẻ đã báo cáo `isAvailable=false`. Tải trước Kokoro cục bộ của người lãnh đạo đã đạt đến trạng thái sẵn sàng. Nhật ký không chứa lỗi yêu cầu khởi động bị trì hoãn.

Spotlight lặp đi lặp lại mở giữ lại một mục tiêu. renderer của chính nó đã ẩn cửa sổ native và Main đã mở lại nó với đầu vào tập trung. Đánh giá đã viện dẫn các hợp đồng native thông qua `agent-browser`. Nó không thực hiện các thao tác trên bàn phím vật lý hoặc thanh tiêu đề. Hai đầu dò đã sử dụng sai renderer cho trình xử lý dành riêng cho cửa sổ và đã bị dừng. Yêu cầu đang chờ xử lý của họ được loại trừ khỏi bằng chứng chấp nhận. Yêu cầu thoát đã đóng CDP trước khi có phản hồi. Quá trình thoát thiết lập việc hoàn thành phân tách, không phân phối phản hồi thoát thành công. Các rò rỉ hiện có, cảnh báo thuộc tính Vue và cảnh báo phụ thuộc native vẫn chưa được giải quyết. Các bước kiểm tra này không thiết lập sự chấp nhận, xác thực của Windows, gửi trò chuyện, kết xuất mô hình hoặc tắt CEF an toàn trên mọi nền tảng.
