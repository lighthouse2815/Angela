<a id="upstream-cleanup"></a>

# Dọn dẹp upstream

Đường cơ sở: `a7286bf` trên `main`, 22-10-2026.

<a id="completed-migrations"></a>

## Di chuyển đã hoàn tất

| Tên cục bộ trước đây | Tên cục bộ hiện tại |
| --- | --- |
| `apps/desktop/src/main/services/airi` | `apps/desktop/src/main/services/angela` |
| `packages/plugin-sdk-tamagotchi` | `shared/sdk/plugin-desktop` |
| `packages/scenarios-stage-tamagotchi-browser` | `shared/tooling/scenarios-desktop-browser` |
| `packages/scenarios-stage-tamagotchi-electron` | `shared/tooling/scenarios-desktop-electron` |
| `00-stage-tamagotchi.avif` | `00-desktop.avif` |
| `05-airi-card.avif` | `05-character-card.avif` |

Ba tên gói riêng, nhập workspace, nhập lockfile, kiểm tra, tạo kịch bản và nhập nội dung thay đổi cùng nhau. Việc xuất khẩu công cộng bên trong các gói đó vẫn giữ được hình dạng của chúng. Các lệnh `dev:desktop`, `build:desktop`, `test-desktop:run` và `capture:desktop` mới sử dụng tên hiện tại. Bí danh lệnh hiện tại vẫn có sẵn. Gói xây dựng trong quá trình cài đặt chạy từng tác vụ một. Hai mục nhập bỏ qua ESLint dành cho ứng dụng Electron vắng mặt đã bị xóa.

Bốn liên kết lịch sử của Kirie hiện khớp với các phiên bản của chúng trước khi xác nhận `8900365`. Kho lưu trữ của họ, cam kết được ghim, đường dẫn `apps/stage-tamagotchi-kirie` ban đầu và các neo dòng vẫn còn nguyên. Các liên kết Kirie cục bộ tới các dịch vụ Electron sử dụng thư mục mới.

README chính liên kết với giấy phép gốc và [ thông báo của bên thứ ba](../../../THIRD_PARTY_NOTICES.md). Các thông báo xác định mã phái sinh quan trọng và nguồn gốc tài sản. Tất cả 12 tệp thông báo và giấy phép được theo dõi hiện có vẫn giữ nguyên byte giống với đường cơ sở.

<a id="required-retention"></a>

## Yêu cầu lưu giữ

| Tài liệu tham khảo | Lý do |
| --- | --- |
| Tác giả upstream, địa chỉ email, tiêu đề SPDX và giấy phép gói | Bảo lưu thông báo về quyền tác giả và giấy phép. |
| Các liên kết GitHub lịch sử và hồ sơ điều tra ngày tháng | Bảo tồn kho lưu trữ ban đầu, cam kết, đường dẫn, bằng chứng và ghi công. |
| mô hình, phông chữ, nhãn dán và hoạt ảnh credit | Bảo tồn danh tính và nguồn gốc tài sản. |
| Thư mục dữ liệu `AIRI`, `@proj-airi/stage-tamagotchi` và `.airi` | Bảo tồn hồ sơ hiện có và dữ liệu được lưu trữ. |
| Tên nhà phát hành chứng chỉ và tên tệp CA | Duy trì sự tin cậy cho các chứng chỉ cục bộ hiện có. |
| Tên `AIRI_*`, `VITE_AIRI_*`, Eventa/IPC, nhận dạng kênh, trường đo từ xa và toàn cầu gỡ lỗi | Duy trì các hợp đồng tích hợp được hỗ trợ. |
| Lược đồ thẻ, khóa lưu trữ, route, ID nhãn dán và mẫu kiểm thử của chúng | Bảo tồn dữ liệu hiện có và phạm vi tương thích. |
| `extension.airi.json`, ID tiện ích mở rộng, ID nhà xuất bản mã VS, lệnh và cài đặt | Giữ nguyên các tiện ích mở rộng và cài đặt hiện có. |
| Tên gọi kỹ năng hiện có | Duy trì các cuộc gọi kỹ năng rõ ràng. |

<a id="external-dependencies-and-sources"></a>

## Các nguồn và phụ thuộc bên ngoài

