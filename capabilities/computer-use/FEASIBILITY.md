<a id="feasibility-summary"></a>

# Tóm tắt tính khả thi

Tài liệu này ghi lại trạng thái xác thực của dàn nhạc macOS desktop v1 dành riêng cho Angela trong `capabilities/computer-use`.

<a id="bottom-line"></a>

## Dòng dưới cùng

Hướng hiện tại là khả thi và mạnh mẽ hơn về mặt vật chất so với con đường chỉ có tầm nhìn thuần túy trước đó. Kiến trúc được xác nhận bây giờ là:

- Angela giữ máy bay điều khiển
- `computer-use-mcp` theo dõi, kiểm tra, lưu giữ ảnh chụp màn hình, chính sách và bề mặt MCP
- chương trình phụ trợ thực thi chính là tự động hóa cửa sổ macOS cục bộ
- Angela desktop xử lý sự chấp thuận của con người thông qua hộp thoại native
- lệnh đầu cuối chạy trong nền được kiểm soát shell runner thay vì tập lệnh tab Terminal

Điều đó làm cho tính năng này trở thành một lớp điều phối chứ không chỉ là bản demo bằng cú nhấp chuột.

<a id="what-was-verified"></a>

## Những gì đã được xác minh

<a id="1-the-service-still-fits-angelas-mcp-attachment-model"></a>

### 1. Dịch vụ vẫn phù hợp với tệp đính kèm MCP mô hình của Angela

Angela tiếp tục sử dụng cầu stdio MCP hiện có thông qua `mcp.json`. Không cần phải viết lại transport.

<a id="2-the-service-now-exposes-a-tool-first-desktop-orchestration-surface"></a>

### 2. Dịch vụ hiện hiển thị bề mặt điều phối desktop đầu tiên của công cụ

Bề mặt được xác thực trong lần thanh toán này:

- Công cụ quan sát desktop
- ứng dụng xác định công cụ open/focus
- công cụ thực thi thiết bị đầu cuối nền
- công cụ tương tác UI nguyên thủy
- người trợ giúp phê duyệt/theo dõi/kiểm toán

Điều này phù hợp hơn với Angela hơn là dẫn đầu bằng lựa chọn hành động thuần túy dựa trên ảnh chụp màn hình.

<a id="3-terminal-execution-is-now-first-class-and-auditable"></a>

### 3. Việc thực thi thiết bị đầu cuối hiện là hạng nhất và có thể kiểm tra được

Xác nhận bằng các bài kiểm tra:

- các lệnh chạy trong quy trình shell nền cục bộ
- mã thoát khác 0 được trả về mà không vứt bỏ stderr/stdout
- cwd bị dính trong các cuộc gọi trừ khi được ghi đè rõ ràng
- thiết lập lại xóa trạng thái đầu cuối

Điều này mang lại cho Angela một lộ trình thực thi xác định cho nhiều quy trình làm việc của nhà phát triển mà không cần dựa vào tập lệnh Terminal.app.

<a id="4-native-approval-now-sits-in-the-angela-desktop-layer"></a>

### 4. Phê duyệt native hiện nằm trong lớp Angela desktop

Xác nhận bởi hình thức thực hiện:

- MCP vẫn trả về `approval_required`
- Angela renderer chặn các hành động đang chờ xử lý của `computer_use`
- Electron main hiển thị hộp thoại phê duyệt native
- Angela tự động theo dõi các lệnh gọi công cụ approve/reject
- Việc sử dụng lại phê duyệt trong phạm vi phiên được giới hạn ở các hành động open/focus của thiết bị đầu cuối và ứng dụng

Như vậy, người dùng thực hiện phê duyệt. Mô hình không được tự phê duyệt.

<a id="5-the-old-remote-linux-path-still-compiles-and-tests"></a>

### 5. Đường dẫn Linux từ xa cũ vẫn biên dịch và kiểm tra

Phần phụ trợ `linux-x11` trước đó vẫn có sẵn dưới dạng đường dẫn thử nghiệm cũ. Đây không còn là câu chuyện v1 chính nữa nhưng nó đã được cố tình biên dịch để công cụ kiểm tra nhanh từ xa hiện có vẫn hoạt động.

<a id="current-boundary"></a>

## Ranh giới hiện tại

Câu chuyện v1 chính:

- người thi hành: `macos-local`
- các ứng dụng được hỗ trợ rõ ràng cho open/focus theo mặc định:
  - `Terminal`
  - `Cursor`
  - `Google Chrome`
- ranh giới an toàn:
  - Hộp thoại phê duyệt native
  - `denyApps`
  - theo dõi/kiểm toán
  - kiên trì chụp ảnh màn hình
  - ngân sách hoạt động

ngoài phạm vi rõ ràng của thẻ này:

- Tự động hóa thiết bị đầu cuối PTY/TUI
- cây tiếp cận sâu đối chiếu ngữ cảnh
- hộp cát UI cấp ứng dụng nghiêm ngặt
- lưu trữ sandbox từ xa cho người dùng khác
- Hỗ trợ Windows / Wayland / đa màn hình

<a id="commands-verified-in-this-checkout"></a>

## Các lệnh đã được xác minh trong lần thanh toán này

- `pnpm -F @angela/computer-use-mcp typecheck`
- `pnpm -F @angela/computer-use-mcp test`
- `pnpm -F @angela/stage-ui typecheck`
- `pnpm -F @angela/desktop typecheck`

<a id="practical-interpretation"></a>

## Phiên dịch thực tế

Tính năng này hiện đáng tin cậy vì:

- lớp điều phối macOS desktop dành cho Angela
- một cách để kết nối trò chuyện, MCP, thực thi thiết bị đầu cuối và quan sát UI vào một luồng nhiệm vụ
- một con đường gia tăng an toàn hơn là cố gắng giải quyết việc sử dụng máy tính tầm nhìn thuần túy chung chung trước tiên

Nó không nên được quảng cáo là:

- nền tảng hộp cát desktop chung
- không cần phê duyệt agent tự động
- ranh giới bảo mật desktop tách biệt với ứng dụng cấp sản xuất
