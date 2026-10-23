<a id="camera-perception-domain"></a>

# Miền nhận thức của máy ảnh

`observation.ts` xác định giao thức trung lập nhà cung cấp nghiêm ngặt và hợp đồng Eventa cục bộ. Phương tiện thô, danh tính và các mốc đầy đủ bị từ chối tại ranh giới này. Python JSONL chỉ nhập nhà cung cấp sau khi xác thực Valibot.

`AffectEngine` sử dụng các quan sát và sở hữu một cửa sổ cuộn có giới hạn. Đồng hồ của nó là một đối số mili giây rõ ràng trên `observe` và `getState`. Sản xuất mặc định là `Date.now()`. Các bài kiểm tra vượt qua dấu thời gian trực tiếp và không cần hẹn giờ, ngủ, webcam hoặc mô hình runtime.

Động cơ phát ra `facePresent`, biểu cảm, sự chú ý, sự tự tin của người theo dõi, thời lượng ổn định và thời gian quan sát. Các giá trị biểu thức là `neutral`, `smile` và `unknown`. Các giá trị chú ý là `screen`, `away` và `unknown`. Trung tính có nghĩa là không có hình dạng miệng giống như nụ cười rõ ràng. Màn hình có nghĩa là hướng đầu gần đúng, không đo được ánh mắt.

Hành vi mặc định:

| Quy tắc | Giá trị |
| --- | --- |
| Cửa sổ cuốn | 1000 ms, tối đa 300 quan sát |
| Giới hạn độ tươi | 2000 mili giây |
| Bằng chứng khuôn mặt | Độ tin cậy ít nhất 0,65 trong 80% mẫu cửa sổ |
| Lột mặt | 400 ms và ít nhất ba mẫu |
| Biểu thức gỡ bỏ | 700 ms và ít nhất ba mẫu |
| Gỡ lỗi màn hình | 600 ms và ít nhất ba mẫu |
| Ra mắt | 1800 ms và ít nhất ba mẫu |
| Cười | Điểm trung bình tối thiểu là 0,65, độ mở miệng tối đa là 0,45 |
| Trung lập | Điểm trung bình tối đa là 0,25, độ mở miệng tối đa là 0,25 |
| Màn hình | Độ lệch tuyệt đối trung bình tối đa là 18°, nghiêng tối đa 15° |
| Đi xa | Độ lệch tuyệt đối trung bình ít nhất là 30° hoặc nghiêng ít nhất 25° |

Các phạm vi còn lại tạo ra không xác định. Thiếu tính năng hoặc tư thế cũng tạo ra những điều chưa biết. Sự chênh lệch tư thế tuyệt đối ngăn cản việc quay đầu trái và phải từ mức trung bình thành tín hiệu trên màn hình. Sự gián đoạn trong tính liên tục của mẫu sẽ đặt lại trình gỡ lỗi. Trạng thái cũ hết hạn ngay cả khi không có khung hình mới nào đến. Thời lượng đo độ ổn định đầu ra được xác nhận chứ không phải độ dài của một khung hình.

Miền này cung cấp các tín hiệu đàm thoại mang tính tư vấn. Nó không phân loại cảm xúc bên trong, bản sắc, sức khỏe hoặc sự hiểu biết. Các ngưỡng heuristic cần được đánh giá bằng camera thực đối với người dùng và điều kiện ánh sáng.

<a id="request-context-and-conversational-reactions"></a>

## Yêu cầu bối cảnh và phản ứng đàm thoại

`CameraContextProvider` cung cấp trạng thái nhỏ gọn hiện tại cho mọi yêu cầu liên quan trong khi cảm nhận của máy ảnh là ON. Sự mới mẻ và bằng chứng cổng kiểm tra vẫn được áp dụng. Đọc lại cùng một trạng thái không che giấu nó. CLI hiện có của `resolveStep` hook làm mới hệ thống gửi đi prompt trước mỗi lệnh gọi mô hình, bao gồm cả phần tiếp theo của công cụ. Bối cảnh nhiệm vụ và bộ nhớ vẫn có sẵn thông qua các lượt hệ thống hiện có của chúng. Các quan sát của camera và tín hiệu được đưa vào không bao giờ được đưa vào cuộc trò chuyện, phiên hoặc bộ nhớ lâu dài. Cập nhật máy ảnh không bắt đầu yêu cầu mô hình.

Các cơ hội phản ứng đàm thoại nhà cung cấp track riêng biệt. Tín hiệu không thay đổi sẽ cho phép bạn có cơ hội bình luận khác sau sáu mươi giây. Một tín hiệu đã thay đổi cần ít nhất mười giây. Những khoảng thời gian này chỉ ảnh hưởng đến hướng dẫn bình luận của prompt. Mọi yêu cầu đủ điều kiện vẫn nhận được trạng thái hiện tại. Trong khoảng thời gian yên tĩnh, Angela có thể điều chỉnh giọng điệu hoặc nhịp độ của nó và trả lời một cách thận trọng các câu hỏi rõ ràng về tín hiệu. Chính sách này không phát hiện liệu thư trả lời trước đó có sử dụng cơ hội hay không.
