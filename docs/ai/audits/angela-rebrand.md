<a id="angela-namespace-migration-audit"></a>

# Kiểm tra di chuyển không gian tên Angela

Đường cơ sở: `5227709` trên `main`, 22-10-2026.

<a id="workspace-graph"></a>

## Đồ thị workspace

workspace chứa 71 bảng kê khai, bao gồm cả phần gốc và 200 phần khai báo phụ thuộc `workspace:`. Mọi phần phụ thuộc workspace đều phân giải thành một bảng kê khai. Không có phần phụ thuộc npm nào được đổi tên. Các gói nguồn giữ đường dẫn xuất và ranh giới mô-đun của chúng. Bí danh `stage-host-context` chỉ dành cho Kirie thay đổi theo ánh xạ Vite và TypeScript của nó.

| Bản kê khai | Trọn gói |
| --- | --- |
| `apps/desktop-kirie/package.json` | `@angela/desktop-kirie` |
| `apps/desktop/package.json` | `@angela/desktop` |
| `apps/web/package.json` | `@angela/web` |
| `capabilities/avatar/godot/package.json` | `@angela/stage-tamagotchi-godot` |
| `integrations/discord/package.json` | `@angela/discord-bot` |
| `integrations/minecraft/package.json` | `@angela/minecraft-bot` |
| `integrations/satori/package.json` | `@angela/satori-bot` |
| `integrations/telegram/archive/package.json` | `@angela/telegram-bot` |
| `integrations/twitter/package.json` | `@angela/twitter-services` |
| `integrations/vscode/airi-plugin-vscode/package.json` | `@angela/plugin-vscode` |
| `integrations/vscode/vscode-airi/package.json` | `airi-vscode` |
| `package.json` | `@angela/root` |
| `apps/cli/package.json` | `@angela/cli` |
| `capabilities/audio/package.json` | `@angela/audio` |
| `shared/tooling/better-ws/package.json` | `@angela/better-ws` |
| `shared/tooling/cap-vite/package.json` | `@angela/cap-vite` |
| `shared/ui/ccc/package.json` | `@angela/ccc` |
| `core/agent/package.json` | `@angela/core-agent` |
| `core/character/package.json` | `@angela/core-character` |
| `shared/sdk/electron-eventa/package.json` | `@angela/electron-eventa` |
| `capabilities/vision/electron-screen-capture/package.json` | `@angela/electron-screen-capture` |
| `shared/sdk/electron-vueuse/package.json` | `@angela/electron-vueuse` |
| `shared/ui/fonts/chillroundm/package.json` | `@angela/font-chillroundm` |
| `shared/ui/fonts/cjkfonts-allseto/package.json` | `@angela/font-cjkfonts-allseto` |
| `shared/ui/fonts/departure-mono/package.json` | `@angela/font-departure-mono` |
| `shared/ui/fonts/xiaolai/package.json` | `@angela/font-xiaolai` |
| `shared/i18n/package.json` | `@angela/i18n` |
| `capabilities/input/gamepad-vueuse/package.json` | `@angela/input-gamepad-vueuse` |
| `capabilities/input/gamepad/package.json` | `@angela/input-gamepad` |
| `capabilities/input/dualsense/package.json` | `@angela/input-playstation-dualsense-5` |
| `shared/config/package.json` | `@angela/local-config` |
| `backend/storage/memory-pgvector/package.json` | `@angela/memory-pgvector` |
| `capabilities/avatar/lipsync/package.json` | `@angela/model-driver-lipsync` |
| `capabilities/avatar/live2d-driver/package.json` | `@angela/model-driver-magic-live2d` |
| `capabilities/vision/mediapipe/package.json` | `@angela/model-driver-mediapipe` |
| `capabilities/avatar/motion/package.json` | `@angela/motion-driver-magic` |
| `capabilities/voice/pipelines/package.json` | `@angela/pipelines-audio` |
| `shared/sdk/plugin-protocol/package.json` | `@angela/plugin-protocol` |
| `packages/plugin-sdk-tamagotchi/package.json` | `@angela/plugin-sdk-tamagotchi` |
| `shared/sdk/plugin/package.json` | `@angela/plugin-sdk` |
| `providers/inference/package.json` | `@angela/provider-inference` |
| `packages/scenarios-stage-tamagotchi-browser/package.json` | `@angela/scenarios-stage-tamagotchi-browser` |
| `packages/scenarios-stage-tamagotchi-electron/package.json` | `@angela/scenarios-stage-tamagotchi-electron` |
| `backend/channel/runtime/package.json` | `@angela/server-runtime` |
| `shared/sdk/server/package.json` | `@angela/server-sdk` |
| `backend/contracts/server/package.json` | `@angela/server-shared` |
| `shared/ui/layouts/package.json` | `@angela/stage-layouts` |
| `shared/ui/pages/package.json` | `@angela/stage-pages` |
| `shared/ui/stage-shared/package.json` | `@angela/stage-shared` |
| `capabilities/avatar/live2d/package.json` | `@angela/stage-ui-live2d` |
| `capabilities/avatar/mmd/package.json` | `@angela/stage-ui-mmd` |
| `capabilities/avatar/spine/package.json` | `@angela/stage-ui-spine` |
| `capabilities/avatar/tachie/package.json` | `@angela/stage-ui-tachie` |
| `capabilities/avatar/three/package.json` | `@angela/stage-ui-three` |
| `shared/ui/stage/package.json` | `@angela/stage-ui` |
| `shared/tooling/stream-kit/package.json` | `@angela/stream-kit` |
| `shared/tooling/testing-audio/package.json` | `@angela/testing-audio` |
| `shared/ui/loading-screens/package.json` | `@angela/ui-loading-screens` |
| `shared/ui/transitions/package.json` | `@angela/ui-transitions` |
| `shared/ui/primitives/package.json` | `@angela/ui` |
| `shared/tooling/unocss-preset-fonts/package.json` | `@angela/unocss-preset-fonts` |
| `shared/tooling/vite-plugin-sherpaw/package.json` | `@angela/vite-plugin-sherpaw` |
| `shared/tooling/vitest-plugin-fakemic/package.json` | `@angela/vitest-plugin-fakemic` |
| `plugins/airi-plugin-bilibili-laplace/package.json` | `@angela/plugin-bilibili-laplace` |
| `plugins/airi-plugin-claude-code/package.json` | `@angela/plugin-claude-code` |
| `plugins/airi-plugin-game-chess/package.json` | `@angela/plugin-game-chess` |
| `plugins/airi-plugin-web-extension/package.json` | `@angela/plugin-web-extension` |
| `backend/api/package.json` | `@angela/api-server` |
| `backend/contracts/auth/package.json` | `@angela/auth-shared` |
| `backend/contracts/api/package.json` | `@angela/server-sdk-shared` |
| `capabilities/computer-use/package.json` | `@angela/computer-use-mcp` |

