# `@angela/stage-tamagotchi-godot`

Dự án runtime cho sân khấu desktop dùng Godot trực tiếp, phục vụ `stage-tamagotchi`.

<a id="what-it-does"></a>

## Nó làm gì

- Chứa dự án Godot dùng làm nền tảng runtime sân khấu dành riêng cho desktop.
- Cung cấp cảnh, tập lệnh và cấu trúc dự án .NET tối thiểu cho công việc G0 stage.
- Giữ nội dung, cảnh, tập lệnh và các tiện ích bổ sung trong tương lai thuộc sở hữu của Godot cục bộ trên một công cụ workspace.

<a id="what-it-is-not"></a>

## Nó không phải là gì

- Nó không phải là ứng dụng Electron host.
- Nó không sở hữu các hợp đồng IPC logic hoặc lớp thích ứng Angela agent.
- Nó không phải là gói renderer trên web hoặc di động.

<a id="current-scope"></a>

## Phạm vi hiện tại

- Khám phá Godot sidecar runtime chỉ dành cho desktop dành cho `stage-tamagotchi`.
- Cấu trúc dự án Godot C# và bộ xương runtime tối thiểu.
- Cảnh stage ban đầu và xác thực runtime hoạt động.
- Đường cơ sở đầu vào cảnh chỉ dành cho G1.1 VRM: Electron hiện thực hóa tệp `.vrm` đã chọn, gửi đường dẫn tệp native của nó và Godot nhập tệp đó tại runtime.
- G1.2 Trạng thái xem trong quá trình do Godot sở hữu: Godot khởi động máy ảnh từ hình đại diện đã tải, chấp nhận các bản vá lỗi máy ảnh có nguồn gốc host, phát ra ảnh chụp nhanh chế độ xem cho cài đặt UI và xử lý dữ liệu đầu vào của máy ảnh cục bộ bên trong quy trình sidecar.
- Trạng thái xem sidecar hiện tại bắt đầu khi quá trình Godot stage bắt đầu và kết thúc khi quá trình đó thoát ra. Mã store được giữ lại chưa được nối vào đường dẫn runtime đang hoạt động.
- G1.3 đã sửa đường cơ sở trình bày stage: nền trời, mặt đất lưới trung tính, điểm đánh dấu trung tâm, giàn đèn trực tiếp, cài đặt bài đăng môi trường Godot trung tính và ánh sáng cùng khung chỉ dành cho hình đại diện với ánh xạ màu toon hiện tại.

<a id="directory-layout"></a>

## Bố cục thư mục

- `scenes/`: Các tệp cảnh Godot như root stage hiện tại.
- `scripts/`: Tập lệnh C# runtime được gắn vào các nút Godot.
- `assets/`: mô hình đã nhập, kết cấu, vật liệu và các tài sản runtime khác.
- `addons/`: Các plugin Godot, các tiện ích bổ sung editor/runtime hoặc các tiện ích mở rộng Godot của bên thứ ba được cung cấp.

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

- Sử dụng nó khi làm việc trên desktop stage runtime được Godot hỗ trợ.
- Sử dụng nó cho công việc cảnh Godot, nội dung, kết xuất và nhân vật-runtime.
- Sử dụng nó làm ranh giới động cơ cho chính dự án desktop Godot stage.

<a id="when-not-to-use-it"></a>

## Khi nào không nên sử dụng nó

- Không đặt logic Electron main/renderer host ở đây.
- Không đặt các định nghĩa giao thức phối hợp hoặc xử lý chéo của Angela agent ở đây.
- Không sử dụng nó làm gói trừu tượng stage đa nền tảng chung.

## Build

- `pnpm -F @angela/stage-tamagotchi-godot build`
- `pnpm -F @angela/stage-tamagotchi-godot typecheck`
- `pnpm -F @angela/stage-tamagotchi-godot test`

Công cụ này sử dụng .NET 10 SDK, hợp đồng `Directory.Build.props` dùng chung và giải pháp `stage-tamagotchi-godot.slnx`. Các lệnh xây dựng và kiểm tra kiểu dữ liệu biên dịch cả Godot runtime và xác minh host của công cụ cục bộ; `test` thực hiện xác minh host đó.

<a id="development-runtime"></a>

## Phát triển runtime

Ứng dụng phát triển Electron không xuất dự án này trong mỗi lần chạy nhà phát triển. Khi Godot stage được khởi động từ trang cài đặt Tamagotchi, Electron main khởi động cầu nối WebSocket cục bộ và khởi chạy công cụ Godot cục bộ cho dự án này:

