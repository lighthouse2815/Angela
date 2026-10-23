<a id="desktop-lane-status"></a>

# Trạng thái desktop luồng

Cập nhật: 2026-05-08

Ghi chú này là bản ghi nhớ trạng thái thực tế cho desktop luồng hiện tại hoạt động trong nhánh cắt lại này. Nó được thu hẹp một cách có chủ ý: chỉ trạng thái hiện tại, trở ngại thực tế và những gì sẽ xảy ra bây giờ so với sau này.

<a id="what-is-already-true"></a>

## Điều gì đã là sự thật

- Hướng desktop luồng ổn định:
  - chỉ macOS
  - Ưu tiên Chrome
  - hình ảnh + cây ngữ nghĩa + đầu vào OS
  - lớp phủ là lớp trực quan hóa, không phải con trỏ hệ thống thứ hai
- Các đường cơ sở sau đây đã tồn tại trong mã:
  - `/Users/liuziheng/airi/services/computer-use-mcp/src/executors/macos-local.ts`
    - lưu vị trí con trỏ thực và khôi phục nó bằng `CGWarpMouseCursorPosition(...)`
  - `/Users/liuziheng/airi/apps/desktop/src/main/windows/shared/window.ts`
    - `makeWindowPassThrough()` sử dụng sự kiện bỏ qua chuột + hành vi lớp phủ không thể lấy tiêu điểm
  - `/Users/liuziheng/airi/services/computer-use-mcp/src/browser-dom/cdp-bridge.ts`
    - Nhịp tim 5 giây rơi lệ sau 3 lần thất bại liên tiếp
  - `/Users/liuziheng/airi/services/computer-use-mcp/src/bin/smoke-chrome-grounding.ts`
    - desktop v3 kiểm tra nhanh chứng minh chuỗi đảm bảo/quan sát/nhấp chuột/trạng thái
- Cầu mở rộng Chrome và công việc bù đắp iframe không còn là giả định nữa:
  - nhánh recut đã chứa cầu nối máy khách WebSocket phía mở rộng thực sự
  - nhánh recut đã chứa sự lan truyền bù khung cho các ứng viên iframe DOM
- Hợp đồng route của trình duyệt hiện là từ chối khi có lỗi:
  - nhấp chuột không trái và nhấp chuột nhiều lần vẫn ở trên đầu vào OS
  - `BrowserDomExtensionBridge` từ chối `ok: false` Responses thay vì coi chúng là thành công

<a id="what-is-actually-still-blocking"></a>

## Những gì thực sự vẫn đang chặn

Đây là những vấn đề thực tế còn lại, được sắp xếp theo mức độ nghiêm trọng.

<a id="1-live-desktop-v3-smoke-exists-but-it-is-baseline-coverage-not-product-support"></a>

### 1. trực tiếp desktop v3 kiểm tra nhanh tồn tại, nhưng đó là phạm vi bảo hiểm cơ bản chứ không phải hỗ trợ sản phẩm.

- kiểm tra nhanh hiện tại chứng minh: `desktop_ensure_chrome -> desktop_observe -> desktop_click_target -> desktop_get_state`
- Nó không chứng minh được việc định tuyến DOM ngữ nghĩa của Chrome, kết xuất cửa sổ lớp phủ trực tiếp hoặc cách ly đầu vào của người dùng.

<a id="2-overlay-lifecycle--rpc-readiness-still-needs-a-live-window-pass-on-this-recut-branch"></a>

### 2. Vòng đời lớp phủ / mức độ sẵn sàng của RPC vẫn cần có thẻ cửa sổ trực tiếp trên nhánh cắt lại này.

- Các tập tin hiện đang được xử lý:
  - `/Users/liuziheng/airi-desktop-recut/apps/desktop/src/main/windows/desktop-overlay/rpc/contracts.ts`
  - `/Users/liuziheng/airi-desktop-recut/apps/desktop/src/main/windows/desktop-overlay/rpc/index.electron.ts`
  - `/Users/liuziheng/airi-desktop-recut/apps/desktop/src/renderer/pages/desktop-overlay-polling.ts`
  - `/Users/liuziheng/airi-desktop-recut/apps/desktop/src/renderer/pages/desktop-overlay-polling.test.ts`
- Tình trạng hiện tại:
  - hợp đồng sẵn sàng đã được nối vào `desktop-overlay/rpc/index.electron.ts`
  - bộ điều khiển thăm dò renderer đã sẵn sàng và xử lý trạng thái xuống cấp
  - cửa sổ trực tiếp vẫn cần một thẻ mới trên nhánh recut này để xác nhận bằng chứng runtime hiện tại