<a id="external-npm-packages"></a>

## Gói npm bên ngoài

Các gói này có phiên bản đăng ký và bản ghi tính toàn vẹn trong lockfile. Họ ở bên ngoài workspace này. Bảy xuất hiện trong danh mục. `duckdb-wasm` là phần phụ thuộc npm bắc cầu của `drizzle-duckdb-wasm`. Không gian tên `@proj-airi`, đường dẫn phụ nhập, danh mục và chính sách về thời hạn phát hành vẫn không thay đổi.

| Trọn gói | Các tập tin tham khảo tại đường cơ sở |
| --- | --- |
| `@proj-airi/chromatic` | 4 |
| `@proj-airi/drizzle-duckdb-wasm` | 17 |
| `@proj-airi/duckdb-wasm` | 6 tài liệu đã dịch và lockfile |
| `@proj-airi/iconify-meteocons` | 6 |
| `@proj-airi/lobe-icons` | 8 |
| `@proj-airi/unocss-preset-chromatic` | 6 |
| `@proj-airi/unplugin-fetch` | 10 |
| `@proj-airi/unplugin-live2d-sdk` | 9 |

<a id="compatibility-and-external-references"></a>

## Khả năng tương thích và tài liệu tham khảo bên ngoài

- Tên MCP `Client` bắt đầu bằng `@proj-airi/` là siêu dữ liệu giao thức, không phải phần phụ thuộc workspace. Điều này bao gồm tên khách hàng `airi-cli`, `computer-use-mcp-*` và `e2e-*`.
- Cấu hình điện tử giữ `AIRI` cho các bản dựng đóng gói và `@proj-airi/stage-tamagotchi` để phát triển.
- `Symbol('@proj-airi/chromatic-hue')` gắn nhãn khóa tiêm Vue. Nó không phải là một gói nhập khẩu.
- `@proj-airi/duckdb-wasm` là gói npm bắc cầu bên ngoài, cũng được tham chiếu trong tài liệu upstream đã dịch.
- `stage-pocket` và `auth-server` bị trì hoãn thuộc về `../dev-in-future`, bên ngoài workspace của kho lưu trữ này.
- Các gói npm bên ngoài giữ lại các liên kết kho lưu trữ upstream và tên gói.
- Các biến env AIRI, tên IPC/Eventa, gỡ lỗi toàn cầu, lược đồ URL, khóa lưu trữ và trường lược đồ thẻ vẫn được hỗ trợ.
- ID plugin hiện tại, `extension.airi.json`, VS ID tiện ích mở rộng mã, lệnh và cài đặt vẫn tương thích.
- URL phát hành cũ, liên kết phát hành, credit, tài sản của bên thứ ba và bằng chứng điều tra lịch sử vẫn giữ nguyên ý nghĩa ban đầu của chúng.

