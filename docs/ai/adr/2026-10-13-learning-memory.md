<a id="learning-memory"></a>

# Học trí nhớ

Angela giữ lại các chủ đề học tập, mục tiêu, khó khăn và cách giải thích trong các cuộc trò chuyện. Hồ sơ lưu lại trên thiết bị này và thuộc về một ký tự.

<a id="storage-and-ownership"></a>

## Lưu trữ và quyền sở hữu

Sử dụng tính năng đồng bộ hóa Pinia hiện có cho các chỉnh sửa do người lãnh đạo sở hữu và localStorage để duy trì. Kiên trì từng chỉnh sửa trước khi xuất bản ảnh chụp nhanh của nó. Ảnh chụp nhanh được sao chép không bao giờ ghi vào bộ lưu trữ. store tối đa 50 bản ghi cho mỗi ký tự, với 500 ký tự cho mỗi bản ghi. Bao gồm tối đa 20 bản ghi trong yêu cầu trò chuyện. Do đánh giá trước hồ sơ gần đây. Ngữ cảnh đã lưu được gửi đến AI nhà cung cấp đã chọn như một phần của yêu cầu đó.

<a id="chat-behavior"></a>

## Hành vi trò chuyện

thu nhận dữ liệu id ký tự từ chủ sở hữu cuộc trò chuyện trước khi chuẩn bị yêu cầu. Cung cấp bối cảnh và công cụ học tập mô hình thông qua luồng yêu cầu trò chuyện hiện có. Các công cụ ghi nhớ yêu cầu trích dẫn nguyên văn từ tin nhắn hiện tại của người dùng. mô hình chỉ lưu các thông tin học tập mà người dùng đã nêu. Tài liệu được trích dẫn và kết quả bên ngoài không phải là dữ kiện của người dùng. mô hình chỉ xác nhận chỉnh sửa sau khi công cụ lưu trữ thành công. Văn bản được lưu trữ là dữ liệu, không bao giờ là hướng dẫn. Việc tắt bộ nhớ sẽ xóa bối cảnh và công cụ của nó khỏi các yêu cầu tiếp theo mà không xóa các bản ghi đã lưu.

<a id="review-progress"></a>

## Xem lại tiến độ

Lịch trình ôn tập tùy chọn thuộc về hồ sơ học tập của nó. Hồ sơ không có lịch trình vẫn được hỗ trợ. Người dùng chọn khoảng thời gian 1, 3, 7, 14 hoặc 30 ngày trong cài đặt. Một lịch trình mới bắt đầu đến hạn. Các bài đánh giá đã hoàn thành sẽ tăng số lượng và di chuyển bài đánh giá tiếp theo theo số ngày 24 giờ đã chọn. Số lượng mô tả các bài đánh giá đã hoàn thành chứ không phải mức độ thông thạo. Ứng dụng không gửi thông báo nền. Việc thay đổi khoảng thời gian sẽ giữ nguyên số lượng và tính toán thời hạn kể từ lần xem xét hoàn thành gần đây nhất. Việc chỉnh sửa một sự kiện sẽ giữ nguyên lịch trình của nó. Việc vô hiệu hóa lịch trình sẽ loại bỏ tiến trình của nó mà không xóa được thực tế. Lịch trình và hành động tiến độ do người lãnh đạo sở hữu vẫn tồn tại trước khi xuất bản. Ảnh chụp nhanh được sao chép không bao giờ ghi vào bộ lưu trữ. Công cụ trò chuyện chỉ ghi lại đánh giá đã hoàn thành sau khi người dùng xác nhận rõ ràng với bằng chứng hiện tại. Trò chuyện không thể tạo lịch biểu. Việc tắt bộ nhớ sẽ xóa bối cảnh và công cụ đánh giá khỏi các yêu cầu sau này.

<a id="user-controls-and-checks"></a>

## Kiểm soát và kiểm tra của người dùng

Sử dụng Cài đặt → Mô-đun → Bộ nhớ dài hạn để xem, thêm, chỉnh sửa, xóa hoặc tắt bộ nhớ học tập. Giữ lịch sử hội thoại, hồ sơ tài khoản và sổ ghi chép nhân vật hiện có một cách độc lập. Kiểm tra tính bền vững sau khi tải lại, cách ly ký tự, chỉnh sửa leader/follower, công cụ bị tắt và bối cảnh trò chuyện.
