<a id="vendored-add-on-local-patches"></a>

# Các bản vá cục bộ bổ trợ được nhà cung cấp

Dự án này cung cấp các tiện ích bổ sung Godot trong `addons/` vì các plugin Godot được cài đặt dưới dạng thư mục tài sản và nguồn cục bộ của dự án. Giữ tệp này được đồng bộ hóa bất cứ khi nào các tệp tiện ích bổ sung được cung cấp khác với nguồn upstream của chúng.

<a id="upstream-baselines"></a>

## Đường cơ sở upstream

- `addons/vrm`
  - Kho lưu trữ: `https://github.com/V-Sekai/godot-vrm`
  - Chi nhánh: `only-addon`
  - Cam kết: `651205484c35f5cd7ba56475ff636e10db8ad674`
- `addons/Godot-MToon-Shader`
  - Kho lưu trữ: `https://github.com/V-Sekai/Godot-MToon-Shader`
  - Chi nhánh: `main`
  - Cam kết: `268c0d3b19c0885698b7bd39e21a16c9c2af448f`

<a id="source-patches"></a>

## Bản vá nguồn

### `addons/vrm/vrm_extension.gd`

- Thay đổi cục bộ: sử dụng `root_node.get_node_or_null("secondary")` thay vì `root_node.get_node("secondary")`.
- Lý do: một số nhà xuất khẩu VRM 0.0 bao gồm dữ liệu `secondaryAnimation` không có cảnh Node có tên `secondary`. Lệnh gọi upstream `get_node()` được thực hiện trước khi phương án dự phòng null hiện có có thể tạo Node.
- Xác thực: so sánh các tệp nguồn được cung cấp với cam kết upstream `651205484c35f5cd7ba56475ff636e10db8ad674` cho thấy đây là tệp `.gd`/`.shader`/`.cfg`/`.cs` được thay đổi duy nhất trong `addons/`. Quá trình nhập runtime sau đó hoàn tất mà không có lỗi nhập `Node not found: "secondary"`.
- Điều kiện loại bỏ: xóa bản vá này sau khi tiện ích bổ sung upstream cung cấp bản sửa lỗi tra cứu tương tự hoặc xử lý các nút `secondary` bị thiếu trước khi phân tích cú pháp xương lò xo.

<a id="mtoon-ambient-and-cutout-shader-patch"></a>

### Bản vá đổ bóng xung quanh và cắt bỏ MToon

Tập tin:

- `addons/Godot-MToon-Shader/mtoon_common.gdshaderinc`
- `addons/Godot-MToon-Shader/mtoon_cutout.gdshader`
- `addons/Godot-MToon-Shader/mtoon_cutout_cull_off.gdshader`
- `addons/Godot-MToon-Shader/mtoon_outline_cutout.gdshader`

- Thay đổi cục bộ: bật `render_mode ambient_light_disabled` cho trình đổ bóng MToon được chia sẻ.
- Thay đổi cục bộ: Vật liệu cắt bỏ route MToon thông qua đường dẫn khử răng cưa alpha cắt kéo của Godot bằng cách viết `ALPHA`, thiết lập `ALPHA_SCISSOR_THRESHOLD`, `ALPHA_ANTIALIASING_EDGE` và `ALPHA_TEXTURE_COORDINATE`, đồng thời bật `render_mode alpha_to_coverage`.
- Lý do: Preset stage của Angela sở hữu cách trình bày bầu trời, mặt đất và môi trường, nhưng chất liệu hoạt hình avatar cần màu sắc nhân vật ổn định. Sự đóng góp ánh sáng và ánh sáng xung quanh mặc định của Godot có thể loại bỏ các hình đại diện MToon khi môi trường stage thay đổi, do đó, Angela cách ly các vật liệu MToon của hình đại diện khỏi môi trường xung quanh WorldEnvironment tiềm ẩn trong khi vẫn duy trì khả năng xử lý ánh sáng trực tiếp trong bóng đổ.
- Lý do: Tóc, lông mi, phụ kiện và đường cắt đường viền của VRM sử dụng các cạnh alpha cứng. Ở khoảng cách xa, các cạnh đó thu gọn thành các pixel bậc thang hoặc nét đứt có thể nhìn thấy được. Đường dẫn từ alpha đến vùng phủ sóng của Godot hoạt động với 3D MSAA và đường dẫn cắt kéo alpha đổ bóng của Godot yêu cầu `ALPHA` nhận được kết cấu alpha được lấy mẫu. Việc viết `ALPHA` có thể route các trình đổ bóng này thông qua đường dẫn trong suốt của Godot, điều này có thể đưa ra các hồi quy phân loại hoặc đổ bóng. Angela chấp nhận sự đánh đổi đó cho đường cơ sở hình ảnh hiện tại và nên xem lại nó nếu những hồi quy đó xuất hiện hoặc upstream hiển thị một đường dẫn khử răng cưa bị cắt bỏ để duy trì ngữ nghĩa bóng mờ.
- Xác thực: `tests/material-rendering-check/materialRenderingCheck.tscn` nhập AvatarSample A/B và vẫn phát hiện các vật liệu MToon, cutout, trong suốt, phác thảo và tạo bóng sau bản vá.
- Điều kiện xóa: xóa bản vá này nếu Angela chuyển sang biến thể trình đổ bóng MToon thuộc sở hữu của mình hoặc nếu upstream đưa ra cách được hỗ trợ để chọn vật liệu MToon ra khỏi môi trường Godot ambient/radiance trong khi vẫn duy trì khả năng tương thích nhập VRM.

<a id="generated-metadata-differences"></a>

## Sự khác biệt về siêu dữ liệu được tạo

Các tệp này khác với cam kết upstream sau opening/importing, tiện ích bổ sung với Godot `4.6.2`. Chúng không phải là các bản vá hành vi của Angela nhưng chúng được ghi lại để các bản nâng cấp tiện ích bổ sung trong tương lai có thể phân biệt sự thay đổi siêu dữ liệu được tạo ra với những thay đổi nguồn có chủ ý.

<a id="svg-import-metadata"></a>

### Siêu dữ liệu nhập SVG

- `addons/vrm/node_constraint/icons/bone_node_constraint.svg.import`
- `addons/vrm/node_constraint/icons/bone_node_constraint_applier.svg.import`

Sự khác biệt quan sát được:

- Godot `4.6.2` bổ sung các trường nhập kết cấu hiện tại như `compress/uastc_level`, `compress/rdo_quality_loss` và `process/channel_remap/*`.

<a id="godot-uid-sidecars"></a>

### Xe sidecar Godot UID

Godot đã tạo các tệp `.uid` sidecar trong:

- `addons/vrm/**/*.uid`
- `addons/Godot-MToon-Shader/**/*.uid`

Những điều này bảo tồn UID tài nguyên Godot cho các tập lệnh và tài nguyên đổ bóng đã nhập. Chúng là siêu dữ liệu được tạo cục bộ, không phải bản vá nguồn.

<a id="upgrade-checklist"></a>

## Danh sách kiểm tra nâng cấp

Khi cập nhật các tiện ích bổ sung được cung cấp:

1. So sánh tiện ích bổ sung upstream mới với cây được cung cấp hiện tại.
2. Chỉ áp dụng lại các bản vá nguồn được liệt kê ở trên nếu bản sửa lỗi upstream vẫn không có.
3. Hãy để Godot tạo lại siêu dữ liệu nhập và sidecar `.uid` nếu cần.
4. Cập nhật tệp này với cam kết upstream mới và danh sách bản vá cục bộ còn lại.
