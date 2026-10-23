<a id="extension-host-examples"></a>

# Ví dụ về phần mở rộng host

Sử dụng các thư mục này với **Extension host Inspector** tại `/devtools/plugin-host`.

- `devtools-sample-plugin` xác minh vòng đời và quyền của Tiện ích mở rộng cơ bản.
- `activation-planner-provider` và `activation-planner-consumer` xác minh việc lập kế hoạch phụ thuộc.

Nhập cả hai ví dụ về Công cụ lập kế hoạch kích hoạt. Trước tiên hãy kích hoạt nhà cung cấp. Sau đó kích hoạt bên sử dụng. host tải nhà cung cấp trước bên sử dụng và dừng bên sử dụng trước nhà cung cấp.

nhà cung cấp chỉ khai báo một Kit trong bảng kê khai của nó. Nó không đăng ký triển khai Bộ công cụ runtime. Việc đăng ký Bộ runtime nằm ngoài ranh giới Giai đoạn 2.
