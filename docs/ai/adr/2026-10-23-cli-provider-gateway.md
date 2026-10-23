<a id="include-angela-gateway-in-the-cli"></a>

# Bao gồm Angela Gateway trong CLI

Trạng thái: Đã chấp nhận

<a id="context"></a>

## Bối cảnh

Người dùng đã yêu cầu mọi nhà cung cấp và luồng tài khoản từ công cụ upstream đã chọn, đằng sau một khóa API. Chúng yêu cầu triển khai trong kho lưu trữ, danh tính Angela và phân phối CLI đầu tiên. Ứng dụng cổng được cài đặt riêng không đáp ứng được yêu cầu đó.

<a id="decision"></a>

## Phán quyết

Nhà cung cấp công cụ nhà cung cấp hoàn chỉnh theo `providers/gateway/vendor` với giấy phép MIT và xuất xứ được ghim. Sử dụng tên sản phẩm Angela Gateway. Bảo toàn các mã định danh giao thức bên ngoài và bản ghi bản quyền. Giữ động cơ đã nhập ở phần phụ thuộc riêng biệt workspace. Xây dựng nó thành `@angela/gateway`, mà Angela CLI bao gồm dưới dạng phần phụ thuộc workspace.

```text
Angela CLI gateway commands
  -> @angela/gateway standalone server, loopback only
    -> provider registry and account credentials
    -> token refresh and routing
    -> upstream provider APIs

Angela chat -> shared local configuration -> gateway /v1 -> the same accounts
```

CLI khởi động máy chủ, liệt kê các tài khoản và mô hình, thêm tài khoản dựa trên khóa và chọn nhà cung cấp được chia sẻ. OAuth và nhập tài khoản đặc biệt sử dụng bảng điều khiển cục bộ đi kèm chứ không phải ứng dụng cổng bên ngoài. Gói cấu hình cục bộ hiện có sở hữu các bản cập nhật nhà cung cấp nguyên tử. Mật khẩu bảng điều khiển ban đầu và quản lý token tách biệt với khóa suy luận chung.

`angela` tương tác bắt đầu với các lựa chọn GPT, Gemini, Claude, Tùy chỉnh, Tiếp tục và Thoát. Menu tùy chỉnh hiển thị các điều khiển tài khoản, lựa chọn mô hình, kiểm tra khóa và bảng điều khiển đi kèm đầy đủ. OAuth vẫn còn trong trình duyệt. Menu không bao giờ thu thập mật khẩu nhà cung cấp. Menu chỉ sở hữu một cổng con khi nó khởi động cổng con đó. Việc tắt trò chuyện sẽ giải phóng đứa trẻ sở hữu đó. Lựa chọn mô hình rõ ràng sẽ ghi đè các giá trị môi trường nhà cung cấp cho phiên đó và lưu cấu hình cục bộ được chia sẻ. Tự động hóa, cờ nhà cung cấp rõ ràng và `--no-menu` giữ nguyên hành vi hiện có của chúng.

Chủ sở hữu tiền cảnh chỉ dừng con của nó. Nó từ chối các cổng bị chiếm đóng và không bao giờ giết chết những người nghe không liên quan. Vô hiệu hóa trình cập nhật và đo từ xa upstream. Giữ biểu đồ nhà cung cấp đầy đủ thay vì sao chép tập hợp con đăng nhập.

<a id="consequences"></a>

## Hậu quả

Bản phát hành Angela di động có chứa công cụ được xây dựng. Người dùng không tải xuống hoặc cài đặt một sản phẩm cổng khác. Bản dựng nguồn yêu cầu pnpm và tải xuống các phần phụ thuộc khung bị khóa thông thường. Bảng thông tin đã nhập vẫn giữ nguyên cách triển khai React/Next.js riêng biệt. Các ứng dụng Vue chính của Angela không thay đổi framework.

Lần phân phối đầu tiên không thêm màn hình tài khoản desktop, dịch vụ hệ thống hoặc cổng tiếp xúc từ xa. OAuth thực, hạn ngạch và tính khả dụng của mô hình yêu cầu tài khoản nhà cung cấp và xác minh thủ công. Kiểm tra tích hợp tự động bao gồm động cơ thực bằng nhà cung cấp tổng hợp cục bộ.
