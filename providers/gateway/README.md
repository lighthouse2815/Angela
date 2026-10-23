<a id="angela-gateway"></a>

# Angela Gateway

Angela Gateway là công cụ nhà cung cấp đa tài khoản cục bộ đi kèm với Angela CLI. Nó cung cấp thông tin đăng nhập tài khoản, làm mới token, định tuyến mô hình, truyền dữ liệu liên tục, phương án dự phòng và khóa suy luận chung.

Việc triển khai nhà cung cấp hoàn chỉnh có trong [nguồn được cung cấp](./vendor). Người dùng không cài đặt ứng dụng cổng hoặc gói đăng ký riêng.

## Build

Tại thư mục gốc repo, chạy `pnpm build:cli`. Gói này được build trước CLI theo quan hệ phụ thuộc của workspace. Quá trình build cài các gói phụ thuộc đã khóa phiên bản trong workspace riêng và tạo máy chủ độc lập trong `dist/`. Các gói React không được đưa vào workspace Vue chính. Quá trình build dùng trạng thái riêng tạm thời thay vì thư mục tài khoản.

`pnpm package:cli` đưa gói này cùng máy chủ đã build vào bản phát hành đóng gói độc lập. Khi chạy vẫn cần Node.js. Không cần pnpm hoặc bản mã nguồn đã checkout.

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

`login` in địa chỉ bảng điều khiển cục bộ. Khi nhà cung cấp yêu cầu, việc xác thực tài khoản diễn ra trong trình duyệt. Giữ tiến trình gateway đang chạy. Nhấn Ctrl+C để dừng máy chủ. Điểm cuối API mặc định là `http://127.0.0.1:20129/v1/`.

<a id="boundaries"></a>

## Phạm vi trách nhiệm

Gói này quản lý tài khoản nhà cung cấp cục bộ. Đây không phải API tài nguyên trên máy chủ hay kho bộ nhớ của Angela. Khi khởi động, gói không cấu hình công cụ AI khác, cài biểu tượng khay hệ thống hoặc cập nhật ứng dụng toàn cục. Khóa suy luận không có quyền quản lý tài khoản. Công khai dịch vụ ra mạng, TLS, cài dịch vụ và màn hình tài khoản desktop nằm ngoài phạm vi tích hợp ưu tiên CLI này.

Các yêu cầu về tính khả dụng, quyền truy cập đăng ký và xác thực của nhà cung cấp vẫn được kiểm soát bởi mỗi nhà cung cấp. Công cụ đi kèm không cấp quyền truy cập vào mô hình hoặc hạn ngạch mà tài khoản không có.

Xem [xuất xứ và các thay đổi cục bộ](./vendor/README.angela.md) để biết chi tiết về bản quyền và upstream.