<a id="reproduce-the-inventory"></a>

## Tái tạo hàng tồn kho

```sh
pnpm list --recursive --depth -1
rg --hidden --glob '!.git' --glob '!node_modules' '@proj-airi/'
rg --hidden --glob '!.git' --glob '!node_modules' -i 'airi|moeru-ai/airi|airi\.moeru\.ai'
```

Lệnh đầu tiên liệt kê các gói workspace thực tế. Các lệnh khác cũng bao gồm số nhận dạng giao thức và bằng chứng upstream. Phân loại từng kết quả trước khi thay đổi nó.

<a id="namespace-verification"></a>

## Xác minh không gian tên

- `pnpm install --frozen-lockfile --ignore-scripts --network-concurrency=1 --child-concurrency=1`: đã qua.
- `pnpm --workspace-concurrency=1 --filter './packages/**' run build`: đã qua.
- `pnpm --filter @angela/cli... --workspace-concurrency=1 run build`: đã vượt qua, bao gồm Discord và dịch vụ MCP.
- Root `pnpm typecheck --concurrency=1 --continue`: đã hoàn thành 46 tác vụ, sau đó `stage-ui` đã vượt quá vùng nhớ MiB 2048.
- Các bài kiểm tra CLI, core-agent và Discord: 75 tệp đã vượt qua, 623 bài kiểm tra đã vượt qua, một bài kiểm tra bị bỏ qua.
- Các bài kiểm tra desktop plugin/profile: 2 tệp và 68 bài kiểm tra đã được thông qua.
- Kiểm tra plugin SDK: 13 tệp và 113 bài kiểm tra đã vượt qua.
- Các bài kiểm tra runtime của máy chủ: 8 tệp và 52 bài kiểm tra đã vượt qua.
- Các bài kiểm tra SDK của máy chủ: 3 tệp và 21 bài kiểm tra đã vượt qua.
- Quá trình chạy thử nghiệm Node đầy đủ đã bị dừng trong quá trình kiểm tra cơ sở dữ liệu API để hạn chế RAM. Các bộ tập trung thay thế hoạt động đó.

