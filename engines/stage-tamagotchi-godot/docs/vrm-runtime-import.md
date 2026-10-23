<a id="vrm-runtime-import"></a>

# Nhập khẩu VRM runtime

G1.1 Godot stage chỉ chấp nhận đầu vào cảnh `.vrm`. renderer và Electron chính cổng kiểm tra định dạng mô hình thành `vrm`; hiện tại họ không phân biệt VRM 0.x với VRM 1.0.

<a id="host-boundary"></a>

## Ranh giới host

Cài đặt Electron renderer tiếp tục sử dụng mô hình store đã chọn hiện có. Khi chế độ Godot stage hoạt động, Electron chính sẽ hiện thực hóa các byte VRM đã chọn trong `userData/godot-stage/models/<modelId>/<fileName>` và gửi đường dẫn tệp native tới Godot sidecar qua cầu WebSocket cục bộ.

Godot không sở hữu vòng đời của tệp cụ thể hóa. Nó chỉ sở hữu các nút và tài nguyên runtime được tạo từ tệp đã nhập.

<a id="runtime-import-path"></a>

## Đường dẫn nhập runtime

Quá trình nhập runtime được chuyển qua:

```text
scripts/vrm/VrmAvatarLoader.cs
  -> scripts/vrm/VrmRuntimeImporter.gd
    -> scripts/vrm/AngelaVrmRuntimeExtension.gd
      -> addons/vrm/vrm_extension.gd
```

Đây là đường dẫn VRM 0.x runtime hiện tại. Nó tồn tại vì trình nhập `addons/vrm/import_vrm.gd` được bán là trình soạn thảo `EditorSceneFormatImporter` và plugin trình chỉnh sửa không hoạt động trong sidecar runtime đã xuất.

`VrmRuntimeImporter.gd` phản chiếu trình nhập trình soạn thảo V-Sekai trong đó quá trình nhập runtime cần có hành vi tương tự:

- Đăng ký phần mở rộng tài liệu GLTF thông qua `GLTFDocument.register_gltf_document_extension(...)` API tĩnh của Godot.
- Đặt `GLTFState.HANDLE_BINARY_EMBED_AS_UNCOMPRESSED`.
- Sử dụng `IMPORT_USE_NAMED_SKIN_BINDS := 16`, khớp `EditorSceneFormatImporter.IMPORT_USE_NAMED_SKIN_BINDS` từ `addons/vrm/import_vrm.gd`.

Cờ liên kết da có tên là bắt buộc đối với các mẫu VRM hiện tại. Nếu không có nó, mô hình có thể nhập nhưng liên kết lưới và khung có thể bị biến dạng rõ ràng.

<a id="version-boundary"></a>

## Ranh giới phiên bản

Có hai ranh giới độc lập:

- Phiên bản VRM: Các tệp VRM 0.x sử dụng khóa mở rộng glTF `VRM`; Các tệp VRM 1.0 sử dụng `VRMC_vrm` cộng với các khóa mở rộng `VRMC_*` có liên quan.
- Hỗ trợ runtime: tiện ích bổ sung V-Sekai có hỗ trợ nhập trình soạn thảo, nhưng nó không hiển thị runtime API cấp cao ổn định như `load_vrm(path) -> Node`.

Cầu Angela runtime hiện tại bao gồm đường dẫn VRM 0.x:

```text
extensions.VRM
  -> scripts/vrm/AngelaVrmRuntimeExtension.gd
    -> addons/vrm/vrm_extension.gd
```

Nó chưa đăng ký bộ tiện ích mở rộng VRM 1.0 runtime được cung cấp:

```text
extensions.VRMC_vrm
  -> addons/vrm/1.0/VRMC_vrm.gd
  -> addons/vrm/1.0/VRMC_springBone.gd
  -> addons/vrm/1.0/VRMC_materials_mtoon.gd
  -> addons/vrm/1.0/VRMC_node_constraint.gd
  -> addons/vrm/1.0/VRMC_materials_hdr_emissiveMultiplier.gd
```

Đừng coi `format: "vrm"` như một tuyên bố rằng tất cả các phiên bản VRM đều được nhà nhập khẩu sidecar runtime bảo hành đầy đủ. Quá trình nhập VRM 1.0 runtime cần có mẫu kiểm thử thực và đăng ký riêng các tiện ích mở rộng `VRMC_*` được cung cấp trước khi được xác nhận là được hỗ trợ.

<a id="angela-runtime-extension"></a>

## Tiện ích mở rộng Angela runtime

`AngelaVrmRuntimeExtension.gd` mở rộng tiện ích mở rộng V-Sekai VRM 0.x được cung cấp. Nó tồn tại vì Godot 4.6 báo cáo lỗi thiếu khóa bên trong khi `GLTFState.get_additional_data(&"vrm/already_processed")` đọc khóa chưa đặt.

Trình nhập Angela runtime tạo khóa đó trước khi nhập và tiện ích mở rộng Angela chỉ xử lý `true` như đã được xử lý. Điều này duy trì hoạt động kiểm tra trước của nhà cung cấp trong khi tránh lỗi trình gỡ lỗi trong quá trình nhập sidecar runtime.

Khóa này cũng là lý do tại sao không thể kích hoạt VRM 1.0 bằng cách chỉ đăng ký `addons/vrm/1.0/VRMC_vrm.gd` trong trình nhập hiện tại. `VRMC_vrm.gd` bỏ qua quá trình nhập khi `vrm/already_processed` đã được đặt, trong khi giải pháp thay thế VRM 0.x tạo khóa trước `append_from_file(...)`.

<a id="node-lifecycle"></a>

## Vòng đời Node

`StageSceneController` áp dụng hình đại diện mới theo thứ tự sau:

1. Nhập VRM mới vào Node tách rời.
2. Thêm Node đã nhập trong `AvatarRoot`.
3. Thay thế tham chiếu avatar hiện tại.
4. Xóa hình đại diện trước đó khỏi `AvatarRoot`.
5. Xếp hàng avatar trước đó để giải phóng.

Nếu quá trình nhập không thành công, hình đại diện trước đó vẫn hiển thị.
