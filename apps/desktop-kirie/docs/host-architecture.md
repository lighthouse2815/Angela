<a id="kirie-host-architecture"></a>

# Kiến trúc Kirie host

[Trạng thái di chuyển](../MIGRATION.md) sở hữu công việc được chấp nhận và trì hoãn. [README](../README.md) sở hữu thiết lập. [Ablation review](ablation-review.md) sở hữu các quyết định đơn giản hóa khuôn khổ.

<a id="runtime-and-ownership"></a>

## runtime và quyền sở hữu

```text
Vue renderer -> Angela Eventa contracts
             -> Kirie Platform and IPC -> Godot and operating-system APIs
             -> Angela Godot handlers -> application windows and services
```

| Chủ sở hữu | Trách nhiệm |
| --- | --- |
| Ứng dụng Angela Kirie | Tích hợp renderer, cửa sổ ứng dụng native, xác thực và quyền |
| Cốt lõi Kirie | Vòng đời WebView và IPC transport |
| Nền tảng Kirie | Khả năng chung của desktop |
| Ứng dụng điện tử | Tham khảo hành vi và ứng dụng được hỗ trợ |
| Dịch vụ Angela Node | Kênh máy chủ trì hoãn, plugin, Artistry và MCP |

Kirie renderer sử dụng một bộ chuyển đổi Kirie host. Chủ sở hữu của nó cung cấp ứng dụng khách Nền tảng được yêu cầu và một ngữ cảnh Eventa cho mỗi renderer. Bộ điều hợp cục bộ Kirie không chọn Electron transport tại runtime. Ứng dụng Electron ban đầu và `capabilities/avatar/godot/` vẫn có các đường dẫn được hỗ trợ riêng biệt.

Các dịch vụ Node bị trì hoãn không khởi động trong bootstrap Kirie renderer. Các trang hiển thị của họ vẫn nằm ngoài khả năng được hỗ trợ cho đến khi Angela cung cấp runtime và vòng đời. Một hoạt động bị từ chối không thiết lập một triển khai.

<a id="source-map"></a>

## Bản đồ nguồn

