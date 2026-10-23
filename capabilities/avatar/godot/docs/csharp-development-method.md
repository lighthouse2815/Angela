<a id="stage-tamagotchi-godot-c-development-method"></a>

# stage Tamagotchi Godot Phương pháp phát triển C#

Hướng dẫn này chỉ áp dụng cho `capabilities/avatar/godot`.

Nó xác định cách cấu trúc mã C# trong công cụ Godot này và cách sử dụng các tính năng C# hiện đại. Các quy tắc định dạng và đặt tên là phụ và trực tiếp trong `.editorconfig` cục bộ cộng với `docs/csharp-style.md`.

<a id="1-scope"></a>

## 1. Phạm vi

Sử dụng hướng dẫn này cho:

- Kịch bản cảnh Godot
- Điều phối viên và bộ điều khiển runtime
- Hợp đồng host-stage transport
- mã đăng ký và khám phá
- mã hỗ trợ công cụ và trình soạn thảo bên trong công cụ này

Đừng coi hướng dẫn này là tiêu chuẩn C# cho toàn bộ repo.

<a id="2-layer-model"></a>

## 2. Lớp mô hình

Chia mã C# của công cụ thành các lớp này trước khi viết triển khai:

1. Kịch bản cảnh
   - Các lớp một phần `Node` hoặc `Node3D` thuộc sở hữu của Godot
   - điểm vào vòng đời và ràng buộc cảnh
2. Lõi runtime
   - logic C# runtime đơn giản
   - người kiểm soát, người điều phối, chủ sở hữu trạng thái, dịch vụ
3. Hợp đồng và transport
   - các loại tin nhắn
   - ảnh chụp nhanh cài đặt
   - tải trọng sẵn sàng, nghiêm trọng, tắt máy và cập nhật trạng thái
4. Đăng ký và khám phá
   - sự mô tả
   - khám phá thời gian khởi động
   - danh mục và bảng tra cứu
5. Hỗ trợ công cụ và biên tập
   - người trợ giúp đối mặt với thanh tra
   - Người trợ giúp import/export
   - gỡ lỗi hoặc tập hợp dữ liệu chỉ dành cho người soạn thảo

Theo mặc định, không thu gọn những trách nhiệm này thành một tập lệnh Godot duy nhất.

<a id="3-scene-script-rules"></a>

## 3. Quy tắc kịch bản cảnh

Kịch bản cảnh nên mỏng.

Sử dụng kịch bản cảnh cho:

- Các điểm vào vòng đời của Godot như `_Ready`
- Tra cứu và nối dây cảnh Node
- trao quyền điều khiển cho các đối tượng runtime
- kết nối các lệnh gọi lại Godot thành mã runtime rõ ràng

Tránh đặt những thứ này trực tiếp vào tập lệnh cảnh trừ khi mã đó không quan trọng:

- Xử lý giao thức transport
- xây dựng đăng ký
- chuyển đổi trạng thái phức tạp
- quy tắc kinh doanh hoặc trò chơi
- đường ống chuyển đổi dữ liệu lớn

Nếu tập lệnh cảnh bắt đầu sở hữu vòng đời, trạng thái runtime, xử lý giao thức và cấu hình công cụ cùng một lúc, hãy tách mã.

<a id="4-runtime-core-rules"></a>

## 4. Quy tắc cốt lõi của runtime

Trước tiên hãy đặt logic runtime bền bỉ vào các đối tượng C# đơn giản.

Thích hơn:

- điều phối viên nhỏ trên các lớp học lớn biết tất cả
- đối tượng trạng thái rõ ràng trên các cờ có thể thay đổi ẩn
- hàm tạo hoặc phương thức chèn phụ thuộc
- luồng cuộc gọi rõ ràng qua chuyển điều khiển ngầm

Mã lõi runtime phải dễ dàng theo dõi trong trình gỡ lỗi. Ưu tiên các bản đồ, trạng thái và luồng điều khiển rõ ràng hơn là sự trừu tượng hóa thông minh.

<a id="5-contract-and-transport-rules"></a>

## 5. Hợp đồng và Quy tắc transport

Làm cho giao tiếp xuyên biên giới theo kiểu định hướng.

Thích các loại rõ ràng cho:

- Tin nhắn transport
- tải trọng
- ảnh chụp nhanh cài đặt
- sự mô tả
- mục đăng ký
- Ảnh chụp nhanh trạng thái runtime

Tránh xa:

- `Dictionary<string, object?>` làm hình dạng hợp đồng mặc định
- giao thức chuỗi ma thuật trải rộng trên các tập tin
- các đối tượng ẩn danh vượt qua ranh giới hệ thống con
- nhận xét thay thế cho định nghĩa kiểu thực

Quy tắc rất đơn giản: trước tiên hãy xác định ranh giới theo các loại, sau đó triển khai transport xung quanh các loại đó.

<a id="6-reflection-and-linq-policy"></a>

## 6. Chính sách phản ánh và LINQ

Suy ngẫm là để khám phá chứ không phải để thực thi.

Công dụng tốt của sự phản ánh:

- khám phá mô-đun thời gian khởi động
- đọc siêu dữ liệu thuộc tính
- bộ mô tả sinh nội dung
- hỗ trợ biên tập hoặc công cụ

Không sử dụng sự phản ánh cho:

- logic trên mỗi khung hình
- Công văn đường dẫn nóng runtime
- thực thi máy trạng thái cốt lõi
- lệnh gọi động lặp đi lặp lại ở trạng thái ổn định runtime

LINQ dành cho truy vấn đường dẫn nguội và định hình dữ liệu.

Công dụng tốt của LINQ:

- đăng ký xây dựng
- lọc mô tả
- phép chiếu cấu hình
- chế độ xem gỡ lỗi hoặc công cụ

Tránh LINQ nặng trong các đường dẫn nóng, vòng lặp trên mỗi khung hình hoặc các truy vấn runtime được thực hiện lặp đi lặp lại khi chỉ mục hoặc từ điển rõ ràng sẽ rõ ràng hơn và rẻ hơn.

Hãy sử dụng mô hình tinh thần này:

- sự phản ánh xây dựng danh mục
- LINQ định hình và truy vấn danh mục
- runtime thực thi thông qua các cấu trúc rõ ràng

<a id="7-async-boundary-policy"></a>

## 7. Chính sách ranh giới không đồng bộ

Sử dụng async tại I/O và xử lý các ranh giới.

Ranh giới không đồng bộ tốt:

- Thiết lập socket và transport
- tập tin I/O
- Tương tác quá trình phía host
- tải khởi động vốn không đồng bộ

Tránh đẩy async vào:

- cập nhật trên mỗi khung hình
- vòng lặp runtime lõi
- hành vi nhạy cảm với thời gian nên luôn rõ ràng

Không sử dụng async để ẩn các vấn đề về vòng đời hoặc đặt hàng.

<a id="8-deferred-decisions"></a>

## 8. Quyết định hoãn lại

Những mục này được cố ý trì hoãn và không nên đoán:

- chính sách triển khai loại tham chiếu có thể vô hiệu
- chiến lược không gian tên
- Ranh giới sử dụng `record`
- Ranh giới sử dụng của thành viên `required`
- ranh giới sử dụng hàm tạo chính
- phụ cấp tính năng của lớp trợ giúp so với kịch bản cảnh

Khi một trong những điều này trở nên phù hợp, hãy quyết định nó một cách rõ ràng và thêm nó vào hướng dẫn cục bộ của công cụ thay vì suy luận nó từ các công cụ định kiểu.