```bash
godot --path ./capabilities/avatar/godot -- --airi-ws-url=<runtime-url>
```

Đặt `GODOT4` trước khi khởi động ứng dụng phát triển Electron. Chế độ nhà phát triển yêu cầu đường dẫn thực thi Godot rõ ràng và không tự động phát hiện các cài đặt cục bộ.

PowerShell:

```powershell
$env:GODOT4 = "C:\Path\To\Godot_v4.x-stable_mono_win64.exe"
pnpm dev:desktop
```

macOS/Linux:

```bash
GODOT4="/path/to/godot" pnpm dev:desktop
```

Với GodotEnv:

```bash
GODOT4="$(godotenv godot env path)" pnpm dev:desktop
```

Giữ các đường dẫn Godot dành riêng cho máy bên ngoài kho lưu trữ. Dịch vụ chính của Electron hiện tại đọc `process.env.GODOT4`, vì vậy shell hoặc môi trường phát triển cục bộ phải cung cấp dịch vụ này trước khi khởi động `pnpm dev:desktop`.

<a id="editor-static-preview"></a>

## Trình chỉnh sửa xem trước tĩnh

Sử dụng đường dẫn này khi làm việc trên máy ảnh, ánh sáng, kết xuất, bố cục cảnh, thử nghiệm máy trạng thái hoạt hình hoặc hành vi stage khác không phụ thuộc vào quá trình nhập Electron hoặc runtime VRM.

Đặt tệp `.vrm` cục bộ trong:

```text
capabilities/avatar/godot/assets/fixtures/vrm/
```

Thư mục này bị git bỏ qua. Không cam kết các tệp mô hình.

`EditorPreviewRoot` trong `scenes/stage-root.tscn` được cố ý cam kết là Node trống. Trong trình chỉnh sửa Godot, tạo bản sao mô hình cục bộ bên dưới Node đó khi bạn cần một hình đại diện cụ thể trong chế độ xem 3D. Giữ thay đổi cảnh cục bộ và tệp mô hình ngoài các cam kết trừ khi chính sách mẫu kiểm thử thuộc sở hữu của repo được đưa ra.

Khởi động runtime tự động ẩn `EditorPreviewRoot`. Hình đại diện của sản phẩm runtime vẫn thuộc `AvatarRoot`, trong đó `StageSceneController` áp dụng mô hình nhận được từ Electron.

Bản xem trước này không kiểm tra `VrmRuntimeImporter.gd`. Sử dụng đường dẫn nhập runtime cho các lỗi về trình nhập và đường dẫn cụ thể hóa.

<a id="vrm-runtime-import"></a>

## Nhập khẩu VRM runtime

G1.1 cung cấp tiện ích bổ sung V-Sekai Godot thông qua siêu dữ liệu `git-subrepo`:

- `addons/vrm`: Tiện ích bổ sung trình nhập VRM, phiên bản plugin `2.0.1`, `only-addon` cam kết `651205484c35f5cd7ba56475ff636e10db8ad674`.
- `addons/Godot-MToon-Shader`: Tiện ích bổ sung shader MToon, phiên bản plugin `3.4.0`, `main` cam kết `268c0d3b19c0885698b7bd39e21a16c9c2af448f`.

Quá trình nhập runtime được định tuyến qua `scripts/vrm/VrmRuntimeImporter.gd` vì plugin nhập trình soạn thảo Godot không hoạt động khi sidecar đã xuất nhận được đường dẫn mô hình từ Electron. Cầu runtime hiện tại bao gồm đường dẫn VRM 0.x bằng cách gói `addons/vrm/vrm_extension.gd` được cung cấp; nó chưa đăng ký bộ tiện ích mở rộng VRM 1.0 `addons/vrm/1.0/VRMC_*.gd` được cung cấp.

Godot sở hữu avatar hoạt động trọn đời Node: avatar mới nhập sẽ được thêm vào dưới `AvatarRoot` trước, sau đó avatar trước đó sẽ bị xóa và xếp hàng để giải phóng. Quá trình nhập không thành công vẫn hiển thị hình đại diện trước đó.

Chi tiết nhập runtime trực tiếp trong [`docs/vrm-runtime-import.md`](docs/vrm-runtime-import.md). Các bản vá cục bộ của phần bổ trợ được nhà cung cấp và các khác biệt về siêu dữ liệu đã tạo được theo dõi trong [`docs/vendor-patches.md`](docs/vendor-patches.md).

<a id="default-stage-visuals"></a>

## Hình ảnh stage mặc định