Không có tệp kê khai workspace nào khai báo gói `@proj-airi/*` nội bộ. Tám gói npm này đã xuất bản các phiên bản và bản ghi tính toàn vẹn trong tệp khóa hiện có:

- `@proj-airi/chromatic`
- `@proj-airi/drizzle-duckdb-wasm`
- `@proj-airi/duckdb-wasm` (chuyển tiếp)
- `@proj-airi/iconify-meteocons`
- `@proj-airi/lobe-icons`
- `@proj-airi/unocss-preset-chromatic`
- `@proj-airi/unplugin-fetch`
- `@proj-airi/unplugin-live2d-sdk`

Tất cả các độ phân giải bên ngoài, ảnh chụp nhanh, dữ liệu toàn vẹn, mục nhập danh mục và cài đặt phụ thuộc đều khớp với đường cơ sở. Biểu đồ trình nhập tệp khóa chỉ thay đổi đối với ba lần đổi tên gói riêng tư.

Tập lệnh xây dựng tài liệu upstream vẫn hoạt động trong cấu hình Dockerfile và Netlify trên web. Kho lưu trữ URL, tên thanh toán và các biến môi trường của nó vẫn giữ nguyên ý nghĩa bên ngoài của chúng. Tệp kê khai Scoop cài đặt các tệp nhị phân upstream đã xuất bản và giữ lại tên thực thi cũng như URL phát hành thực tế của chúng. Điểm cuối hosted-nhà cung cấp, URL mô hình, số nhận dạng Player2 và tên dịch vụ bên ngoài vẫn giữ nguyên danh tính thực tế của chúng.

<a id="names-that-require-a-separate-contract-migration"></a>

## Tên yêu cầu di chuyển hợp đồng riêng

- Dự án native Godot, tập hợp, không gian tên C# và tên xuất vẫn chứa `tamagotchi`. Chúng kết nối với việc tải tài nguyên, đóng gói sidecar và thư mục người dùng. Quá trình di chuyển xuất native đa nền tảng nằm ngoài thay đổi đã được xác minh này.
- Một số tên tệp plugin, bộ điều hợp, thẻ và E2E vẫn giữ lại tên cũ bên cạnh ID công khai được hỗ trợ và API đã xuất. bên sử dụng của họ yêu cầu xem xét hợp đồng riêng trước khi đổi tên.
- Các ví dụ về xác thực và di động bị trì hoãn đề cập đến các gói riêng tư bên ngoài kho lưu trữ Git này. Chúng không phụ thuộc vào npm. Tác vụ này không tạo ra tên gói thay thế hoặc khôi phục các workspace đó.
- Tên biến cục bộ và nhãn mẫu kiểm thử thử nghiệm vẫn có thể mô tả các hợp đồng cũ đó. Họ không thiết lập quyền sở hữu upstream đối với tác phẩm mới của Angela hoặc quyền tác giả độc lập đối với các nguồn phái sinh.

<a id="follow-up-migration"></a>

## Di chuyển tiếp theo

Quá trình di chuyển 2026-10-23 thay đổi tên cầu nối và bộ điều hợp riêng thành Angela. Nó thay đổi các đường dẫn này và các ký hiệu riêng tư của chúng:

- `integrations/discord/src/adapters/airi-adapter.ts` tới `angela-adapter.ts`
- `integrations/twitter/src/adapters/airi-adapter.ts` tới `angela-adapter.ts`
- `integrations/minecraft/src/airi` tới `src/angela`
- `backend/channel/runtime/src/server-ws/airi` tới `server-ws/angela`
- `integrations/vscode/airi-plugin-vscode` tới `angela-plugin-vscode`
- `integrations/vscode/vscode-airi` tới `vscode-angela`
- bốn thư mục `plugins/airi-plugin-*` cục bộ tới `plugins/angela-plugin-*`

Việc di chuyển cũng thay đổi những người trợ giúp lập kế hoạch Minecraft riêng tư từ Airi sang Angela. Các sự kiện dây hiện có, biến môi trường, khóa cấu hình và mã định danh bên ngoài vẫn tương thích.