Trình khởi chạy pnpm cục bộ thiếu shebang. Turbo sử dụng miếng đệm pnpm được lưu trong bộ nhớ đệm trên `PATH` trong quá trình kiểm tra. Kiểm tra thiết lập `pnpm_config_verify_deps_before_run=false` sau khi cài đặt rõ ràng. Điều này ngăn pnpm chạy toàn bộ cài đặt sau mỗi lần thay đổi định dạng.

- Root `pnpm lint`: đã thành công, không có lỗi. Các cảnh báo hiện tại vẫn còn.

<a id="structural-paths"></a>

## Đường dẫn cấu trúc

| Thư mục trước | Thư mục hiện tại |
| --- | --- |
| `packages/airi-cli` | `apps/cli` |
| `apps/stage-tamagotchi` | `apps/desktop` |
| `apps/stage-tamagotchi-kirie` | `apps/desktop-kirie` |

Biểu đồ xây dựng CLI, web và desktop giữ lại tất cả 50 tác vụ và mọi cạnh phụ thuộc. Đường dẫn của trình nhập tệp khóa thay đổi trong cùng một cam kết. Không có thay đổi độ phân giải bên ngoài.

- Cài đặt đông lạnh được thông qua sau khi di chuyển.
- Bản dựng CLI, kiểm tra kiểu dữ liệu và bản dựng `--help` đã được thông qua.
- CLI path/configuration/MCP/perception kiểm tra: 8 tệp và 58 bài kiểm tra đã vượt qua.
- desktop plugin/profile kiểm tra: 2 tệp và 68 bài kiểm tra đã vượt qua.
- ESLint trên các tệp nguồn và cấu hình đã sửa đổi được truyền mà không có lỗi.

<a id="product-branding-and-supported-old-identifiers"></a>

## Xây dựng thương hiệu sản phẩm và số nhận dạng cũ được hỗ trợ

Nhãn UI, văn bản sản phẩm được bản địa hóa, prompt, mô tả gói, siêu dữ liệu kho lưu trữ, thuộc tính OpenRouter và trình cập nhật mẫu kiểm thử sử dụng Angela. Các tác giả ban đầu, thông báo bản quyền, bài đăng lịch sử, tài sản của bên thứ ba và các dự án npm upstream vẫn giữ nguyên quyền tác giả của họ. Các README được dịch xác định dự án upstream và gửi các bản tải xuống sản phẩm đến trang phát hành của Angela.

Những giá trị nhận dạng này vẫn được hỗ trợ mà không cần chuyển đổi:

- Thư mục hồ sơ Electron `AIRI` và `@proj-airi/stage-tamagotchi` lưu giữ dữ liệu người dùng.
- Bản ghi cửa sổ chính được lưu trữ vẫn sử dụng tiêu đề `AIRI` làm khóa tra cứu. Tiêu đề cửa sổ hiển thị của nó là Angela.
- `config/name="AIRI"` của Godot giữ nguyên các quyền của micrô `user://` và cài đặt đèn chiếu hiện có.
- Nhà phát hành chứng chỉ cục bộ `AIRI`, tổ chức của nó và tên tệp CA vẫn được tin cậy.
- Tên env `AIRI_*` và `VITE_AIRI_*`, tên Eventa/IPC, danh tính WebSocket, thuộc tính đo từ xa và toàn cầu gỡ lỗi vẫn ổn định.
- Lược đồ `airi-*` URL, ID card/module, `engines.airi`, `extension.airi.json`, ID nhãn dán và tên bộ điều hợp đã xuất vẫn ổn định.
- Mã VS ID publisher/package, ID lệnh và khóa cấu hình duy trì các cài đặt tiện ích mở rộng hiện có.
- Điểm cuối hosted-nhà cung cấp bên ngoài, khóa trò chơi Player2, vị trí nội dung mô hình và URL tài liệu vẫn là địa chỉ upstream.
- `bucket/airi.json` vẫn là trình cài đặt cho các tệp nhị phân upstream AIRI đã xuất bản. Nó không giả vờ cài đặt Angela.
- `scripts/build-airi-docs.sh` xây dựng kho lưu trữ `moeru-ai/airi-docs` bên ngoài và giữ lại hợp đồng env của nó.

