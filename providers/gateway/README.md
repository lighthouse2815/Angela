<a id="angela-gateway"></a>

# Angela Gateway

Angela Gateway là công cụ nhà cung cấp đa tài khoản cục bộ đi kèm với Angela CLI. Nó cung cấp thông tin đăng nhập tài khoản, làm mới token, định tuyến mô hình, truyền dữ liệu liên tục, phương án dự phòng và khóa suy luận chung.

Việc triển khai nhà cung cấp hoàn chỉnh có trong [nguồn được cung cấp](./vendor). Người dùng không cài đặt ứng dụng cổng hoặc gói đăng ký riêng.

## Build

Tại thư mục gốc repo, chạy `pnpm build:cli`. Gói này được build trước CLI theo quan hệ phụ thuộc của workspace. Quá trình build cài các gói phụ thuộc đã khóa phiên bản trong workspace riêng và tạo máy chủ độc lập trong `dist/`. Các gói React không được đưa vào workspace Vue chính. Quá trình build dùng trạng thái riêng tạm thời thay vì thư mục tài khoản.

`pnpm package:cli` đưa gói này cùng máy chủ đã build vào bản phát hành đóng gói độc lập. Khi chạy vẫn cần Node.js. Không cần pnpm hoặc bản mã nguồn đã checkout.

Để build riêng gateway và dùng lại cache Turbo, chạy `pnpm exec turbo run build --filter=@angela/gateway`.
Turbo chỉ build lại khi đầu vào thay đổi. Đầu vào gồm mã nguồn vendor, lockfile và script build.
`pnpm -F @angela/gateway build` luôn chạy Next.js trực tiếp.
`pnpm build:cli` dùng Turbo để tái sử dụng các package đã build.
Thay đổi tài liệu và test vendor không làm mất cache production của gateway.

<a id="use"></a>

## Sử dụng

```sh
angela gateway start
```

Trong một thiết bị đầu cuối khác:

```sh
angela gateway login
angela gateway password --show
angela gateway accounts
angela gateway models
angela gateway use --model PROVIDER_ALIAS/MODEL_ID
angela
```

`login` in địa chỉ bảng điều khiển cục bộ. Khi nhà cung cấp yêu cầu, việc xác thực tài khoản diễn ra trong trình duyệt. Giữ tiến trình gateway đang chạy. Nhấn Ctrl+C để dừng máy chủ. Điểm cuối API mặc định là `http://127.0.0.1:1107/angela1/`.

<a id="boundaries"></a>

## Phạm vi trách nhiệm

Gói này quản lý tài khoản nhà cung cấp cục bộ. Đây không phải API tài nguyên trên máy chủ hay kho bộ nhớ của Angela. Khi khởi động, gói không cấu hình công cụ AI khác, cài biểu tượng khay hệ thống hoặc cập nhật ứng dụng toàn cục. Khóa suy luận không có quyền quản lý tài khoản. Công khai dịch vụ ra mạng, TLS, màn hình tài khoản desktop nằm ngoài phạm vi tích hợp ưu tiên CLI này.

Các yêu cầu về tính khả dụng, quyền truy cập đăng ký và xác thực của nhà cung cấp vẫn được kiểm soát bởi mỗi nhà cung cấp. Công cụ đi kèm không cấp quyền truy cập vào mô hình hoặc hạn ngạch mà tài khoản không có.

Xem [xuất xứ và các thay đổi cục bộ](./vendor/README.angela.md) để biết chi tiết về bản quyền và upstream.

## Gateway chạy nền trên Linux

Bản CLI đã build có thể quản lý dịch vụ systemd của người dùng.

```sh
angela gateway start --background
angela gateway service status
angela gateway stop
angela gateway restart
angela gateway service disable
```

`start --background` cài dịch vụ và bật tự khởi động khi đăng nhập.
`stop` dừng dịch vụ. `restart` khởi động lại dịch vụ đã cài.
`service disable` dừng dịch vụ và tắt tự khởi động.
Dịch vụ dùng cùng thư mục tài khoản và cổng của gateway.
Nếu đổi thư mục dữ liệu hoặc cổng, giữ file dịch vụ hiện có và sửa cấu hình có chủ đích.
Lệnh cài từ chối ghi đè một file dịch vụ có nội dung khác.

`angela gateway start` vẫn chạy ở terminal. Dùng Ctrl+C để dừng chế độ này.
Các lệnh dịch vụ không dừng tiến trình chạy riêng ở terminal.
Xem log bằng `journalctl --user -u angela-gateway.service`.
