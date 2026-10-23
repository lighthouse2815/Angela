<a id="angela-companion"></a>

# Angela đồng hành

<a id="goal"></a>

## Mục tiêu

Angela là người bạn đồng hành AI cá nhân để trò chuyện thoải mái và hỗ trợ học tập. Người dùng đã chấp thuận việc sử dụng lại AIRI và giữ lại các ứng dụng, trò chơi, tích hợp và công cụ hiện có.

<a id="decisions"></a>

## Quyết định

- Đổi tên trang web chính và các bề mặt desktop thành Angela.
- Giữ nguyên tên gói nội bộ, giao thức, khóa lưu trữ và thẻ ký tự tùy chỉnh.
- Cung cấp cho các bản cài đặt mới một nhân vật Angela nói tiếng Việt và hỗ trợ học tập khi được yêu cầu.
- Giữ ký tự stage, đường dẫn thoại và thực thi công cụ đã có trong kho lưu trữ.
- Sử dụng OpenAI nhà cung cấp hiện có để trò chuyện, xem, chép lời và nói.
- Định cấu hình khóa API thông qua cài đặt nhà cung cấp hiện có. Không bao giờ cam kết thông tin xác thực.
- Thay thế mã trong `lighthouse2815/Angela` theo yêu cầu của người dùng.
- Giữ nguyên giấy phép và ghi công ban đầu của AIRI.

<a id="validation"></a>

## Xác thực

Chạy kiểm tra thẻ ký tự, kiểm tra ngôn ngữ, bản dựng workspace và tìm lỗi mã nguồn. Kiểm tra trình thực thi desktop đã cài đặt trước khi xác nhận rằng điều khiển máy tính xách tay hoạt động. Xác thực trực tiếp API cần có khóa API do người dùng nhập.