Việc sử dụng máy tính từ chối cả `airi` và `angela`. Lựa chọn mục tiêu gỡ lỗi chấp nhận cả tiêu đề hiển thị. Không có phiên bản phụ thuộc bên ngoài, ảnh chụp nhanh, dữ liệu toàn vẹn, danh mục, ghi đè hoặc bản vá nào được thay đổi so với `5227709` cơ sở.

Trình trợ giúp cập nhật hàm băm Nix hiện sử dụng đầu ra dạng vảy `angela`. Máy này không có tệp thực thi Nix. Không thể tạo lại hoặc xác minh phần băm nội dung và phụ thuộc Nix tại đây.

<a id="final-build-and-regression-checks"></a>

## Kiểm tra hồi quy và xây dựng cuối cùng

Tất cả các bản dựng đều sử dụng một tác vụ workspace tại một thời điểm và `RAYON_NUM_THREADS=1`. Các thử nghiệm CLI đã sử dụng một đống worker và 1536 MiB. Các bản dựng giao diện người dùng đã sử dụng vùng nhớ MiB 2048. kiểm tra kiểu dữ liệu đầy đủ cuối cùng sử dụng vùng nhớ MiB 2560 với một tác vụ tại một thời điểm.

| Kiểm tra | Kết quả |
| --- | --- |
| Gói và xây dựng biểu đồ phụ thuộc CLI | Đã vượt qua |
| Build CLI cuối cùng, kiểm tra kiểu dữ liệu và chạy `--help` từ bản build | Đạt |
| `pnpm --filter @angela/web... --workspace-concurrency=1 run build` | Đã vượt qua |
| `pnpm -F @angela/desktop build` | Đã vượt qua, main/preload/renderer |
| `pnpm -F @angela/desktop-kirie build` | Đã thông qua, lắp ráp renderer và .NET |
| Bộ desktop Node | 89 tệp đã đạt, 671 bài kiểm tra đã đạt, 2 bị bỏ qua |
| Bộ Kirie Node | 10 hồ sơ và 32 bài kiểm tra đã vượt qua |
| Bộ suy luận nhà cung cấp Bộ Node | 18 hồ sơ và 186 bài kiểm tra đã vượt qua |
| Bộ plugin SDK sau khi xây dựng thương hiệu | 13 hồ sơ và 113 bài kiểm tra đã vượt qua |
| Cấu hình sử dụng máy tính, mục tiêu gỡ lỗi, chính sách và người thực thi | 4 hồ sơ và 32 bài kiểm tra đã vượt qua |
| Các tập lệnh Core-agent, Discord và ngôn ngữ sau khi xây dựng thương hiệu | 29 tệp đã đạt, 259 bài kiểm tra đã đạt, 1 bị bỏ qua |
| xây dựng và kiểm tra bảng thuật ngữ i18n | Đã đậu, 20 bài kiểm tra |
| Tên tệp, kích thước và SHA-512 của mẫu kiểm thử trình cập nhật tĩnh | Đạt |
| Cài đặt đóng băng cuối cùng với các tập lệnh bị vô hiệu hóa | Đã vượt qua |
| Gốc cuối cùng `pnpm lint` | Đã vượt qua, không có lỗi và hiện có 603 cảnh báo |
| Root `pnpm typecheck --concurrency=1 --continue` tại 2560 MiB | Đã đạt, 53 trên 53 nhiệm vụ |

