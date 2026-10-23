<a id="local-configuration"></a>

# Cấu hình cục bộ

Gói này quản lý cấu hình nhà cung cấp dùng chung giữa Angela CLI, desktop và web cục bộ. Tệp này không chứa phiên xác thực, token tài khoản, lịch sử trò chuyện hoặc tùy chọn giao diện.

Đường dẫn mặc định là `~/.config/angela/config.json`. `XDG_CONFIG_HOME` thay đổi thư mục cấu hình. `ANGELA_CONFIG` chọn một tệp cụ thể. Tham số CLI và biến môi trường chỉ ghi đè tạm thời. Chúng không sửa tệp dùng chung.

```json
{
  "version": 1,
  "providers": {},
  "chat": { "provider": "", "model": "" }
}
```

Mỗi mục nhà cung cấp dùng ID ổn định của phiên bản cấu hình làm khóa. Mục này chứa `definitionId`, `config` riêng của nhà cung cấp và `status` kiểm tra hiện có. `chat.provider` chọn phiên bản cấu hình đó. `chat.model` chọn mô hình. Cấu hình nhà cung cấp có thể chứa khóa API. Tệp được lưu ngoài Git và chỉ cấp quyền truy cập riêng tư.

`LocalConfigFile` đọc bản chụp đã kiểm tra và cập nhật nhà cung cấp dưới khóa ghi độc quyền. Mỗi lần cập nhật đều đọc tệp mới nhất trước khi sửa. Các mục nhà cung cấp không liên quan được giữ nguyên. Thay tệp nguyên tử giúp bên đọc không gặp JSON đang ghi dở. Sau khi tiến trình gặp sự cố, chỉ xóa `.lock` còn sót khi mọi tiến trình ghi đã dừng.

Điểm vào dành cho trình duyệt chứa schema và lớp truyền HTTP, không import Node. Điểm vào `./node` quản lý truy cập hệ thống tệp. Điểm vào `./vite` cung cấp điểm cuối phát triển và xem trước cục bộ. Điểm cuối yêu cầu header riêng, truy cập cùng nguồn và địa chỉ loopback ở cả máy chủ lẫn máy khách. Điểm cuối không bật CORS và không cung cấp cấu hình cho máy khách từ xa. Cấu hình trên máy chủ nằm ngoài phạm vi này.

```sh
pnpm -F @angela/local-config typecheck
pnpm -F @angela/local-config test
pnpm -F @angela/local-config build
```
