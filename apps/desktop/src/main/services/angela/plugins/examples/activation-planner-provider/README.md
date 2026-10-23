<a id="activation-planner-provider"></a>

# Công cụ lập kế hoạch kích hoạt nhà cung cấp

Ví dụ này khai báo phiên bản `dev.airi.example-activation` `1.0.0` trong tệp kê khai của nó.

Sử dụng nó với ví dụ `activation-planner-consumer`:

1. Mở `/devtools/plugin-host` trong stage Tamagotchi.
2. Nhập thư mục này.
3. Nhập thư mục bên sử dụng bên cạnh thư mục này.
4. Kích hoạt nhà cung cấp này.
5. Kích hoạt bên sử dụng.
6. Tải các tiện ích mở rộng đã bật.

host tải nhà cung cấp này trước bên sử dụng. Nó cũng từ chối việc vô hiệu hóa hoặc dỡ bỏ nhà cung cấp này trong khi bên sử dụng vẫn yêu cầu nó.

Ví dụ này không có triển khai Bộ công cụ runtime. Mục nhập `kits.provides` của nó là khai báo Giai đoạn 2 tĩnh. Việc đăng ký Kit runtime thuộc Giai đoạn 3.
