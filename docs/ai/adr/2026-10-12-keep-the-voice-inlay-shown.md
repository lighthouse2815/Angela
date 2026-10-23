<a id="keep-the-voice-inlay-shown"></a>

# Giữ phần lồng tiếng được hiển thị

Trạng thái: đã chấp nhận

<a id="context"></a>

## Bối cảnh

Lớp phủ desktop hiển thị lời nói trực tiếp trong bảng điều khiển rung mở ra khi lời nói tạo ra văn bản. Lần mở đầu tiên chờ một cửa sổ, tải trang và thiết lập runtime. Bài phát biểu ngắn, chẳng hạn như sau lời đánh thức, kết thúc trước khi bảng điều khiển xuất hiện. Sau đó, bảng điều khiển mở ra và ẩn lại cùng một lúc.

<a id="decision"></a>

## Phán quyết

- Cửa sổ chính hiển thị cửa sổ inlay một lần khi khởi động, không hoạt động. Cửa sổ vẫn được hiển thị và tải.
- Cửa sổ trong suốt và không có sự sống động. Nó nổi trên các cửa sổ khác trên mọi workspace.
- Trang chủ của cửa sổ là trung tâm dưới cùng của màn hình chính. Người dùng có thể kéo viên nang hoặc thẻ đi. Sau khi trang không vẽ gì trong 5 giây, cửa sổ sẽ trở về màn hình chính, do đó, ô tiếp theo sẽ xuất hiện ở nơi người dùng mong đợi. Việc di chuyển là vô hình vì không có gì được sơn. Bài phát biểu và bản nháp giữ nguyên một cửa sổ được kéo. Một sự thay đổi hiển thị cũng di chuyển nó về nhà.
- Cửa sổ mặc định bỏ qua chuột. Trang này sử dụng `useChatFloatingClickThrough`, vì vậy chỉ những gì nó vẽ mới lấy con trỏ.
- Trang neo nội dung của nó vào giữa phía dưới và vẽ một trong bốn chế độ xem:
  - `hidden`: không có gì.
  - `capsule`: máy nghe nhỏ có máy đo mức. Nó xuất hiện khi bất kỳ thu nhận dữ liệu nào khởi động.
  - `card`: bản nháp và bản ghi trực tiếp, với trình soạn nhạc `VoiceDrafts` hiện có.
  - `sent`: văn bản đã gửi. Thẻ di chuyển lên và mờ dần nên bài phát biểu sẽ được đọc như một tin nhắn để lại.
- Viên nang phát triển thành thẻ với sự chuyển đổi kích thước. Cửa sổ cao 200px và rộng tối đa 520px, do đó thẻ và chuyển động gửi phù hợp.
- Thoát ngắt thay vì ẩn cửa sổ. Giọng nói trực tiếp bị hủy với `cancel-presented`, đồng thời thẻ co lại và mờ dần tại chỗ. Bản nháp bị loại bỏ vẫn ở trong cửa sổ trò chuyện và phần chèn chỉ hiển thị lại sau khi văn bản của nó thay đổi. Việc ẩn cửa sổ trong khi thu nhận dữ liệu tiếp tục sẽ khiến người dùng không chắc liệu AIRI có còn nghe hay không.
- Escape hoạt động từ bất kỳ ứng dụng nào trong khi phần inlay hiển thị viên nang hoặc thẻ. Lớp phủ đăng ký Escape toàn cầu thông qua trình điều khiển uiohook chỉ trong thời gian đó. Trình điều khiển không sử dụng chìa khóa nên ứng dụng tập trung vẫn nhận được Escape. Máy gia tốc Electron sẽ loại bỏ Escape khỏi mọi ứng dụng. Nếu không có quyền Trợ năng của macOS, chỉ Escape trong lớp phủ tập trung mới hoạt động.
- Menu khay vẫn có thể ẩn cửa sổ. thu nhận dữ liệu tiếp theo hiển thị lại.

<a id="consequences"></a>

## Hậu quả

- Lớp phủ renderer tiêu tốn bộ nhớ ngay từ khi khởi động, dành cho cả những người dùng không bao giờ nói.
- Cửa sổ trong suốt không làm mờ hệ thống nên thẻ sử dụng bề mặt mờ đục.
- Trong quá trình phát triển, các lớp phủ mà công cụ dành cho nhà phát triển đưa vào trang cũng đưa con trỏ lên khu vực của chúng.
