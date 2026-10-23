# `@angela/auth-shared`

Hợp đồng xác thực trung lập được chia sẻ bởi tài nguyên API và dịch vụ xác thực độc lập.

<a id="use-it-for"></a>

## Sử dụng nó cho

- Lược đồ PostgreSQL thuộc sở hữu của Better Auth.
- Hình dạng principal/session được xác thực được trao đổi bên trong mã máy chủ.
- Chính sách ủy quyền phải giống hệt nhau trong cả hai quy trình, chẳng hạn như xử lý lệnh cấm hết hạn.

<a id="do-not-use-it-for"></a>

## Không sử dụng nó cho

- Cấu trúc Better Auth runtime hoặc HTTP route.
- Phân tích cú pháp môi trường dịch vụ, nhóm cơ sở dữ liệu, Redis, email hoặc đo từ xa.
- Đang nhập `backend/api` hoặc `../dev-in-future/server/apps/auth`.

Việc giữ gói này không có thành phần runtime cho phép cả hai ứng dụng phụ thuộc vào cùng một giao thức mà không phụ thuộc lẫn nhau.
