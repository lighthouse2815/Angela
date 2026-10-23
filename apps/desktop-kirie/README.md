<a id="stage-tamagotchi-kirie"></a>

# stage Tamagotchi Kirie

Ứng dụng này chạy stage Tamagotchi Vue renderer trong Godot desktop host. Kirie cung cấp WebView và IPC transport. Angela sở hữu các dịch vụ ứng dụng và cửa sổ native.

Sử dụng ứng dụng này để phát triển Kirie desktop. Ứng dụng Electron vẫn được hỗ trợ và cung cấp tham chiếu hành vi. Bao bì sản xuất vẫn bị trì hoãn. Tắt máy Windows CEF vẫn không thành công.

<a id="documentation"></a>

## Tài liệu

| Tài liệu | Sở hữu |
| --- | --- |
| README này | Lỗi thiết lập, lệnh và môi trường |
| [Trạng thái di chuyển](MIGRATION.md) | 29 khả năng, quyết định nền tảng, trở ngại, phần phụ thuộc và công việc bị trì hoãn |
| [Kiến trúc máy chủ](docs/host-architecture.md) | Các yêu cầu về ranh giới, quyền sở hữu và triển khai runtime |
| [Xác minh nền tảng](docs/verification.md) | Bằng chứng chấp nhận ngày và giới hạn tự động hóa |
| [Ablation đánh giá](docs/ablation-review.md) | Các quyết định toàn bộ khuôn khổ, bằng chứng thử nghiệm nhỏ gọn và giới hạn đánh giá |

<a id="setup-and-development"></a>

## Thiết lập và phát triển

Cài đặt [mise](https://mise.jdx.dev/getting-started.html). [.tool-versions](../../.tool-versions) gốc chọn Node.js, pnpm và .NET. [mise.toml](mise.toml) cục bộ chọn Godot Mono. [StageTamagotchiKirie.csproj](StageTamagotchiKirie.csproj) yêu cầu .NET 10 và Godot.NET.Sdk 4.7.2.

Từ kho lưu trữ gốc, cài đặt các công cụ và phụ thuộc workspace:

```sh
mise install
mise x -- pnpm install
cd apps/desktop-kirie
mise install
```

Chạy tất cả các lệnh ứng dụng còn lại từ thư mục này. Cài đặt phụ thuộc tạo ra `node_modules/.gdignore` nên Godot bỏ qua thư mục phụ thuộc. Git bỏ qua toàn bộ thư mục.

Cài đặt các phần phụ thuộc từ plugin lõi Kirie:

```sh
mise x -- pnpm kirie doctor --fix plugin:core
```

Lệnh cài đặt gói bổ trợ `0.10.0`, chương trình phụ trợ Godot CEF và NuGet. Tiện ích bổ sung cung cấp `addons/kirie/`, bao gồm `KirieClient.cs`. Git bỏ qua phần phụ thuộc đã cài đặt này. Sau khi thay đổi phiên bản Kirie, hãy chạy lại lệnh.

Kiểm tra môi trường đã cài đặt:

```sh
mise x -- pnpm kirie doctor
```

Bác sĩ kiểm tra plugin lõi đã được định cấu hình và các gói .NET của nó. Việc thiếu Android SDK hoặc chỉ xuất các mẫu không cản trở sự phát triển của desktop. Việc xuất yêu cầu các mẫu xuất Godot phù hợp. Android hoạt động cũng yêu cầu Android SDK.

Nếu CEF không có hoặc cũ, hãy cài đặt phần phụ trợ đã định cấu hình:

```sh
mise x -- pnpm kirie doctor --fix plugin:core
```

[installer](https://github.com/moeru-ai/godot-kirie/blob/v0.10.0/packages/cli/src/commands/doctor/addons.ts) xác minh kho lưu trữ Godot CEF và ghi lại tổng kiểm tra của nó trong `.godot/kirie/`. [doctor](https://github.com/moeru-ai/godot-kirie/blob/v0.10.0/packages/cli/src/commands/doctor/index.ts) kiểm tra các phần phụ thuộc của plugin đã định cấu hình và các phiên bản của chúng. Nó không băm các tệp native đã cài đặt hoặc kiểm tra chữ ký macOS.

Sau khi thay đổi phiên bản CEF, hãy lặp lại cài đặt. Trước khi chấp nhận, hãy đảm bảo rằng artifact đã cài đặt phù hợp với bản phát hành. Trên macOS, cũng đảm bảo rằng khung vượt qua xác minh chữ ký nghiêm ngặt. Nếu quá trình cài đặt hoặc chữ ký không thành công, hãy ghi lại lỗi upstream chính xác trước khi giải quyết vấn đề phụ thuộc.

Xây dựng C# trước phiên phát triển đầu tiên:

```sh
mise x -- dotnet build
mise x -- pnpm kirie dev
```

`kirie dev` khởi động Vite, Godot và CEF các renderer. Lệnh [dev](https://github.com/moeru-ai/godot-kirie/blob/v0.10.0/packages/cli/src/commands/dev.ts) sử dụng lại bản dựng C# cuối cùng. Sau khi thay đổi C#, hãy lặp lại cả hai lệnh. Spotlight mở thông qua phím tắt chung và không có điểm vào trong ứng dụng.

<a id="checks-and-build"></a>

## Kiểm tra và xây dựng

Từ thư mục ứng dụng này, hãy chạy:

```sh
mise x -- pnpm typecheck
mise x -- pnpm test:unit
mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests
mise x -- pnpm build
```

`pnpm build` chạy `kirie build` cho nội dung Web và C#. Nó không xuất hoặc đóng gói ứng dụng.

Từ thư mục gốc của kho lưu trữ, hãy chạy:

```sh
mise x -- pnpm typecheck
mise x -- pnpm lint
```

Xây dựng thành công không thiết lập sự chấp nhận native. [Verification](docs/verification.md) và [ablation bằng chứng](docs/ablation-review.md) ghi lại kết quả lệnh lịch sử.

<a id="environment-failures"></a>

## Thất bại về môi trường

| Triệu chứng | Hành động |
| --- | --- |
| Godot vắng mặt hoặc thay đổi C# không có hiệu lực | Sử dụng thư mục ứng dụng và xây dựng lại C# trước khi phát triển. |
| CEF không có hoặc điểm đánh dấu của nó đã cũ | Chạy lệnh cài đặt CEF. |
| Xác minh chữ ký CEF không thành công | Ghi lại sự thất bại chính xác. Điểm đánh dấu phù hợp có thể khiến trình cài đặt bỏ qua khung không hợp lệ. |
| `Accelerated OSR unavailable` | Đảm bảo rằng desktop sử dụng Forward+ với Metal, Direct3D 12 hoặc Vulkan. |
| NuGet báo cáo bản phát hành được ghim bị thiếu | So sánh siêu dữ liệu của nguồn cấp dữ liệu với bằng chứng phụ thuộc [](MIGRATION.md#dependency-baseline). |
| Hành vi native hoặc IPC không thành công | Tìm khả năng và phạm vi được chấp nhận của nó trong [MIGRATION.md](MIGRATION.md). |