G1.3 cài đặt sẵn bản trình bày mặc định cố định tại runtime. Nó bao gồm môi trường bầu trời, một mặt đất lưới rộng lớn được neo trên thế giới tại `Y=0`, điểm đánh dấu `T` ở trung tâm tại điểm gốc thế giới và một giàn đèn định hướng cố định.

Môi trường bầu trời tái sử dụng stage-ui-three HDRI hiện có tại `capabilities/avatar/three/src/components/Environment/assets/sky_linekotsi_23_HDRI.hdr` khi Godot stage chạy từ thanh toán workspace. HDRI không được sao chép vào Godot `assets/` và đường dẫn đóng gói phát hành cho nội dung dùng chung này vẫn là một phần tiếp theo riêng biệt.

Mặt đất lưới chỉ ở dạng trực quan. Nó không di chuyển gốc hình đại diện ra khỏi `(0, 0, 0)` và trình đổ bóng của nó làm mờ các đường lưới ở xa thành màu đường chân trời mà không kích hoạt sương mù thể tích.

Bầu trời được hiển thị dưới dạng nền khung nhìn nhưng nó không được sử dụng làm hình đại diện hoặc đầu vào ambient/radiance trên mặt đất. `StageVisualPreset` đặt ánh sáng xung quanh thành một màu cố định, đặt đóng góp của môi trường xung quanh bầu trời thành `0`, tắt ánh sáng phản chiếu, tắt Godot Environment Glow và để Godot tonemap/adjustment ở trạng thái trung tính. Ánh xạ màu tùy chỉnh hiện tại được bộ tổng hợp stage áp dụng thay vì các điều khiển điều chỉnh Môi trường của Godot.

<a id="avatar-mask-glow-and-color-mapping"></a>

## Mặt nạ Avatar, ánh sáng và ánh xạ màu

Đường dẫn trình bày hình đại diện hiện tại sử dụng lớp phủ stage-owned và chủ sở hữu bộ tổng hợp:

1. `StageRenderEffectsRuntime` nối camera đang hoạt động và hình đại diện được tải vào chủ sở hữu hiệu ứng kết xuất stage.
2. `StageMaterialOverlayOwner` ghi lại các xác nhận quyền sở hữu nguồn hiệu ứng kết xuất và chỉ định vật liệu lớp phủ mặt nạ hình đại diện được chia sẻ cho các nút `GeometryInstance3D` hình đại diện đã tải.
3. `StageCompositorOwner` cài đặt hiệu ứng tổng hợp hậu xử lý stage trên `Camera3D` đang hoạt động.
4. `StagePostProcessCompositorEffect` chạy ở `PostTransparent` và áp dụng các giai đoạn sao chép cảnh theo thứ tự, ánh sáng hình đại diện và ánh xạ màu cuối cùng.

Đây không phải là Godot Môi trường Glow và không sử dụng phát xạ vật liệu làm nguồn phát sáng kiểu hình đại diện. Ánh xạ màu là stage cuối cùng được kích hoạt độc lập bên trong bộ tổng hợp hậu xử lý stage. Công việc ánh sáng cạnh chỉ dành cho hình đại diện trong tương lai nên thiết lập sự so sánh hình ảnh cùng cảnh artifact trước khi thay đổi quy trình.

Ghi chú thiết kế trực tiếp trong [`docs/rendering-effects.md`](docs/rendering-effects.md).

<a id="material-rendering-check"></a>

## Kiểm tra kết xuất vật liệu

G1.3 bao gồm cảnh xác minh vật liệu runtime tập trung cho AvatarSample A/B mẫu kiểm thử đã cam kết:

```powershell
& $env:GODOT4 --headless --path . `
  --quit-after 5 `
  --log-file material-check.log `
  tests/material-rendering-check/materialRenderingCheck.tscn
