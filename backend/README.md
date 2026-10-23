> Việc phát triển desktop giữ các loại API và các hợp đồng chung ở đây.
> Các tệp Auth, Compose, Caddy và Rail đã được chuyển sang [dev-in-future](../../dev-in-future/README.md).
> desktop cục bộ không yêu cầu ngăn xếp hosted này.

<a id="angela-backend"></a>

# Angela phụ trợ

Nguồn phụ trợ hosted của Angela nằm trong thư mục này. Tên gói workspace ổn định; thư mục nhóm nguồn dịch vụ và quyền sở hữu cơ sở dữ liệu trong khi cấu hình triển khai sản xuất vẫn ở `proj-airi/airi-railway`.

<a id="layout"></a>

## Cách trình bày

- `apps/api`: tài nguyên API, miền kinh doanh, di chuyển cơ sở dữ liệu và API runtime.
- `../dev-in-future/server/apps/auth`: nguồn Better Auth và OIDC bị trì hoãn bên ngoài kho lưu trữ này.
- `packages/auth-shared`: Lược đồ cơ sở dữ liệu do Auth sở hữu và các hợp đồng chính.
- `packages/server-sdk-shared`: Hợp đồng Eventa cho trò chuyện hosted WebSocket.
- `../dev-in-future/server/dev/caddy` và `backend/docker-compose.yaml`: định tuyến hoãn lại và ngăn xếp phụ trợ bên ngoài kho lưu trữ này.

<a id="run-locally"></a>

## Chạy cục bộ

Chạy API được giữ lại từ thư mục gốc của kho lưu trữ:

```sh
pnpm -F @angela/api-server dev
```

Ngăn xếp phụ trợ hoàn chỉnh yêu cầu các tệp Auth, Compose, Caddy và danh mục bị trì hoãn. Đọc hướng dẫn khôi phục [](../../dev-in-future/README.md) trước khi xây dựng ngăn xếp đó. Phím tắt phụ trợ gốc không có. Docker không thể sao chép nguồn trì hoãn từ bên ngoài bối cảnh xây dựng của nó.

<a id="railway-deployment"></a>

## Triển khai đường sắt

API và Auth là các dịch vụ Đường sắt dài hạn riêng biệt được xây dựng từ cùng một kho lưu trữ. Giữ **Thư mục gốc** của mỗi dịch vụ ở thư mục gốc của kho lưu trữ. Cả Dockerfiles đều sao chép các tệp kê khai và gói chia sẻ workspace từ bối cảnh xây dựng đó. Cấu hình Đường sắt cấp dự án tồn tại trong `proj-airi/airi-railway/.railway/railway.ts`.

| Dịch vụ | Vai trò công cộng | Sự phụ thuộc riêng tư |
| --- | --- | --- |
| Tài nguyên API | Sản phẩm và tài nguyên API | Nhà phát hành xác thực và JWKS |
| Xác thực | Nhà phát hành Better Auth và OIDC | Điểm cuối xóa tài nguyên API |

Tệp Cơ sở hạ tầng dưới dạng Mã ghim từng Dockerfile, lệnh bắt đầu, kiểm tra tình trạng `/readyz` và các mẫu đồng hồ. Chạy gói Đường sắt từ kho triển khai trước khi bạn áp dụng thay đổi.

<a id="service-to-service-contract"></a>

### Hợp đồng dịch vụ với dịch vụ

Chia sẻ cơ sở dữ liệu, Redis và các biến có thể quan sát bằng cách sử dụng các biến tham chiếu Đường sắt thay vì sao chép các giá trị bí mật giữa các dịch vụ. Định cấu hình hai liên kết riêng tư định hướng như sau:

| bên sử dụng | Biến | Nguồn giá trị | Mục đích |
| --- | --- | --- | --- |
| API tài nguyên | `AUTH_SERVER_URL` | Issuer công khai chuẩn URL của Auth | Issuer, audience và danh tính JWKS công khai của JWT |
| Tài nguyên API | `AUTH_SERVER_INTERNAL_URL` | Tên miền riêng của Auth's Rail | Tìm nạp JWKS riêng tư; nó không thay đổi xác nhận của nhà phát hành |
| Xác thực | `PUBLIC_URL` | Nhà phát hành công khai chuẩn của Auth URL | Nhà phát hành Better Auth và OIDC URL; phải bằng API `AUTH_SERVER_URL` |
| Xác thực | `RESOURCE_SERVER_URL` | Miền riêng Đường sắt của API | Gọi riêng trước khi xóa dữ liệu doanh nghiệp của người dùng |

Chỉ đặt `RATE_LIMIT_TRUSTED_PROXY=railway` cho các dịch vụ nhận trực tiếp lưu lượng proxy Đường sắt. Giữ `/internal/*` ở chế độ riêng tư: Auth gọi API qua miền riêng của nó và định tuyến công khai không được để lộ Auth route nội bộ của API.

