<a id="devtools-sample-extension"></a>

# Tiện ích mở rộng mẫu Devtools

Tiện ích mở rộng mẫu này dùng để xác thực hành vi của tiện ích mở rộng host trong trang **Trình kiểm tra tiện ích mở rộng host**.

<a id="files"></a>

## Tập tin

- `extension.airi.json`: bảng kê khai tiện ích mở rộng (`ExtensionManifestV2`)
- `devtools-sample-plugin.mjs`: Đầu ra mở rộng đi kèm khép kín

Tệp kê khai khai báo điểm nhập mở rộng được mẫu thanh tra host sử dụng.

<a id="how-to-use"></a>

## Cách sử dụng

1. Mở `/devtools/plugin-host` trong stage Tamagotchi.
2. Nhấp vào `Import Folder` và chọn thư mục mẫu này.
3. Xem lại thông tin chi tiết về gói và nhấp vào `Import Extension`.
4. Tìm `devtools-sample-plugin` và nhấp vào `Enable and Load`.
5. Xác nhận:
   - quá trình nhập bắt đầu ở trạng thái bị vô hiệu hóa và không tải
   - tiện ích mở rộng xuất hiện dưới dạng `loaded`
   - giai đoạn phiên trở thành `ready`
   - danh sách khả năng có thể nhìn thấy

<a id="what-this-extension-does"></a>

## Tiện ích mở rộng này làm gì

- `setup`: ghi nhật ký khởi động trong bảng điều khiển renderer/main.

Nó không làm thay đổi trạng thái ứng dụng; nó an toàn để xác minh vòng đời.