Các tệp, loại nguồn thẻ nhân vật, store, dịch vụ biên tập và runtime prompt các composable hiện sử dụng tên Angela. Bí danh xuất gói giữ nguyên tên API của thẻ gốc. Cài đặt chuẩn route là `/settings/angela-card`. Bí danh Vue router bảo toàn thẻ gốc route. Khóa thẻ liên tục, Pinia store ID, định dạng ZIP và `extensions.airi` giữ nguyên các giá trị hiện có của chúng. Tên tệp hình dán sử dụng `angela-*`. ID nhãn dán giữ lại các giá trị hiện có của chúng cho các tin nhắn và bản dịch đã lưu.

Thanh toán cục bộ hiện là `/home/lighthouse2815/Projects/Angela/angela`. Tên thư mục thanh toán nằm ngoài Git. GitHub chỉ ghi lại các đường dẫn bên trong thư mục đó. Đường dẫn nguồn bị trì hoãn trong thư mục `dev-in-future` anh chị em hiện nhắm mục tiêu `../angela`.

Tên tệp hợp đồng native và phần mở rộng VRM hiện sử dụng Angela. UID Godot của họ không thay đổi. Cả hai dự án native C# đều được xây dựng mà không có cảnh báo và lỗi nào. Bốn điểm vào E2E hiện sử dụng tên tệp `e2e-angela-*`. Tên tập lệnh npm hiện tại vẫn là bí danh của các lệnh mới. Dịch vụ E2E kiểm tra kiểu dữ liệu đã vượt qua. Các lệnh trực tiếp E2E không được chạy vì chúng kiểm soát các ứng dụng desktop.

Kiểm tra thẻ vượt qua: 58 bài kiểm tra Node và 19 bài kiểm tra trình duyệt. Bản dựng Electron desktop dành cho tải chính, tải trước và renderer. Các gói Mã VS được đổi tên vượt qua kiểm tra kiểu dữ liệu và xây dựng. Quá trình cài đặt workspace bị đóng băng. Discord vượt qua 22 bài kiểm tra. Kiểm tra cầu Minecraft vượt qua 14 bài kiểm tra. Kiểm tra WebSocket vượt qua 27 bài kiểm tra.

Các kiểm tra khác cho thấy các giới hạn hiện có trong workspace tùy chọn:

- Minecraft kiểm tra kiểu dữ liệu báo cáo xung đột phiên bản `vec3` và lỗi mảng suy ra bên ngoài các mô-đun được đổi tên.
- X kiểm tra kiểu dữ liệu báo cáo hai khai báo trình phân tích cú pháp không được sử dụng.
- Cờ vua không có cấu hình nguồn bên cạnh bảng kê khai của nó. kiểm tra kiểu dữ liệu của nó không thể tìm thấy `tsconfig.json`.
- Bản dựng plugin Claude Code báo cáo mục tiêu nhị phân `dist/run.js` bị thiếu. Bản dựng của nó phát ra `dist/run.mjs`.
- Tiện ích mở rộng web kiểm tra kiểu dữ liệu báo cáo lỗi UI được chia sẻ hiện có và lỗi nhận dạng tiện ích mở rộng.
- Các thử nghiệm lập kế hoạch Minecraft không thể khởi động hộp cát của họ trên Node 26 vì nó từ chối `--experimental-transform-types`.

Trình lập kế hoạch tiếp tục hỗ trợ các bí danh `notifyAiri` và `updateAiriContext` cho các tập lệnh đã lưu.

Quá trình quét tên tệp hiện tìm thấy 14 đường dẫn nguồn có `airi` trong tên của chúng. Chúng chứa tài nguyên gọi kỹ năng, bảng kê khai plugin, nội dung hoạt ảnh gốc, trình cài đặt upstream và tập lệnh tài liệu upstream.

<a id="reproduce-the-scan"></a>

## Tái tạo quá trình quét

Quá trình quét bao gồm văn bản được theo dõi, bao gồm các tệp ẩn và tệp khóa. Nó loại trừ lịch sử `.git`, các phần phụ thuộc đã cài đặt, đầu ra bản dựng được tạo và các kho lưu trữ anh chị em không liên quan. Biểu thức kết hợp đếm từng dòng phù hợp một lần, ngay cả khi một số chuỗi được yêu cầu trùng nhau.

```sh
git grep -n -I -E 'AIRI|airi|stage-tamagotchi'
git ls-files '*AIRI*' '*airi*' '*tamagotchi*'
```