Kirie yêu cầu thiết lập `kirie doctor --fix plugin:core` được ghi lại trước khi xây dựng native. Kho lưu trữ CEF vượt quá dung lượng tmpfs trống trong `/tmp`. Quá trình thiết lập đã hoàn tất với `TMPDIR` trên bộ đệm đĩa của thanh toán. Không có phần phụ thuộc bổ trợ hoặc phụ trợ nào được thêm vào Git hoặc thay đổi trong phiên bản.

<a id="checks-outside-the-root-filter"></a>

## Kiểm tra bên ngoài bộ lọc gốc

`turbo run typecheck` với `./integrations/**`, `./plugins/**` và `./engines/**` đã hoàn thành với 38 nhiệm vụ thành công và 6 nhiệm vụ thất bại. Root kiểm tra kiểu dữ liệu ở trên vẫn hoàn toàn thành công.

| workspace | Kết quả còn lại |
| --- | --- |
| `@angela/satori-bot` | Lỗi event/channel tùy chọn hiện có và loại trường phản hồi |
| `@angela/telegram-bot` | Các trường tùy chọn hiện có, trả về luồng điều khiển và lỗi biến chưa được gán |
| `@angela/twitter-services` | Chẩn đoán function/parameter hiện chưa sử dụng |
| `@angela/minecraft-bot` | Suy luận mảng hiện có và các phiên bản `vec3` không tương thích trong biểu đồ bị khóa |
| `@angela/plugin-game-chess` | Tập lệnh hiện tại đề cập đến `tsconfig.json` vắng mặt |
| `@angela/plugin-claude-code` | Vượt quá giới hạn heap 2560 MiB kiểm tra kiểu dữ liệu |

So sánh nguồn với `5227709` đã tìm thấy 101 chẩn đoán TypeScript trên 22 tệp. 21 tệp có byte giống hệt với đường cơ sở. Tệp Telegram còn lại chỉ khác nhau ở văn bản sản phẩm `AIRI` và `Angela`. Trò chơi cờ vua `tsconfig.json` cũng không có trong đường cơ sở. Biểu đồ phụ thuộc bên ngoài không thay đổi. Những lần kiểm tra này cho thấy nợ tích hợp hiện có và giới hạn bộ nhớ. Việc di chuyển này không thay đổi logic nghiệp vụ hoặc biểu đồ phụ thuộc đó.

Lược đồ API được nhắm mục tiêu và kiểm tra hợp đồng WebSocket đã vượt qua: hai tệp, sáu bài kiểm tra. Liên kết phát hành README CLI sử dụng siêu dữ liệu kho lưu trữ gốc cho đích tải xuống. Một quy trình kiểm tra CLI thực biệt lập đã được thông qua đối với các liên kết AIRI cũ, liên kết Angela mới và đầu vào nhân bản OSS trên Windows và macOS. URL vấn đề lịch sử vẫn không thay đổi. ESLint đã được thông qua cho thay đổi trợ giúp phát hành cuối cùng này.

<a id="agent-configuration"></a>

## Cấu hình agent

Một cam kết riêng cập nhật 27 tệp cấu hình agent trên 14 kỹ năng hiện có. Bộ lọc gói và đường dẫn ứng dụng cục bộ khớp với workspace đã di chuyển. ID gọi kỹ năng giữ nguyên tên hiện có của chúng, bao gồm `use-agent-browser-for-airi` và `use-vishot-for-airi`. Mô tả và nhãn UI sử dụng Angela. Hướng dẫn theo dõi IO giữ lại đường dẫn hồ sơ `AIRI` và `@proj-airi/stage-tamagotchi` thực tế.

Tất cả 14 kỹ năng đã thay đổi đều vượt qua trình xác thực kỹ năng đi kèm với trình phân tích cú pháp YAML hiện có của workspace. Đã thay đổi các tệp `agents/openai.yaml` được phân tích cú pháp thành công và giữ lại tên lệnh gọi cũng như giới hạn độ dài siêu dữ liệu của chúng. `git diff --check` đã vượt qua. Không có chính sách kích hoạt kỹ năng nào thay đổi.