API vẫn là chủ sở hữu di chuyển cơ sở dữ liệu dùng chung. Không thêm lệnh di chuyển trước khi triển khai Đường sắt vào Auth và không khởi động Auth chạy di chuyển được chia sẻ. Sau khi triển khai một trong hai dịch vụ, Đường sắt phải nhận `200` từ `/readyz` của dịch vụ đó; Chỉ triển khai thành công thôi thì chưa đủ bằng chứng cho thấy dịch vụ có thể đạt được các yêu cầu phụ thuộc cần thiết.

<a id="dev-environment"></a>

## Môi trường phát triển

Môi trường Rail `dev` là một vị trí được chia sẻ. Nó có các URL công khai cố định, vì vậy lệnh gọi lại OAuth và webhook thanh toán vẫn được đăng ký khi mã thay đổi.

Làm việc trên nhánh của riêng bạn trong kho lưu trữ này. Không hợp nhất vào một nhánh thử nghiệm được chia sẻ. Nhánh `server-dev` không còn là nguồn triển khai nữa.

Để kiểm tra một nhánh, hãy chạy quy trình công việc `Deploy to server-dev`:

```sh
gh workflow run deploy-server-dev.yml -f branch=<branch> -f reset_database=true
```

Quy trình làm việc thực hiện các bước này theo thứ tự:

1. Nó đặt lại nhánh dev Neon về nhánh mẹ của nó, `production`. Sau đó, cơ sở dữ liệu dev giữ một bản sao của lược đồ và dữ liệu sản xuất.
2. Nó thiết lập nhánh nguồn của các dịch vụ Đường sắt `ts-api` và `auth-server` và triển khai chúng. API áp dụng quá trình di chuyển khi khởi động.
3. Nó bắt đầu quy trình làm việc `Cloudflare Workers (server-dev)` trên cùng một nhánh.

Đường sắt triển khai từng đợt đẩy sau tới nhánh. Giao diện người dùng không tuân theo các cú đẩy. Chạy lại quy trình làm việc với `reset_database=false` để xây dựng lại nó.

Chi nhánh phải nằm trong kho lưu trữ này. Đường sắt không thể triển khai một nhánh của fork.

Việc thiết lập lại sẽ xóa tất cả dữ liệu mà nhánh trước đã ghi. Điều này bao gồm các tài khoản nhà phát triển không được sản xuất. Chỉ đặt `reset_database=false` khi cơ sở dữ liệu đã có di chuyển của nhánh và không có di chuyển nào khác. Trình di chuyển Drizzle chỉ áp dụng các lần di chuyển mới hơn lần di chuyển được áp dụng gần đây nhất. Nếu cơ sở dữ liệu đã có quá trình di chuyển mới hơn từ một nhánh khác thì trình di chuyển sẽ bỏ qua các quá trình di chuyển cũ hơn của nhánh mới và không báo cáo lỗi.

Việc thiết lập lại không xóa Redis. Các giá trị được lưu trong bộ nhớ đệm từ nhánh trước có thể tồn tại cho đến khi hết hạn.

Quy trình công việc cần cấu hình kho lưu trữ này:

| Tên | Loại | Giá trị |
| --- | --- | --- |
| `RAILWAY_DEV_TOKEN` | Bí mật | Dự án đường sắt token cho môi trường `dev` |
| `NEON_API_KEY` | Bí mật | Khóa neon API cho dự án chứa cơ sở dữ liệu nhà phát triển |
| `NEON_PROJECT_ID` | Biến | Dự án neon ID |
| `NEON_SERVER_DEV_BRANCH` | Biến | Tên nhánh Neon mà dev `DATABASE_URL` trỏ tới |

Nhánh dev Neon là `serverlize-dev`. Cha mẹ của nó là `production`, vì vậy khóa Neon API cũng có thể đọc nhánh sản xuất. Chỉ giữ chìa khóa trong bí mật.

<a id="package-boundaries"></a>

## Ranh giới gói

Các ứng dụng giao diện người dùng vẫn thuộc `apps/`. Các gói phụ trợ hosted xác định giao thức API tài nguyên có thể trực tiếp trong `backend/packages/`, ngay cả khi giao diện người dùng sử dụng hợp đồng được tạo của chúng.

Máy chủ Cross-runtime SDK và các gói giao thức vẫn thuộc `packages/` vì Web, Electron, plugin và các dịch vụ độc lập sử dụng chúng.

Định tuyến Caddy sản xuất, cấu hình OpenTelemetry Collector, khả năng lưu trữ có thể quan sát và bảng thông tin Grafana trực tiếp trong `proj-airi/airi-railway` để cấu trúc liên kết triển khai không bị trùng lặp trong kho ứng dụng.
