<a id="activation-planner-consumer"></a>

# Công cụ lập kế hoạch kích hoạt bên sử dụng

Ví dụ này yêu cầu `dev.airi.example-activation` với phạm vi phiên bản `^1.0.0`.

Sử dụng nó với ví dụ `activation-planner-provider`:

1. Mở `/devtools/plugin-host` trong stage Tamagotchi.
2. Nhập thư mục nhà cung cấp bên cạnh thư mục này.
3. Nhập thư mục này.
4. Kích hoạt nhà cung cấp.
5. Kích hoạt bên sử dụng này.
6. Tải các tiện ích mở rộng đã bật.

host tải nhà cung cấp trước bên sử dụng này. Khi hệ thống dừng, host dừng bên sử dụng này trước nhà cung cấp.

Ví dụ này không gọi Bộ công cụ runtime. Mục nhập `kits.uses` của nó chỉ tạo ra sự phụ thuộc tĩnh vào Giai đoạn 2. Tra cứu Kit runtime thuộc Giai đoạn 3.
