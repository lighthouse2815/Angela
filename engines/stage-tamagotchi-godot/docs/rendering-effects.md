<a id="rendering-effect-placement"></a>

# Vị trí hiệu ứng kết xuất

Ghi chú này ghi lại hướng thiết kế hiện tại cho các hiệu ứng hiển thị stage tùy chỉnh. Mục tiêu là giữ cho các shader MToon được bán ổn định trừ khi một hiệu ứng thực sự cần tham gia vào việc tạo bóng vật liệu cơ bản.

<a id="current-direction"></a>

## Hướng hiện tại

Thích sự phân chia này cho hình đại diện và hiệu ứng hình ảnh stage:

```text
MToon / base material
  Owns the avatar's normal toon shading and material response.

GeometryInstance3D.MaterialOverlay
  Owns non-invasive per-mesh auxiliary passes, such as stencil, mask, ID, or
  simple extra visual sources.

CompositorEffect
  Owns same-frame screen-space work, such as glow diffusion, compositing, and
  final custom color mapping before display output.
```

Đối với hình đại diện phát sáng, điều này có nghĩa là:

- `StageRenderEffectsRuntime` kết nối chủ sở hữu lớp phủ và bộ tổng hợp stage-level cho máy ảnh đang hoạt động và hình đại diện đã tải.
- `StageMaterialOverlayOwner` ghi lại các xác nhận quyền sở hữu nguồn hiệu ứng kết xuất và chỉ định vật liệu lớp phủ mặt nạ hình đại diện được chia sẻ. Kiểm tra độ sâu lớp phủ đối với cảnh và ghi tham chiếu stencil `1` mà không ghi độ sâu cảnh.
- `StagePostProcessCompositorEffect` luôn sở hữu bản đồ màu NAES/toon cuối cùng stage. Đường dẫn nội bộ của nó hiện đang chạy bản sao cảnh, ánh sáng hình đại diện và ánh xạ màu cuối cùng theo thứ tự đó.
- Khi ánh sáng hình đại diện được kích hoạt, nó sẽ trích xuất nguồn sáng từ màu cảnh được đánh dấu bằng stencil, khuếch tán nó và ánh sáng hình đại diện tổng hợp vào đầu vào HDR được sử dụng bởi ánh xạ màu cuối cùng.
- Trình tạo bóng V-Sekai MToon được cung cấp vẫn chịu trách nhiệm về giao diện vật liệu cơ bản của hình đại diện.

Chi tiết triển khai hiện tại:

- `StageCompositorOwner` sở hữu khe cắm bộ tổng hợp `Camera3D` đang hoạt động và đăng ký hiệu ứng bộ tổng hợp hậu xử lý stage mà không có tính năng runtime thay thế bộ tổng hợp máy ảnh một cách độc lập.
- `StageMaterialOverlayOwner` sở hữu ghi `GeometryInstance3D.MaterialOverlay` cho các đường truyền nguồn hiệu ứng kết xuất stage.
- Hiệu ứng tổng hợp sở hữu kết cấu hậu xử lý tạm thời. Nó sử dụng `FramebufferCacheRD` và `UniformSetCacheRD` của Godot cho bộ đệm khung dẫn xuất và RID được thiết lập đồng nhất, trong khi quyền sở hữu kết cấu vẫn cục bộ đối với biểu đồ vượt qua quá trình hậu xử lý stage.
- Ánh xạ màu NAES/toon cuối cùng là một bộ tổng hợp stage riêng biệt và không còn phụ thuộc vào việc bật ánh sáng hình đại diện nữa. Các hiệu ứng nguồn sau này có thể cung cấp cùng màu cuối cùng stage trước khi xuất ra màn hình sau khi so sánh hình ảnh trong cùng một cảnh.
- Godot Môi trường Glow bị vô hiệu hóa trong `StageVisualPreset`; Lựa chọn nguồn phát sáng kiểu avatar đến từ lớp phủ stencil được chia sẻ, không phải từ sự phát xạ vật liệu.

<a id="why-overlay-first"></a>

## Tại sao nên phủ lớp đầu tiên

`MaterialOverlay` là phiên bản cục bộ và hiển thị vật liệu bổ sung trên cùng một hình dạng. Nó có thể thêm dữ liệu kết xuất ngữ nghĩa mà không thay thế tài liệu MToon đã nhập.

Trước tiên hãy sử dụng lớp phủ khi một hiệu ứng có thể được biểu diễn dưới dạng toàn bộ hình học bổ sung:

