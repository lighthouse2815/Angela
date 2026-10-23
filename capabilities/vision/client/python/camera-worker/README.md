<a id="local-camera-worker"></a>

# Camera cục bộ worker

worker này sở hữu camera thu nhận dữ liệu và OpenSeeFace suy luận. Nó phát ra các sự kiện JSONL dẫn xuất thông qua thiết bị xuất chuẩn. Chẩn đoán upstream đi tới stderr. Các khung vẫn còn trong bộ nhớ và không bao giờ nhập tệp, yêu cầu mạng hoặc giao thức.

Từ thư mục gốc của kho lưu trữ, tạo môi trường CPU được ghim của Angela:

```sh
uv sync --locked --project apps/cli/python/camera-worker
apps/cli/python/camera-worker/.venv/bin/python apps/cli/python/camera-worker/worker.py --check
apps/cli/python/camera-worker/.venv/bin/python apps/cli/python/camera-worker/worker.py --smoke
```

`--check` nhập các phần phụ thuộc và kiểm tra các tệp cần thiết mà không cần mở máy ảnh. `--smoke` tải mô hình thực và xử lý một khung màu đen tổng hợp mà không cần mở máy ảnh. Đối với Windows, hãy sử dụng `.venv/Scripts/python.exe`.

Để kiểm tra máy ảnh trực tiếp rõ ràng, hãy chạy:

```sh
apps/cli/python/camera-worker/.venv/bin/python apps/cli/python/camera-worker/worker.py --device 0 --fps 10
```

Dừng lại với Ctrl + C. worker giải phóng thiết bị khi thoát. thu nhận dữ liệu sử dụng một khe khung có thể thay thế được. Theo mặc định, suy luận chạy tối đa mười lần mỗi giây. Thiết bị không khả dụng báo cáo `camera_unavailable`. Kiểm tra quyền của thiết bị và liệu ứng dụng khác có sở hữu máy ảnh hay không.

Chạy thử nghiệm không cần phần cứng với hệ thống Python:

```sh
python3 -m unittest discover -s apps/cli/python/camera-worker -p test.py
```

`face_observation` chứa dấu thời gian, sự hiện diện, độ tin cậy của trình theo dõi, pose/features tùy chọn và số liệu lấy mẫu. `ready` tiếp nối capture/inference. `error` thành công đầu tiên chứa mã chẩn đoán có giới hạn. Thiếu tư thế hoặc đặc điểm có nghĩa là không xác định. Việc lắp 3D không thành công không bao giờ trở thành tín hiệu trung lập. Đặt các tài khoản chuyển đổi cho tọa độ row/column của OpenSeeFace và các biểu diễn Euler phía trước tương đương. Hình học giống nụ cười sử dụng lực nâng ở góc miệng so với chiều rộng của miệng. Nó không xác định một người hoặc suy ra cảm xúc.

runtime sử dụng Python 3.11, NumPy 1.26.4, ONNX runtime CPU 1.23.2 và không có giao diện OpenCV 4.11.0.86. Biểu đồ phụ thuộc hoàn chỉnh và các giá trị băm nằm trong `uv.lock`. Bánh xe ONNX runtime 1.9 của upstream yêu cầu ngăn xếp thực thi và bị lỗi trên hạt nhân phát triển. Angela sử dụng runtime riêng thay vì thay đổi nguồn upstream hoặc làm suy yếu khả năng bảo vệ kernel. worker này không yêu cầu thư viện gối và huấn luyện.
