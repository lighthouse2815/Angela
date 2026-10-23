<a id="companion-generation-evaluation"></a>

# Đánh giá đồng hành sinh nội dung

<a id="scope-and-sequence"></a>

## Phạm vi và trình tự

1. Kiểm tra thông số hành vi, ADR, runtime, bộ nhớ, tác vụ và các thử nghiệm hiện có.
2. Thêm 57 trường hợp sinh nội dung, một lược đồ, các thử nghiệm runner trong đường dẫn sản xuất và runner.
3. Ghi lại đường cơ sở bất biến trước khi chỉnh sửa sản xuất.
4. Sử dụng bằng chứng cơ bản để chọn các bản sửa lỗi nhỏ hoặc ghi lại các lỗi chưa được giải quyết.
5. Chạy các đánh giá sinh nội dung và Recall, kiểm tra CLI, các lần kiểm tra kiểu dữ liệu, lint và bản dựng CLI.
6. Ghi lại kết quả, giới hạn và lệnh sao chép. Cam kết và đẩy từng phần đã hoàn thành.

Không có bộ nhớ V3, Recall viết lại, cơ sở dữ liệu vectơ hoặc hệ thống đa agent thực hiện nhiệm vụ này.

<a id="source-audit"></a>

## Kiểm tra nguồn

Nguồn ban đầu: `8ca4fea`. Kho lưu trữ nằm trong `airi/` trong thư mục làm việc được cung cấp.

| Lớp | Triển khai hiện tại | Ý nghĩa đánh giá |
| --- | --- | --- |
| Truy xuất | Recall xác thực các phiên bản nguồn, phạm vi, thời hạn sử dụng và phiên thay thế. Các phần nhúng tùy chọn bổ sung cho việc truy xuất từ ​​vựng. | Ghi lại danh tính nguồn độc lập với các xác nhận quyền sở hữu được tạo. |
| Bối cảnh | `buildContext` kết hợp có giới hạn Recall, hướng dẫn dự án và nhiệm vụ. Các tập hiện tại nằm ngoài ngữ cảnh Recall tự động. | thu nhận dữ liệu cuộc trò chuyện thực tế tại ranh giới nhà cung cấp. |
| sinh nội dung | `Chat` sử dụng prompt đồng hành ngắn, lịch sử hiện tại và core-agent. Hướng dẫn Recall ưu tiên chỉnh sửa hiện tại. | Tạo thông qua `RuntimeSession.send`, với bộ nhớ và công cụ thực. |
| Kết quả công cụ | `buildTools.observe` phân biệt các kết quả đã được xác minh, chưa được xác minh và không thành công. Nhiệm vụ các thay đổi trạng thái yêu cầu lưu kết quả. | Giữ lại kết quả công cụ và các sự kiện runtime tách biệt với văn xuôi mô hình. |
| thu nhận dữ liệu | Bộ nhớ V2 gắn nhãn văn bản người dùng, công cụ đã được xác minh, lỗi và cam kết hỗ trợ chưa được xác minh một cách riêng biệt. | Kiểm tra trạng thái bền sau yêu cầu đối với việc ghi bị cấm. |
| Lời nhắc | Nhiệm vụ riêng biệt đang chờ xử lý, yêu cầu, giao hàng và hoàn thành. Sự thừa nhận của người lập lịch chứng minh việc trình bày chứ không phải việc đọc. | Phân phối hạt giống thông qua chuyển đổi trạng thái nhiệm vụ thực tế mà không có thông báo bên ngoài. |

Đánh giá đồng hành hiện có đo lường khả năng truy xuất và bối cảnh. Nhãn phiếu trắng của nó không đánh giá các câu trả lời được tạo ra. Báo cáo mới nhất của nó ghi lại các lượt hoàn thành 120/128, các lượt truy cập 101/106 Recall và các lượt truy cập bối cảnh 98/106. Bộ nhớ sai, lỗi thay thế và nội dung tiêm không liên quan đều bằng 0 trong báo cáo đó.

Hệ thống hiện tại prompt không liệt kê mọi điểm khác biệt về thông số kỹ thuật. Chỉ quan sát này không chứng minh được sự thất bại của sinh nội dung. Không có bản sửa lỗi sản xuất nào được ủy quyền chỉ bằng so sánh prompt tĩnh.

<a id="measurement-contract"></a>

## Hợp đồng đo lường

mẫu kiểm thử tạo trạng thái thông qua bộ lưu trữ sản xuất và API công cụ. mẫu kiểm thử không bao giờ đọc câu trả lời mong đợi trong quá trình xây dựng ngữ cảnh. sinh nội dung chỉ nhận các thông báo hiện tại, nguồn lịch sử, hướng dẫn sản xuất và kết quả công cụ thực tế. Việc đánh giá ngữ nghĩa nhận được những kỳ vọng đông cứng sau sinh nội dung. Nó không thể chỉnh sửa chúng. Kiểm tra xác định bao gồm lựa chọn nguồn, ghi bị cấm và chuyển tiếp hành động bắt buộc. Việc đánh giá mô hình bao gồm các tuyên bố, sự không chắc chắn, quy kết và hành vi đàm thoại. Các lỗi cơ sở hạ tầng và các trường hợp không được xét xử không bao giờ được coi là hành vi được thông qua. Lệnh mặc định chuẩn bị các bối cảnh không có yêu cầu mạng. trực tiếp sinh nội dung yêu cầu `--live`.

<a id="read-set"></a>

## Bộ đọc

- `docs/ai/companion-behavior-spec.md` và các ADR đồng hành, bộ nhớ học tập và bộ nhớ V2.
- Các ADR khác thiết lập ranh giới UI, giọng nói, camera và tích hợp bên ngoài nhiệm vụ CLI sinh nội dung này.
- `evals/companion/`, bao gồm lược đồ, mẫu kiểm thử, tính điểm, báo cáo và hồi quy.
- CLI `chat.ts`, `context.ts`, `runtime/`, `recall.ts`, `memory.ts` và `memory-v2/`.
- Nhiệm vụ CLI, công cụ tác vụ, bộ lập lịch, thông báo, phân phối, phiên và các bài kiểm tra liên quan của chúng.
- Cuộc trò chuyện core-agent, lệnh gọi công cụ, luồng và hợp đồng nhà cung cấp.

Kết quả CLI/private-channel không chứng nhận hành vi bộ nhớ học tập desktop Pinia hoặc thông báo thực transport.