- gắn thẻ stencil hoặc mặt nạ đối tượng;
- lựa chọn mặt nạ hình đại diện để phát sáng và các hiệu ứng chỉ dành cho hình đại diện trong tương lai;
- mặt nạ hình bóng, đường viền, lựa chọn hoặc tương tác;
- nguồn tia X hoặc rim/shell đã được kiểm tra độ sâu;
- giấy phép xác minh tạm thời không làm thay đổi nguyên liệu nhập khẩu.

Điều này tránh việc vá mọi biến thể trình đổ bóng MToon được cung cấp cho các hiệu ứng không thuộc về lớp tạo bóng cơ bản mô hình của vật liệu.

<a id="where-overlay-stops"></a>

## Nơi lớp phủ dừng lại

Lớp phủ không phải là sự thay thế chung cho quyền sở hữu trình đổ bóng.

Không chỉ dựa vào lớp phủ khi hiệu ứng cần thay đổi kết quả vật liệu cơ bản trước khi xử lý hậu kỳ:

- Đường dốc MToon, màu bóng hoặc phản ứng ánh sáng;
- sự suy giảm bóng hoặc hành vi ánh sáng trực tiếp;
- các dải hoạt hình phụ thuộc bình thường bên trong vật liệu;
- mặt nạ trên mỗi bề mặt được điều khiển bằng kết cấu hoặc được điều khiển bằng UV không có sẵn cho thẻ lớp phủ;
- hành vi của da, tóc, vải hoặc phụ kiện phải khác nhau bên trong một lưới nhập khẩu.

Những trường hợp đó cần có hợp đồng đổ bóng thuộc sở hữu, bản vá importer/material hoặc dữ liệu tác giả bổ sung mà thẻ lớp phủ có thể đọc.

<a id="known-constraints"></a>

## Những hạn chế đã biết

- `MaterialOverlay` là một khe cắm duy nhất trên mỗi `GeometryInstance3D`. Nhiều hiệu ứng phải thông qua `StageMaterialOverlayOwner` thay vì gán độc lập.
- `Camera3D.Compositor` cũng là một vị trí chủ sở hữu duy nhất. Các hiệu ứng bài đăng bổ sung phải được đăng ký thông qua chủ sở hữu bộ tổng hợp stage thay vì thay thế độc lập bộ tổng hợp máy ảnh.
- Vật liệu lớp phủ áp dụng cho toàn bộ hình học và tất cả các bề mặt trừ khi lưới bị chia tách hoặc trình đổ bóng lớp phủ có dữ liệu mặt nạ đáng tin cậy.
- Lớp phủ thêm công việc vẽ cho mọi hình học được đánh dấu. Điều này có thể chấp nhận được đối với đường dẫn hình đại diện hiện tại, nhưng cần đo lường trước khi mở rộng nó sang nhiều đối tượng trong cảnh.
- Các bộ che trong suốt có thể không chặn các mặt nạ có nguồn gốc từ lớp phủ khi chúng không ghi độ sâu. Các bộ che phủ được kiểm tra độ sâu mờ sẽ chặn nguồn stencil phát sáng hình đại diện hiện tại.
- Khuếch tán không gian màn hình, kim tự tháp mờ và ánh xạ màu vẫn thuộc về một bộ tổng hợp cùng khung. Lớp phủ sẽ tạo ra thông tin nguồn, không thay thế biểu đồ thông qua bộ tổng hợp.
- Ánh xạ màu cuối cùng hiện tại vẫn tồn tại bên trong bộ tổng hợp xử lý hậu kỳ stage, nhưng nó là một stage được kích hoạt độc lập, không phải là một đường dẫn phụ phát sáng.

<a id="decision-rule"></a>

## Quy tắc quyết định

Sử dụng lớp ít xâm lấn nhất có dữ liệu và thời gian theo yêu cầu của hiệu ứng:

1. Sử dụng MToon hoặc trình đổ bóng vật liệu thuộc sở hữu của bạn khi hiệu ứng thay đổi độ bóng của vật liệu cơ bản.
2. Sử dụng `MaterialOverlay` khi hiệu ứng chỉ cần thêm một đường chuyền trên mỗi lưới hoặc mặt nạ ngữ nghĩa.
3. Sử dụng `CompositorEffect` khi hiệu ứng cần xử lý hình ảnh trong không gian màn hình cùng khung.

Chỉ vá lỗi MToon được cung cấp khi hành vi được yêu cầu không thể được thể hiện dưới dạng nguồn lớp phủ cộng với công việc của bộ tổng hợp.