```

Kiểm tra này nhập cả hai mẫu thông qua `VrmRuntimeImporter.gd` và xác minh bề mặt vật liệu runtime bao gồm MToon, alpha/cutout, vật liệu trong suốt, đường viền và bộ tạo bóng dạng lưới. A/B mẫu kiểm thử hiện tại không chứa các vật liệu không sáng nên việc kiểm tra này sẽ báo cáo `unlit = 0` và không coi đó là lỗi.

<a id="visual-observation"></a>

## Quan sát trực quan

Các thay đổi đối với renderer sẽ tạo ra kết xuất artifact tương đương trước khi chúng được chấp nhận:

```powershell
pnpm -F @angela/stage-tamagotchi-godot dump:render-stages
```

Để kiểm tra hình dạng vành hoặc ánh sáng cạnh, hãy ưu tiên cài đặt trước của máy ảnh thân trên:

```powershell
pnpm -F @angela/stage-tamagotchi-godot dump:render-stages:upper-body
```

Lệnh khởi chạy cảnh `StageRoot` thực thông qua giao thức WebSocket cục bộ, tải `AvatarSample_A.vrm`, ghi lại khu vực máy khách cửa sổ Godot hiển thị làm đầu ra được hiển thị cuối cùng và ghi chẩn đoán render-stage artifact trong `artifacts/`.

Quy trình chấp nhận và quy trình chấp nhận Nghệ thuật Kỹ thuật trực tiếp trong [`docs/technical-art-workflow.md`](docs/technical-art-workflow.md).

<a id="live-debugging-from-the-godot-editor"></a>

## Gỡ lỗi trực tiếp từ trình soạn thảo Godot

Sử dụng đường dẫn này khi Electron là host thật và mô hình được chọn từ cửa sổ cài đặt Tamagotchi, nhưng cảnh Godot đang chạy cần phải được kiểm tra trong trình chỉnh sửa Godot. Quy trình làm việc chi tiết có trong [`docs/live-debugging.md`](docs/live-debugging.md).

Khởi động trình soạn thảo Godot đối với dự án này:

```powershell
& $env:GODOT4 -e --path .\engines\stage-tamagotchi-godot
```

Trong trình chỉnh sửa Godot, bật:

```text
Debug -> Keep Debug Server Open
```

Sau đó khởi động ứng dụng phát triển Electron với tính năng gỡ lỗi từ xa Godot được bật:

```powershell
$env:GODOT_STAGE_REMOTE_DEBUG = "1"
$env:GODOT_STAGE_REMOTE_DEBUG_URI = "tcp://127.0.0.1:6007"
nr dev:desktop
```

`GODOT_STAGE_REMOTE_DEBUG_URI` là tùy chọn và mặc định là `tcp://127.0.0.1:6007`, đây là điểm cuối gỡ lỗi trình soạn thảo cục bộ tiêu chuẩn của Godot.

Khi Tamagotchi khởi động Godot stage, Electron khởi chạy sidecar với `--remote-debug` trước dải phân cách `--` của Godot. sidecar vẫn nhận được `--airi-ws-url` sau dải phân cách để có thể kết nối trở lại với Electron main.

Sau khi chọn VRM mô hình trong cửa sổ cài đặt Tamagotchi, hãy kiểm tra cảnh đang chạy trong trình chỉnh sửa Godot:

```text
Scene dock -> Remote -> /root/Node3D/AvatarRoot/Avatar_<modelId>
```

Không sử dụng nút Chạy của trình soạn thảo cho đường dẫn tích hợp này. Quá trình do trình soạn thảo chạy không nhận được `--airi-ws-url` của Electron, vì vậy nó không thể hiển thị mô hình mà Tamagotchi đã tạo ra và gửi qua sidecar WebSocket.

<a id="exporting"></a>

## Xuất khẩu

Các cài đặt trước xuất tạo ra sidecar runtime mà Electron đóng gói để phát hành:

```bash
godot --headless --export-release "Windows Desktop" out/win/godot-stage.exe
godot --headless --export-release "Linux" out/linux/godot-stage
godot --headless --export-release "macOS" out/mac/godot-stage.app
```

Các thư mục đầu ra có chủ ý khớp với tên `${os}` của nhà xây dựng điện tử:

- Windows: `out/win`
- Linux: `out/linux`
- macOS: `out/mac`

`apps/desktop/electron-builder.config.ts` sao chép thư mục phù hợp vào `resources/godot-stage` thông qua `extraResources`. Để kiểm tra bản dựng Electron đã giải nén cục bộ, hãy chạy:

```bash
pnpm -F @angela/desktop run build:unpack
```

<a id="notes"></a>

## Ghi chú

<a id="environment-management"></a>

### Quản lý môi trường

Khuyến khích sử dụng [GodotEnv](https://github.com/chickensoft-games/GodotEnv) để quản lý các phiên bản Godot.

Bạn có thể sử dụng lệnh bên dưới để đặt phiên bản Godot hiện tại cho dự án này:

```bash
godotenv godot use 4.7.1
```

Sau đó chạy trình soạn thảo Godot với dự án hiện tại:

```bash
"$(godotenv godot env path)" ./capabilities/avatar/godot/project.godot
```

Bạn cũng có thể chạy trò chơi trực tiếp từ dòng lệnh:

```bash
"$(godotenv godot env path)" --path ./capabilities/avatar/godot
```
