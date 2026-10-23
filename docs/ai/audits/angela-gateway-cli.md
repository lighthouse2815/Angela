<a id="angela-gateway-cli-verification"></a>

# Xác minh Angela Gateway CLI

Ngày: 23-10-2026 Môi trường: Linux, Node.js 26.11.1, pnpm 11.24.0.

<a id="delivered-scope"></a>

## Phạm vi phân phối

Angela bao gồm công cụ nhà cung cấp làm nguồn và xây dựng nó thông qua gói `@angela/gateway` workspace. Cả workspace đều không phụ thuộc vào gói cổng upstream được xuất bản riêng. Sổ đăng ký đã nhập chứa 134 định nghĩa nhà cung cấp, bao gồm LLM và các dịch vụ truyền thông. Bản ghi nguồn [](../../../third_party/angela-gateway/README.angela.md) xác định bản sửa đổi được ghim và thông báo MIT.

CLI kiểm soát việc khởi động, kiểm tra tài khoản, tạo tài khoản dựa trên khóa, kích hoạt tài khoản, khám phá mô hình và lựa chọn nhà cung cấp được chia sẻ. OAuth và các mục nhập đặc biệt sử dụng bảng điều khiển cục bộ đi kèm. Quá trình khởi động liên kết với loopback và bắt đầu làm mới token mà không cần khởi động dịch vụ hệ thống upstream.

<a id="checks"></a>

## Kiểm tra

| Lệnh | Kết quả |
| --- | --- |
| `pnpm -F @angela/gateway build` | Đi qua. Công cụ và bảng điều khiển độc lập được xây dựng từ nguồn kho lưu trữ. |
| `pnpm -F @angela/cli build` | Đi qua. Các mô-đun lệnh lười biếng và thực thi CLI được xây dựng. |
| `pnpm -F @angela/cli typecheck` | Đi qua. |
| `pnpm typecheck` | Đã thông qua, 53 nhiệm vụ. |
| `pnpm lint` | Đã vượt qua, không có lỗi và 603 cảnh báo. |
| `pnpm install --frozen-lockfile --ignore-scripts` | Đã vượt qua, bao gồm kiểm tra chính sách chuỗi cung ứng cho 3.044 mục. |

Lệnh hồi quy CLI, từ kho lưu trữ gốc:

```sh
pnpm -F @angela/cli exec vitest run --config vitest.config.ts --exclude src/gateway.test.ts --maxWorkers=1 --no-file-parallelism
```

Kết quả: 72 tệp, 853 bài kiểm tra đã đạt.

Lệnh tích hợp cổng:

```sh
pnpm -F @angela/cli exec vitest run --config vitest.config.ts src/gateway.test.ts --maxWorkers=1 --no-file-parallelism
```

Kết quả: sáu bài kiểm tra đã được thông qua. Chúng bao gồm cấu hình riêng tư, cổng bị chiếm dụng, ranh giới xác thực, định tuyến mô hình, truyền dữ liệu liên tục, tính bền vững của tài khoản và cấu hình được chia sẻ. Các cuộc kiểm tra cũng đóng gói và khởi động động cơ thực tế bên ngoài quầy thanh toán. Điều này đã phát hiện ra các liên kết tượng trưng của trình quản lý gói bị thiếu trong kho lưu trữ. Bản cài đặt nâng cao và bản sao độc lập đã giải quyết được lỗi đó.

Lệnh đơn vị công cụ, từ `third_party/angela-gateway`, với `DATA_DIR` được đặt thành một thư mục tạm thời mới:

```sh
../../node_modules/.bin/vitest run --config tests/vitest.config.js tests/unit/dashboard-guard.test.js tests/unit/background-token-refresh.test.js tests/unit/token-refresh-dispatch.test.js tests/unit/token-refresh-generic.test.js tests/unit/codex-refresh-token.test.js tests/unit/key-access.test.js --maxWorkers=1 --no-file-parallelism
```

Kết quả: sáu tệp, 77 bài kiểm tra đã được thông qua. Kiểm tra Codex hiện phù hợp với chính sách đăng ký 10 phút hiện có. Kỳ vọng 5 ngày trước đó của nó đã thất bại trước khi điều chỉnh.

Kiểm tra khoảng trắng vượt qua các thay đổi do Angela sở hữu. Khoảng trắng upstream đã nhập vẫn còn trong cây được bán. Oxlint và ESLint loại trừ các nguồn được cung cấp khỏi tính năng tự động sửa lỗi kiểu dự án. Biên dịch động cơ và kiểm tra đơn vị vẫn hoạt động.

<a id="verification-boundaries"></a>

## Ranh giới xác minh

Tất cả các yêu cầu suy luận đều sử dụng nhà cung cấp tổng hợp cục bộ. Không có tài khoản mô hình trả phí hoặc tài khoản AI cá nhân nào được truy cập. Hạn ngạch OAuth thực, nhà cung cấp và tính khả dụng của trực tiếp vẫn yêu cầu xác minh chủ sở hữu tài khoản. Việc tích hợp không thêm màn hình tài khoản native desktop, hiển thị từ xa hoặc trình cài đặt dịch vụ nền. Việc người dùng hiện tại xóa giấy phép gốc và giấy phép OpenSeeFace vẫn nằm ngoài thay đổi này.

