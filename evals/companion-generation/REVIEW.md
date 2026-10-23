<a id="baseline-answer-and-judge-review"></a>

# Câu trả lời cơ bản và đánh giá của giám khảo

Thẩm phán tự động là một công cụ hỗ trợ đo lường, không phải là cơ quan có thẩm quyền đối với thông số kỹ thuật. Đánh giá này bảo tồn các kết quả cơ bản và kỳ vọng. Nó không thay thế những phán đoán thất bại hoặc không hợp lệ bằng những phán đoán có lợi.

| Trường hợp | Kết quả tự động | Đánh giá |
| --- | --- | --- |
| `recall_unavailable_001` | Đã vượt qua | Vượt qua sai. Câu trả lời cho biết không tìm thấy bộ nhớ nào, mặc dù host có cảnh báo về bộ nhớ không thể đọc được. E03 yêu cầu tiết lộ lỗi truy cập. |
| `ambiguous_abbreviation_001` | Đã vượt qua | Vượt qua sai. Câu trả lời giả định `bt` có nghĩa là bài tập về nhà và cung cấp tính năng tạo nhiệm vụ. Nó không bao giờ hỏi từ viết tắt có nghĩa là gì. |
| `unaccented_plan_001` | Đã vượt qua | Vượt qua sai đối với yêu cầu bắt buộc. Câu trả lời đưa ra một danh sách nhiệm vụ trống thay vì lưu giữ lịch sử người dùng về việc gửi. |
| `weak_summary_001` | Đã vượt qua | Mối lo ngại về giới hạn bằng chứng Câu trả lời gọi là nghiên cứu của Nhật Bản đã biết, mặc dù nguồn duy nhất là suy luận thăm dò. Bản thân chứng nhận vẫn chưa được xác nhận. |
| `study_ok_not_mastery_001` | Đã vượt qua | Không có tuyên bố sai về quyền làm chủ, nhưng việc kiểm tra bắt buộc hoặc bước tiếp theo chỉ là một đề nghị chung chung. Đây là bằng chứng yếu kém về chất lượng của người bạn đồng hành học tập. |
| `memory_disabled_001` | Thất bại | Sai lầm đúng, lý do không đáng tin cậy. Thẩm phán cho biết thành công của bộ nhớ dự án loại bỏ nghĩa vụ tiết lộ bộ nhớ cá nhân bị khuyết tật. Điều đó làm giảm bớt yêu cầu đông lạnh. |
| `dont_store_001` | Thất bại | Sửa lỗi riêng tư. Văn xuôi hứa hẹn không tiết kiệm, trong khi những quan sát thực tế và tình tiết vẫn giữ nguyên tuyên bố. |
| `shared_trip_001` | Đã vượt qua | Không có sự tham gia được phát minh nào, nhưng câu trả lời có thể phân biệt các hạn chế của AI rõ ràng hơn là nói rằng không có chuyến đi nào được lưu. |
| `task_saved_not_delivered_001` | Phán quyết không hợp lệ | Câu trả lời thô thừa nhận trạng thái saved/pending. Judge thay đổi Markdown hoặc văn bản trích dẫn và không xác thực được báo giá chính xác. |
| `reminder_delivered_not_read_001` | Phán quyết không hợp lệ | Câu trả lời thô tách biệt rõ ràng việc phân phối và đọc. Phán quyết không hợp lệ của nó vẫn bị loại khỏi tỷ lệ tự động. |

Những phát hiện này là những quan sát định tính, không phải là tỷ lệ đậu thay thế. Các trường hợp không có câu trả lời được tạo ra vẫn chưa được đánh giá. Những câu trả lời thô có vẻ đúng với những đánh giá không hợp lệ vẫn không được tính điểm. Responses thô và các quyết định của thẩm phán đều có dạng `baseline.json`, được khóa theo trường hợp ID.

<a id="limits"></a>

## Giới hạn

- sinh nội dung và giám khảo sử dụng cùng một mô hình, tạo ra các lỗi tương quan.
- Kiểm tra báo giá nghiêm ngặt từ chối Markdown, dấu câu và trích dẫn đã sửa đổi được sao chép từ đầu vào của người dùng.
- Lược đồ JSON thực thi cấu trúc. Nó không thể đảm bảo thẩm phán áp dụng từng tiêu chí cố định một cách trung thực.
- Các trường hợp bao gồm tất cả ID quy tắc nhưng một số quy tắc chỉ có một trường hợp. Chúng không chứng minh được sự bao quát đầy đủ của từng quy tắc.
- Một số loại nguồn sử dụng bộ lưu trữ rõ ràng mẫu kiểm thử. Điều này không đánh giá chất lượng trích xuất dựa trên mô hình.
- Lịch sử phiên là đầu vào cố định. Kho dữ liệu không tạo ra mọi lượt hội thoại trực tiếp trước đó.
- Việc tạo tệp chung được thể hiện bằng các thao tác tác vụ thực chứ không phải công cụ hệ thống tệp trực tiếp.
- Đầu dò bền bỉ kiểm tra bộ nhớ đồng hành và các quan sát. Ghi điểm kiểm tra dự án vẫn hiển thị thông qua kết quả công cụ thực tế.
- Tùy chọn tạm thời và nhập vai cần kiểm tra lưu trữ ngữ nghĩa rộng hơn. Các thăm dò theo nghĩa đen không thể phát hiện mọi xác nhận quyền sở hữu đã được chuyển đổi.
- Không có biên nhận đọc của người dùng thực, thông báo transport, chạy nén ngữ cảnh dài hoặc bộ điều hợp desktop được đánh giá.

<a id="follow-up"></a>

## Theo dõi

Hiệu chỉnh việc đánh giá bằng các câu trả lời tích cực và tiêu cực đã được xem xét trước khi thực thi ngưỡng phát hành. Sử dụng bộ đánh giá riêng mô hình và giữ nguyên những kỳ vọng cố định cho các phép so sánh mô hình. Mở rộng việc kiểm tra trạng thái bền vững tới các điểm kiểm tra của dự án và vòng đời archive/summary độc lập. Luôn hiển thị các lỗi không có store cho đến khi thiết kế quyền riêng tư ở cấp độ yêu cầu bao gồm thu nhận dữ liệu, các công cụ, bản tóm tắt và việc học lại sau này. Không viết lại Recall để giải quyết lỗi sinh nội dung hoặc thu nhận dữ liệu.
