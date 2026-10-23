<a id="live-debugging-from-the-godot-editor"></a>

# Gỡ lỗi trực tiếp từ trình soạn thảo Godot

Sử dụng quy trình làm việc này khi Electron là host thật và mô hình được chọn từ cửa sổ cài đặt Tamagotchi, nhưng cảnh runtime đã nhập cần phải được kiểm tra trong trình chỉnh sửa Godot.

<a id="required-process-order"></a>

## Thứ tự quy trình bắt buộc

1. Khởi động trình soạn thảo Godot đối với dự án này:

   ```powershell
   & $env:GODOT4 -e --path .\engines\stage-tamagotchi-godot
   ```

2. Trong trình chỉnh sửa Godot, bật:

   ```text
   Debug -> Keep Debug Server Open
   ```

3. Khởi động ứng dụng phát triển Electron từ shell đã bật tính năng gỡ lỗi từ xa:

   ```powershell
   $env:GODOT_STAGE_REMOTE_DEBUG = "1"
   $env:GODOT_STAGE_REMOTE_DEBUG_URI = "tcp://127.0.0.1:6007"
   nr dev:desktop
   ```

4. Trong cửa sổ cài đặt Tamagotchi, khởi động Godot stage thử nghiệm và chọn VRM mô hình.

5. Trong trình chỉnh sửa Godot, kiểm tra cảnh đang chạy:

   ```text
   Scene dock -> Remote -> /root/Node3D/AvatarRoot/Avatar_<modelId>
   ```

Không sử dụng nút Chạy của trình soạn thảo cho đường dẫn tích hợp này. Quá trình do trình soạn thảo chạy không nhận được `--airi-ws-url` của Electron, vì vậy nó không thể hiển thị mô hình do Tamagotchi vật chất hóa và gửi qua sidecar WebSocket.

<a id="how-it-works"></a>

## Nó hoạt động như thế nào

Khi `GODOT_STAGE_REMOTE_DEBUG=1` được đặt, Electron khởi chạy Godot sidecar với các đối số trình gỡ lỗi Godot trước bộ phân tách `--` của động cơ:

```text
--remote-debug tcp://127.0.0.1:6007
```

Quá trình sidecar cũng nhận được `--airi-ws-url=<runtime-url>` sau dải phân cách để `StageRoot` có thể kết nối trở lại Electron main.

<a id="troubleshooting"></a>

## Khắc phục sự cố

Nếu trình soạn thảo Godot chỉ hiển thị cây cảnh cục bộ:

- Xác nhận trình chỉnh sửa Godot đã được khởi động trước sidecar.
- Xác nhận `Debug -> Keep Debug Server Open` đã được bật.
- Xác nhận `nr dev:desktop` đã được khởi động sau khi cài đặt `GODOT_STAGE_REMOTE_DEBUG=1`.
- Đóng cửa sổ Godot stage sidecar và khởi động lại từ cửa sổ cài đặt Tamagotchi.
- Trên Windows, xác nhận trình soạn thảo đang lắng nghe:

  ```powershell
  Get-NetTCPConnection -LocalPort 6007
  ```

- Xác nhận quy trình sidecar bao gồm `--remote-debug` và `--airi-ws-url`:

  ```powershell
  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -like '*Godot*' } |
    Select-Object ProcessId,CommandLine
  ```

Nếu mô hình đã nhập bị biến dạng, trước tiên hãy xác minh rằng trình nhập runtime sử dụng cùng một cờ có tên-skin-bind như trình nhập trình soạn thảo V-Sekai. Đường dẫn nhập Angela runtime xác định đây là `IMPORT_USE_NAMED_SKIN_BINDS := 16` trong `scripts/vrm/VrmRuntimeImporter.gd`.

Nếu tệp `.vrm` nhập chính xác trong trình chỉnh sửa Godot nhưng không xuất hiện qua đường dẫn sidecar runtime, hãy kiểm tra các khóa mở rộng glTF của tệp. Cầu Angela runtime hiện tại bao gồm đường dẫn VRM 0.x `extensions.VRM`. Các tệp VRM 1.0 sử dụng `extensions.VRMC_vrm` và yêu cầu các tiện ích mở rộng `addons/vrm/1.0/VRMC_*` được cung cấp phải được đăng ký trong trình nhập runtime trước khi có thể yêu cầu hỗ trợ.