<a id="interactive-startup-menu"></a>

## Menu khởi động tương tác

Menu cung cấp các lựa chọn GPT, Gemini, Claude, Custom, Continue và Exit bằng tiếng Anh và tiếng Việt. Nó sử dụng lại thiết bị đầu cuối hiện có bên đọc, máy khách cổng, sổ đăng ký nhà cung cấp và trình ghi cấu hình riêng. Không có sự phụ thuộc nào được thêm vào. Tùy chỉnh hiển thị kiểm tra tài khoản, kiểm soát kích hoạt, trang mô hình được lọc, siêu dữ liệu chính, tiết lộ bí mật rõ ràng và bảng điều khiển hoàn chỉnh. OAuth vẫn dựa trên trình duyệt. Ủy quyền tài khoản thực vẫn yêu cầu chủ tài khoản.

Kiểm tra từ kho lưu trữ gốc:

| Lệnh | Kết quả |
| --- | --- |
| `pnpm -F @angela/i18n build` | Đi qua. |
| `pnpm -F @angela/cli build` | Đi qua. |
| `pnpm -F @angela/cli typecheck` | Đi qua. |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck --concurrency=1` | Đã thông qua, 53 nhiệm vụ. |
| `pnpm -F @angela/cli exec vitest run --config vitest.config.ts --maxWorkers=1 --no-file-parallelism` | Đã vượt qua, 74 hồ sơ và 881 bài kiểm tra. |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm lint` | Đã vượt qua, không có lỗi và 603 cảnh báo ESLint hiện có. |
| `git diff --cached --check` | Đi qua. |

kiểm tra kiểu dữ liệu không bị hạn chế ban đầu đã đạt đến giới hạn vùng nhớ heap mặc định của Node trong `stage-ui`. Quá trình chạy tuần tự với vùng heap lớn hơn đã được thực hiện mà không có sự thay đổi nguồn nào đối với gói đó. 22 thử nghiệm khởi động mới bao gồm các lựa chọn nhà cung cấp, quyền ưu tiên ghi đè, hành động tùy chỉnh, khả năng hiển thị bí mật, phân trang, hủy và quyền sở hữu host. Các thử nghiệm PTY thực bao gồm khả năng hiển thị khởi động và tắt SIGINT. Kiểm tra tích hợp khởi động và dừng công cụ đi kèm thực tế. Các thử nghiệm cổng hiện tại cũng bao gồm định tuyến, truyền dữ liệu liên tục, tính bền vững, ranh giới xác thực và thực thi gói độc lập.

Không có tài khoản AI cá nhân hoặc điểm cuối suy luận phải trả tiền nào được truy cập. Bao bì lưu trữ di động không được lặp lại. Việc xóa giấy phép hiện có vẫn chưa được thực hiện, bao gồm cả giấy phép công cụ nguồn. Chúng không phải là một phần của việc thay đổi menu.

<a id="arrow-key-navigation"></a>

## Điều hướng bằng phím mũi tên

Tất cả các menu khởi động hiện sử dụng thiết bị đầu cuối bên đọc hiện có để lựa chọn ↑/↓ và xác nhận Enter. Thoát trở về từ menu phụ hoặc thoát khỏi menu chính. Ctrl+C và Ctrl+D giải phóng thiết bị đầu cuối bên đọc. Danh sách dài cuộn bên trong khung nhìn thiết bị đầu cuối. Home và End chọn mục đầu tiên và cuối cùng. Đầu vào menu không bao giờ nhập câu hỏi văn bản tiếp theo. Khả năng hiển thị con trỏ và chế độ thô trở lại bình thường sau khi thoát. Không có sự phụ thuộc mới nào được thêm vào.

`pnpm -F @angela/i18n build` và `pnpm -F @angela/cli build` đã vượt qua. `pnpm -F @angela/cli typecheck` đã vượt qua. Lệnh bên dưới được thông qua với bốn tệp và 69 bài kiểm tra:

```sh
pnpm -F @angela/cli exec vitest run --config vitest.config.ts src/terminal.test.ts src/startup.test.ts src/config.test.ts src/cli.test.ts --maxWorkers=1 --no-file-parallelism
```

Phạm vi phủ sóng của PTY bao gồm các thay đổi hướng, bao quanh, Enter, Escape, Ctrl+C, Ctrl+D và các thiết bị đầu cuối thu hẹp với danh sách dài. Kiểm tra khởi động chọn Tùy chỉnh bằng các phím mũi tên đối với công cụ đi kèm thực, sau đó ngắt và kiểm tra việc dọn dẹp host. Kiểm tra thủ công đã chạy lệnh `angela` đã cài đặt từ thư mục chính và xác nhận điều hướng mũi tên và thoát Escape. `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck --concurrency=1` đã vượt qua tất cả 53 nhiệm vụ. Menu cuối cùng và thiết bị đầu cuối chạy lại đã vượt qua 45 bài kiểm tra trên hai tệp. PTY mẫu kiểm thử hiện đang chờ menu hoàn chỉnh và thoát đầu ra sau khi thoát. Điều này loại bỏ một cuộc đua xác nhận đọc một phần. `NODE_OPTIONS=--max-old-space-size=6144 pnpm lint` đã vượt qua mà không có lỗi nào và có 603 cảnh báo ESLint hiện có.