Đường cơ sở chứa 3.852 dòng phù hợp và 4.234 lần xuất hiện không chồng chéo. Các kết quả chỉ khớp với tên tệp yêu cầu lệnh thứ hai. Tài sản nhị phân giữ lại thuộc tính của chúng bên cạnh các tệp nguồn.

<a id="verification"></a>

## Xác minh

Kiểm tra sử dụng một tác vụ workspace hoặc kiểm tra worker mỗi lần. Các quy trình Node sử dụng giới hạn heap 2560 MiB. Công cụ xây dựng Rust sử dụng `RAYON_NUM_THREADS=1`. Trình khởi chạy pnpm cục bộ thiếu shebang. Miếng chêm shell tạm thời gọi phiên bản pnpm đã cài đặt tương tự cho các quy trình con.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile --network-concurrency=1 --child-concurrency=1` | Đã vượt qua, bao gồm tất cả 38 nhiệm vụ xây dựng sau cài đặt. |
| `pnpm exec vitest run --config apps/desktop/vitest.node.config.ts --maxWorkers=1` | Đã vượt qua: 89 tệp, 671 bài kiểm tra, hiện có hai lần bỏ qua. |
| `pnpm -F @angela/plugin-sdk-desktop exec vitest run --config vitest.config.ts --maxWorkers=1 --no-file-parallelism` | Đạt: một tập tin, 16 bài kiểm tra. |
| `pnpm -F @angela/scenarios-desktop-electron exec vitest run --maxWorkers=1 --no-file-parallelism` | Đã vượt qua: ba tập tin, 11 bài kiểm tra. |
| `pnpm -F @angela/desktop-kirie test:unit --maxWorkers=1 --no-file-parallelism` | Đã vượt qua: 12 hồ sơ, 38 bài kiểm tra. |
| `pnpm typecheck --concurrency=1 --continue` | Đã vượt qua: 53 trên 53 nhiệm vụ. |
| `pnpm lint` | Đạt: không có lỗi, hiện có 603 cảnh báo. |
| `pnpm --filter @angela/cli... --workspace-concurrency=1 run build` | Đi qua. |
| `pnpm --filter @angela/web... --workspace-concurrency=1 run build` | Đi qua. |
| `pnpm -F @angela/desktop build` | Đã vượt qua: chính, tải trước và renderer. |
| `pnpm -F @angela/desktop-kirie build` | Đã vượt qua: lắp ráp renderer và .NET. |
| Kịch bản kiểm tra sau khi đổi tên nội dung | Đã vượt qua: 10 bài kiểm tra trình duyệt, 11 bài kiểm tra Electron, cả các lần kiểm tra kiểu dữ liệu, xây dựng kịch bản trình duyệt và tìm lỗi mã nguồn được nhắm mục tiêu. |

Các bản dựng này không thiết lập sự chấp nhận trình cài đặt Windows/macOS hoặc hành vi native tương tác. Tất cả các URL lịch sử và bên ngoài vẫn không thay đổi trong 253 tệp văn bản được sửa đổi hoặc di chuyển ban đầu trong quá trình di chuyển đường dẫn.

<a id="final-inventory"></a>

## kiểm kê cuối cùng

Khoảng không quảng cáo dòng [](./upstream-reference-inventory.csv) phân loại mọi dòng nguồn phù hợp với vị trí, số lần xuất hiện, danh mục và lý do. Ảnh chụp nhanh loại trừ CSV đã tạo khỏi đầu vào của chính nó. Các đường dẫn được sao chép của nó là siêu dữ liệu kiểm tra, không phải các phần phụ thuộc ứng dụng bổ sung. Tất cả văn bản được theo dõi khác vẫn nằm trong phạm vi, bao gồm báo cáo này và các cuộc kiểm toán trước đó.

| Danh mục | Phù hợp với dòng nguồn | Việc giữ lại hoặc công việc còn lại |
| --- | ---: | --- |
| Yêu cầu lưu giữ | 2.946 | Quyền tác giả, giấy phép, bằng chứng lịch sử, dữ liệu hiện có và các hợp đồng tích hợp được hỗ trợ. |
| Phụ thuộc bên ngoài | 195 | Các gói đã xuất bản, hosted nhà cung cấp, tài liệu bên ngoài và danh tính trình cài đặt upstream. |
| Đặt tên chưa được giải quyết | 584 | Tên dự án native, tên adapter/API, mã định danh triển khai, mẫu kiểm thử và tên công cụ yêu cầu xem xét riêng. |
| Tổng cộng | 3.725 | 4.109 lần xuất hiện không chồng chéo. |

Danh mục chưa được giải quyết không khẳng định rằng mọi tên triển khai cũ đều được yêu cầu về mặt pháp lý. Những tên đó vẫn không thay đổi vì việc dọn dẹp này không thiết lập quá trình di chuyển an toàn cho tất cả các lần xuất bên sử dụng hoặc native. Các hàng chi tiết hiển thị giới hạn đó thay vì phân loại các tên không chắc chắn thành thông báo bắt buộc.

Để loại trừ ảnh chụp nhanh được tạo khỏi số lượng nguồn, hãy chạy:

```sh
git grep -n -I -E 'AIRI|airi|stage-tamagotchi' -- . ':!docs/ai/audits/upstream-reference-inventory.csv'
```

Các bước kiểm tra nhãn hiển thị cuối cùng đã vượt qua: 11 bài kiểm tra CLI MCP, CLI kiểm tra kiểu dữ liệu và bản dựng, 20 bài kiểm tra bảng chú giải thuật ngữ và bản dựng Kirie. Trình trợ giúp cập nhật đã chuyển `bash -n`. Lint mục tiêu đã vượt qua. Các tệp cảnh sử dụng bản dựng native vì ESLint không có trình phân tích cú pháp cảnh. Trạng thái nguồn cuối cùng cũng đã thông qua bản dựng web, bản dựng Electron desktop và lệnh CLI `--help` được xây dựng. Bốn kỹ năng cập nhật đã vượt qua trình xác thực kỹ năng đi kèm bằng cách sử dụng trình phân tích cú pháp workspace YAML hiện có. Đường dẫn kịch bản được ghi lại và điểm vào Electron được xây dựng của họ tồn tại. ID lệnh gọi hiện tại vẫn ổn định.

Phím tắt phụ trợ độc lập và ví dụ về gói di động đã bị xóa khỏi tài liệu hiện hoạt. Hướng dẫn di động bị trì hoãn hiện yêu cầu khôi phục workspace trước khi các lệnh của nó có thể chạy.

Quét văn bản được theo dõi đầy đủ, bao gồm CSV, chứa 4.208 dòng phù hợp và 4.630 lần xuất hiện. Ảnh chụp nhanh được tạo đóng góp 483 dòng siêu dữ liệu phù hợp. Những đường dẫn được sao chép này thuộc về hồ sơ kiểm tra lịch sử.

Quá trình quét tên tệp tìm thấy 321 đường dẫn được theo dõi:

| Đường dẫn gia đình | Đường dẫn | Lý do |
| --- | ---: | --- |
| Cây động cơ native | 173 | Di chuyển dự án, tài nguyên, lắp ráp và xuất khẩu vẫn tách biệt. |
| Cây mở rộng Plugin và VS Code | 67 | Bố cục cài đặt vẫn bên cạnh danh tính tiện ích mở rộng công cộng được hỗ trợ. |
| Mô-đun thẻ, trang, store và nhãn dán | 43 | route được hỗ trợ, hoạt động xuất, dữ liệu và nhận dạng tài sản vẫn ổn định. |
| Chứng chỉ runtime | 10 | Bảo toàn đường dẫn chứng chỉ hiện có và sự tin cậy. |
| Bộ điều hợp và mô-đun cầu xuất khẩu | 9 | Bảo tồn các API công khai cho đến khi quá trình di chuyển bên sử dụng được xem xét. |
| Tài nguyên kỹ năng | 8 | Giữ nguyên tên gọi ổn định và các tham chiếu của chúng. |
| Điểm vào E2E | 4 | Giữ nguyên các quy ước báo cáo và người gọi hiện có trong khi chờ di chuyển công cụ. |
| Bảng kê khai tiện ích mở rộng desktop | 3 | Giữ nguyên tên tệp kê khai được hỗ trợ. |
| Nội dung nguồn hoạt hình | 2 | Duy trì phân bổ nguồn và nhập nội dung. |
| Trình cài đặt bên ngoài và trình trợ giúp tài liệu | 2 | Bảo toàn danh tính của upstream artifact thực tế. |
