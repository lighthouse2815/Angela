<h1 align="center"> Airi VTuber</h1>

<p align="center">
  [<a href="https://airi.ayaka.io">Hãy thử</a>]
</p>

> Lấy cảm hứng mạnh mẽ từ [Neuro-sama](https://www.youtube.com/@Neurosama)

<a id="shared-local-configuration"></a>

## Cấu hình cục bộ được chia sẻ

Khi được phân phát trên localhost thông qua bản xem trước hoặc phát triển Vite, ứng dụng này chia sẻ `~/.config/angela/config.json` với desktop và CLI. Đặt `ANGELA_CONFIG` trước khi khởi động Vite để chọn tệp khác. Cài đặt nhà cung cấp tự động lưu và các chỉnh sửa bên ngoài làm mới sau mỗi 1,5 giây. Mỗi cấu hình trình duyệt nhập nhà cung cấp trực tiếp hiện có của nó một lần. Các giá trị được chia sẻ được ưu tiên khi ID phiên bản khớp nhau. Điểm cuối Vite chỉ chấp nhận các yêu cầu cục bộ, có cùng nguồn gốc. Các bản dựng hosted giữ nguyên trạng thái cấu hình hiện tại của chúng. Xem [cấu hình cục bộ](../../packages/local-config/README.md) để biết hợp đồng tệp.

<a id="performance-diagnostics"></a>

## Chẩn đoán hiệu suất

Chạy `pnpm dev:web:https` từ kho lưu trữ gốc. Mở `/devtools/performance-visualizer` và kích hoạt FPS. Lớp phủ nổi hiển thị 10 giây cuối cùng của lịch sử FPS, cùng với các trục thời gian và FPS. Các giá trị tối thiểu, tối đa và mới nhất mô tả các mẫu có thể nhìn thấy. Các số liệu khác giữ lại biểu đồ phân phối của chúng.

Bắt đầu ghi, sau đó điều hướng trong ứng dụng đến cảnh bạn muốn đo. Dừng ghi trong vòng 60 giây hoặc để ghi tự động dừng. Quay lại trình hiển thị để kiểm tra lịch sử FPS đã ghi. Xuất bản ghi dưới dạng CSV cho các dấu thời gian và giá trị riêng lẻ.

Mỗi mẫu FPS là `1000 / frameIntervalMs`, từ các lệnh gọi lại `requestAnimationFrame`. Sử dụng các mẫu này để xác định các thay đổi về thời gian của khung hình hoạt ảnh. Họ không đo lường bản trình bày GPU hoặc ứng dụng native FPS. Giữ trang ở phía trước. Tải lại trang sẽ xóa bản ghi.

Để so sánh thiết bị, hãy sử dụng cùng một cảnh, mô hình, thời gian khởi động và thời lượng ghi. Máy chủ phát triển và lớp phủ hiển thị ảnh hưởng đến hiệu suất, vì vậy hãy ghi lại các điều kiện này cùng với kết quả.