| Đường dẫn | Trách nhiệm |
| --- | --- |
| [src-web/src/renderer](../src-web/src/renderer) | Bộ điều hợp renderer, host, route và các điểm vào |
| [src-web/src/shared](../src-web/src/shared) | Hợp đồng Angela Eventa |
| [src-godot/scripts](../src-godot/scripts) | Dịch vụ, người quản lý, quyền và xác thực C# |
| [src-godot](../src-godot) | Cảnh native |
| `addons/kirie/` | Đã cài đặt addon và siêu dữ liệu CEF từ bản phát hành chính thức [](https://github.com/moeru-ai/godot-kirie/releases/tag/v0.10.0) |
| [tests/StageTamagotchiKirie.Tests](../tests/StageTamagotchiKirie.Tests) | Kiểm tra hợp đồng C# |
| [kirie.config.ts](../kirie.config.ts) | Xây dựng web, bí danh và lựa chọn route |

Mục Web sản xuất là `res://src-web/dist/index.html`. Phương pháp phát triển [C#](../../../capabilities/avatar/godot/docs/csharp-development-method.md) và hướng dẫn kiểu [](../../../capabilities/avatar/godot/docs/csharp-style.md) vẫn chuẩn.

<a id="required-behavior"></a>

## Hành vi bắt buộc

<a id="window-and-context-lifecycle"></a>

### Vòng đời của cửa sổ và ngữ cảnh

Main nhận `synced-leader=true` trước khi khởi tạo Pinia. Người theo dõi nhận được `synced-leader=false`. Trò chuyện và Tiêu điểm sử dụng `stage-runtime=minimal`. Bộ điều hợp con trỏ, màn hình, hành động cửa sổ và vòng đời đều mượn cùng một bối cảnh host. Vị trí hiển thị sử dụng một ảnh chụp nhanh nguyên tử. Kết quả bên trong con trỏ của Kirie ghi đè giới hạn renderer cũ.

Godot sở hữu khả năng thay đổi kích thước, di chuyển, đóng yêu cầu và dọn dẹp trẻ em. Người quản lý sử dụng lại cửa sổ, tra cứu Devtools có khóa, yêu cầu route và tệp đính kèm dịch vụ. Cài đặt giữ lại route mới nhất của nó trước khi sẵn sàng. Thông báo được giải quyết một lần, với `true` để xác nhận và `false` để hủy hoặc đóng. Những yêu cầu này không chứng minh được một trình quản lý chung cho tất cả các loại cửa sổ.

Godot thoát khỏi trẻ em trước cha mẹ. Trình quản lý `TreeExiting` gọi lại xóa các tham chiếu con trước khi Main loại bỏ các dịch vụ. Đăng ký Eventa do người gọi sở hữu kết thúc trước ngữ cảnh hoặc dịch vụ của họ. Các biện pháp bảo đảm về tính sẵn sàng, thời gian ân hạn tập trung, việc hủy bỏ và hoàn thành đều có ý nghĩa riêng biệt. Xem vòng đời [Godot](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/node.cpp) và [Window](https://docs.godotengine.org/en/4.7/classes/class_window.html).

Độ trong suốt yêu cầu alpha trong nền CEF, khung nhìn gốc và mỗi cửa sổ native. Bộ điều hợp thoát vẫn giữ lại trình gọi không có đối số API và gửi tải trọng host trống rõ ràng.

<a id="spotlight-and-permissions"></a>

### Tiêu điểm và quyền

Angela quản lý cửa sổ native dùng lại của Spotlight, các hợp đồng và `user://spotlight.cfg`. Việc đăng ký phím tắt này độc lập với đăng ký do renderer quản lý. `unregisterAll` của renderer không được hủy Spotlight. Đóng cửa sổ hoặc mất tiêu điểm sẽ ẩn Spotlight. Thông báo mở Chat. `beforeunload` hủy đăng ký phím tắt khi tải lại CEF. CEF `FocusMode` và `GrabFocus()` vẫn cần thiết.

Angela sở hữu trạng thái micrô trong `user://permissions.cfg`. Chỉ có nguồn gốc renderer chính xác mới có thể phát ra âm thanh thu nhận dữ liệu. Các nguồn gốc, cửa sổ và loại quyền khác sẽ bị từ chối. Chính sách CEF `Signal` nhóm các ID yêu cầu native phía sau một prompt ID mờ. Từ chối, đóng phương thức, thời gian chờ hai phút và tắt máy từ chối các yêu cầu đang chờ xử lý. Xem quyền [CEF API](https://github.com/dsh0416/godot-cef/blob/v1.16.1/docs/api/methods.md#permission-handling).

Mọi cửa sổ đang chờ trạng thái cấp phép đều yêu cầu trình xử lý Angela. `MicrophonePermissionService.Attach` cung cấp cho họ, trong khi chỉ có Main sở hữu prompt. Một lần nhấp vào nút bật rõ ràng sẽ đặt lại từ chối đã lưu trữ. Yêu cầu tự động giữ lại sự từ chối. Gian hàng Trò chuyện ban đầu là do trình xử lý bị thiếu trước `chatStore.initialize()`. Đề xuất từ chối mặc định upstream [kirie#87](https://github.com/moeru-ai/godot-kirie/pull/87) đã đóng mà không hợp nhất.

<a id="authentication-and-desktop-services"></a>

### Dịch vụ xác thực và desktop

Angela sở hữu trình duyệt hệ thống OIDC với PKCE, xác thực trạng thái và trình nghe vòng lặp tạm thời. renderer cung cấp cho máy chủ URL và máy khách ID trước khi đăng nhập. Đăng xuất hủy đăng nhập chưa hoàn thành. Xem [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html).

Các yêu cầu HTTP(S) bên ngoài sử dụng Nền tảng `openExternalUrl()`. Angela từ chối những âm mưu khác. Nền tảng xác thực URL tuyệt đối trước `OS.shell_open()`. Việc xử lý sẽ khôi phục `window.open` và xóa trình xử lý nhấp chuột. Thư mục dữ liệu API không chấp nhận đường dẫn người gọi. Godot chọn `OS.get_user_data_dir()` và truyền bá các lỗi OS.

Việc lựa chọn thanh tra yêu cầu mục tiêu dẫn đầu và `devtoolsFrontendUrl` có thể sử dụng được, bất kể thứ tự mục tiêu. Quá trình sản xuất vô hiệu hóa việc gỡ lỗi từ xa. Xem đường cơ sở bảo mật [CEF](https://github.com/dsh0416/godot-cef/blob/v1.16.1/docs/api/security-baseline.md). Ranh giới có khóa route sẽ cách ly các lỗi renderer. Ngữ cảnh CEF được chia sẻ sẽ bảo tồn cookie, bộ lưu trữ, BroadcastChannel và Khóa Web trên các cửa sổ.

Công cụ chạy lại chuyển tiếp `invocationId` được chia sẻ để chọn một lệnh gọi trong số các giá trị `toolCallId` lặp lại. Triển khai chạy lại [ được chia sẻ](../../../shared/ui/stage/src/stores/tool-call-rerun.ts) sở hữu tính năng từ chối mục tiêu, thay thế kết quả và vô hiệu hóa tính năng tiếp tục phụ thuộc.
