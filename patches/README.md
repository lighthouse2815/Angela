<a id="dependency-patches"></a>

# Các bản vá phụ thuộc

## @xsai/stream-text 0.5.1

Luồng tương thích OpenAI của Gemini có thể bỏ qua `index` trong các lệnh gọi chức năng hoàn chỉnh. SDK đã lưu trữ các lệnh gọi này trên một khóa mảng không xác định và âm thầm bỏ qua quá trình thực thi. Bản vá này sử dụng vị trí của từng cuộc gọi khi không có chỉ mục, trong khi vẫn giữ nguyên các chỉ mục rõ ràng và siêu dữ liệu phát lại của Google.

Hồi quy trong `core/agent/src/runtime/chat-completions.test.ts` sử dụng SDK thực với hai lệnh gọi không được lập chỉ mục và lý do kết thúc `stop`. Nó kiểm tra xem cả hai công cụ có thực thi một lần không và siêu dữ liệu của chúng có đáp ứng được yêu cầu tiếp theo hay không. Xóa bản vá này khi bản phát hành upstream vượt qua hồi quy đó.

## @xsai-ext/responses 0.5.1

Bản vá này khắc phục hành vi trong SDK đã xuất bản. Giao thức và mã thanh toán của Angela vẫn còn trong các gói workspace.

- Từ chối `response.incomplete` và phát trực tuyến các sự kiện lỗi để Angela không quay lỗi store.
- Nhập các công cụ native `web_search` và các Mục đầu ra của chúng để phát lại qua các bước.
- Chờ `onNativeEvent` trước khi xác nhận bản ghi để bên sử dụng có thể giữ lại nguồn và hoạt động tìm kiếm.

Hồi quy trình duyệt nằm trong `providers/inference/src/responses.browser.test.ts`. Các thử nghiệm tích hợp cốt lõi sử dụng SDK được vá thực sự với HTTP Responses tổng hợp trong `core/agent/src/runtime/responses.test.ts`.

Bản vá thay đổi `dist` vì npm artifact gửi mã đã biên dịch. Để đóng góp upstream, hãy chuyển những thay đổi này sang các nguồn tương ứng trong [xsAI](https://github.com/moeru-ai/xsai), sau đó chạy các hồi quy tương tự.

Xóa bản vá khi bản phát hành upstream vượt qua các thử nghiệm này và cung cấp các lệnh gọi lại sự kiện native và các loại tìm kiếm trên web. Kiểm tra lại hành vi phản hồi chưa hoàn chỉnh trước khi xóa: Angela coi lượt chưa hoàn thành là một thất bại.

Để cập nhật bản vá:

```sh
pnpm patch @xsai-ext/responses@0.5.1
# Edit the directory printed by pnpm.
pnpm patch-commit <directory>
```
