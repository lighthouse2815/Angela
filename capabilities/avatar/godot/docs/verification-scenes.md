<a id="runtime-verification-scenes"></a>

# Cảnh xác minh runtime

Sử dụng cảnh xác minh khi thay đổi renderer cần bằng chứng trực quan riêng biệt mà các bài kiểm tra đơn vị không thể cung cấp. Giữ luồng stage WebSocket chính làm đường dẫn chấp nhận cuối cùng cho công việc trình bày hình đại diện.

<a id="when-to-use"></a>

## Khi nào nên sử dụng

- Sử dụng cảnh xác minh tạm thời để tách biệt một câu hỏi renderer, chẳng hạn như hành vi cắt bỏ alpha, hình học phác thảo, mặt nạ stencil hoặc trích xuất nguồn sáng.
- Sử dụng stage chính cộng với WebSocket host tạm thời trước khi chấp nhận bất kỳ thay đổi nào ảnh hưởng đến chế độ xem stage được vận chuyển.
- Đừng dựa vào cảnh xác minh làm bằng chứng CI khi nó phụ thuộc vào mẫu kiểm thử cục bộ không được git theo dõi.

<a id="scene-shape"></a>

## Hình dạng cảnh

Để kiểm tra renderer trực quan, hãy tạo một cảnh tối thiểu trong `tests/<check-name>/<checkName>.tscn` bằng một gốc `Node3D` và một tập lệnh sử dụng cùng các điểm nhập runtime như tính năng đang được thử nghiệm. C# được ưu tiên khi kiểm tra cần các đối tượng stage C# runtime. Cảnh GDScript có thể được chấp nhận để kiểm tra importer/material không trực quan, chẳng hạn như `tests/material-rendering-check/materialRenderingCheck.tscn`.

Tập lệnh renderer trực quan nên:

1. Đặt kích thước khung nhìn xác định bằng `DisplayServer.WindowSetSize`.
2. Áp dụng đường cơ sở stage bình thường với `StageVisualPreset.Apply(this)`.
3. Tải hình đại diện mục tiêu hoặc mẫu kiểm thử thông qua cùng một đường dẫn runtime đang được thử nghiệm.
4. Tạo một `Camera3D` hoạt động và sử dụng các tư thế cố định.
5. Cài đặt tính năng renderer runtime đang được thử nghiệm. Để hình đại diện phát sáng, hãy tạo `StageRenderEffectsRuntime(camera)` và gọi `UseAvatar(avatar)` sau khi tải hình đại diện; Riêng `StageVisualPreset.Apply(this)` không cài đặt bộ tổng hợp phát sáng.
6. Đợi một vài khung trước mỗi thu nhận dữ liệu để các tài nguyên nhập, vật liệu và bộ tổng hợp được giải quyết.
7. Chỉ lưu các bản chụp PNG vào `Path.Combine(Path.GetTempPath(), "<check-name>")` để chẩn đoán vượt qua trung gian.
8. In chẩn đoán nhỏ gọn có thể so sánh qua các lần chạy.
9. Thoát khỏi `GetTree().Quit(0)` sau thu nhận dữ liệu cuối cùng.

<a id="fixture-rules"></a>

## Quy tắc mẫu kiểm thử

- Ưu tiên mẫu kiểm thử được theo dõi khi séc được dự định vẫn còn trong kho lưu trữ.
- Nếu quá trình kiểm tra cần một VRM cục bộ lớn hoặc riêng tư, hãy giữ cảnh tạm thời và ghi lại đường dẫn cục bộ cần thiết trong ghi chú thử nghiệm.
- Không thực hiện cảnh xác minh không thể chạy từ quá trình kiểm tra sạch trừ khi giới hạn đó là có chủ ý và được ghi lại bên cạnh cảnh đó.

<a id="renderer-caveats"></a>

## renderer Hãy cẩn thận

- Ánh sáng của hình đại diện sử dụng lớp phủ stencil đã được kiểm tra độ sâu để các vật thể mờ đục giữa máy ảnh và hình đại diện sẽ chặn nguồn phát sáng. Các vật liệu che phủ trong suốt có thể không chặn được mặt nạ nếu vật liệu của chúng không ghi độ sâu. Đây là giới hạn hiển thị minh bạch thông thường; xác minh những trường hợp đó bằng một cảnh chuyên dụng trước khi dựa vào chúng để có hình ảnh được chuyển tải.

<a id="capture-pattern"></a>

## Mẫu thu nhận dữ liệu

Sử dụng số khung cổng kiểm tra thay vì bộ hẹn giờ để tập lệnh vẫn mang tính xác định:

```csharp
public override void _Process(double delta)
{
    _frame++;

    if (_frame == 10)
    {
        SaveCapture("baseline");
        return;
    }

    if (_frame == 22)
    {
        EnableRendererFeatureUnderTest();
        SaveCapture("enabled");
        GetTree().Quit(0);
    }
}
```

Trình trợ giúp thu nhận dữ liệu trong cảnh có thể gọi `GetViewport().GetTexture().GetImage()` để lấy dữ liệu trung gian nhưng đây không phải là đầu ra hiển thị cuối cùng. Không sử dụng PNG đọc lại khung nhìn làm bằng chứng chấp nhận cho ánh xạ màu, độ tương phản, độ sáng, ánh sáng viền hoặc các đánh giá khung hình cuối cùng khác.

<a id="run-command"></a>

## Chạy lệnh

Khởi chạy cảnh với tệp nhị phân đơn sắc Godot:

```powershell
C:\Godot_v4.7.1-stable_mono_win64\Godot_v4.7.1-stable_mono_win64.exe `
  --path "D:\TAworkspace\AIRIworkspace\airi\engines\stage-tamagotchi-godot" `
  --scene "res://tests/<check-name>/<checkName>.tscn"
```

Đối với hình ảnh stage đã gửi, hãy xuất render-stage artifact thay vì dựa vào ảnh chụp màn hình thủ công tạm thời:

```powershell
pnpm -F @angela/stage-tamagotchi-godot dump:render-stages
```

Để kiểm tra hình dạng vành hoặc ánh sáng cạnh, hãy ưu tiên cài đặt trước của máy ảnh thân trên:

```powershell
pnpm -F @angela/stage-tamagotchi-godot dump:render-stages:upper-body
```

Lệnh kết xuất chạy luồng này:

1. Bắt đầu WebSocket host cục bộ.
2. Khởi chạy Godot stage chính với `--resolution` cố định.
3. Đợi `stage.ready`.
4. Gửi `host.scene.apply` cùng với AvatarSample A VRM được theo dõi.
5. Đợi `scene.applied`.
6. thu nhận dữ liệu khu vực máy khách cửa sổ Godot hiển thị cho mỗi chế độ xem kết xuất-stage được yêu cầu.
7. Viết PNG chẩn đoán trong `artifacts/`.
8. Gửi `host.shutdown`.

<a id="cleanup"></a>

## Dọn dẹp

Sau khi câu hỏi trực quan được trả lời, hãy chuyển cảnh thành bản kiểm tra được theo dõi ổn định với mẫu kiểm thử được theo dõi hoặc xóa cảnh tạm thời và chỉ giữ lại kết quả thử nghiệm trong ghi chú thiết kế có liên quan.