- Đây là rủi ro runtime còn lại trên đường dẫn lớp phủ.

<a id="3-local-overlay-live-window-smoke-exists-in-the-recut-branch-but-it-still-needs-a-live-run-on-this-branch"></a>

### 3. Lớp phủ cục bộ trực tiếp-window kiểm tra nhanh tồn tại trong nhánh recut, nhưng nó vẫn cần trực tiếp chạy trên nhánh này.

- kiểm tra nhanh hiện được kết nối với `apps/desktop/package.json` dưới dạng `smoke:desktop-overlay-live-window`.
- Trình trợ giúp lựa chọn ứng viên được chia sẻ đã được thử nghiệm đơn vị.
- Điều vẫn còn thiếu ở đây là một đường chuyền mới trên nhánh recut này với cửa sổ lớp phủ Electron thực, để xác nhận điểm đánh dấu nhịp tim và việc bỏ phiếu MCP vẫn hoạt động giống như dòng cũ hơn.

<a id="what-is-not-a-current-blocker"></a>

## trở ngại hiện tại không phải là gì

Những mục này là những ý tưởng thực sự hoặc công việc dọn dẹp, nhưng chúng không phải là những thứ nên chặn đường ngay bây giờ.

- Mong muốn lớp phủ sạch sẽ ban đầu trong `apps/desktop/src/main/index.ts`
- Tái cấu trúc logic định tuyến của trình duyệt lồng nhau để dễ đọc
- Biến `macos-local.ts` thành phương án dự phòng chỉ cong vênh tức thời mà không có dấu vết chuyển động
- Viết lại hình ảnh lớp phủ, đánh bóng con trỏ ma hoặc gỡ lỗi renderer bổ sung UI

<a id="how-to-interpret-m13vs-comments"></a>

## Cách diễn giải nhận xét của m13v

Nhận xét của m13v rất hữu ích vì chúng phù hợp với các ràng buộc nền tảng thực, nhưng chúng phải được phân chia chính xác:

- Đã liên kết với mã hiện tại:
  - lưu → hành động → khôi phục mẫu con trỏ
  - lớp phủ không được chặn đầu vào của người dùng
  - sự cố nhịp tim cho các phiên CDP bị lỗi
- Vẫn hữu ích khi sàng lọc trong tương lai:
  - giảm dấu vết chuyển động của native để UI sở hữu nhiều hoạt ảnh con trỏ hiển thị hơn
  - kỷ luật runtime sâu sắc hơn xung quanh vòng đời phiên

Tóm lại: m13v đã đưa ra lời khuyên tốt về runtime. Điều đó không có nghĩa là mọi đề xuất đều là trở ngại hiện tại.

<a id="what-should-happen-now"></a>

## Điều gì sẽ xảy ra bây giờ

1. Không cần thực hiện hành động nào đối với hợp đồng gia hạn hành động chưa xác định; nó đã là từ chối khi có lỗi rồi.
2. Giữ định tuyến từ chối khi có lỗi trong trình duyệt cho các lỗi nhấp chuột không trái và cầu nối; điều này vẫn được đề cập, không được hỗ trợ bởi sản phẩm.
3. Chạy lại lớp phủ cục bộ trực tiếp-window kiểm tra nhanh trên nhánh recut này trước khi gọi nó là bằng chứng hiện tại.

<a id="what-should-happen-later"></a>

## Điều gì sẽ xảy ra sau này

Chỉ sau khi ở trên sạch:

1. Theo dõi tùy chọn:
   - `fix(stage-tamagotchi): validate desktop overlay lifecycle and RPC readiness in live window context`
2. Theo dõi tùy chọn:
   - `refactor(computer-use-mcp): evaluate instant-warp-only macOS fallback against ghost-pointer UX`
3. Theo dõi tùy chọn:
   - tăng cường kết hợp neo iframe khi iframe anh chị em rất giống nhau

<a id="bottom-line"></a>

## Điểm mấu chốt

desktop luồng không bị chặn theo hướng. Nó bị chặn bởi một số ít vấn đề về tính chính xác và một bước xác thực vòng đời lớp phủ vẫn đang mở.

Không mở lại kiến ​​trúc. Không trộn trong nước đánh bóng. Đừng tiếp tục chồng chất những thay đổi không liên quan lên cùng một PR.
