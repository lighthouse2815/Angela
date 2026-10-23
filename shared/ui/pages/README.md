<a id="stage-pages"></a>

# Trang stage

`@angela/stage-pages` chứa các trang Vue cấp route mà nhiều ứng dụng Angela stage chia sẻ.

<a id="use"></a>

## Sử dụng

Thêm một trang dưới `src/pages`. Mỗi ứng dụng stage quét thư mục này thông qua cấu hình Vite router của nó.

Nhập trang được chia sẻ thông qua ranh giới gói khi mã cần trực tiếp thành phần:

```ts
import PolaroidPage from '@angela/stage-pages/pages/devtools/polaroid.vue'
```

<a id="when-to-use-this-package"></a>

## Khi nào nên sử dụng gói này

Sử dụng gói này khi hai hoặc nhiều ứng dụng stage cần có cùng hành vi trang và cấu trúc route.

<a id="when-not-to-use-this-package"></a>

## Khi nào không nên sử dụng gói này

Giữ các trang dành riêng cho ứng dụng trong ứng dụng sở hữu. Đặt các thành phần kinh doanh có thể tái sử dụng vào `@angela/stage-ui`.

Đặt các thành phần UI nguyên thủy vào `@angela/ui`. Đặt bố cục được chia sẻ trong `@angela/stage-layouts`.

<a id="provider-settings"></a>

## Cài đặt nhà cung cấp

Trò chuyện tích cực và tầm nhìn nhà cung cấp route trực tiếp trong `/settings/providers`. Họ sử dụng `ProviderGenerationSettings` từ stage-ui để hiển thị giao thức và các tùy chọn tìm kiếm native từ danh mục nhà cung cấp. Trình chỉnh sửa V2 là một bên sử dụng riêng biệt và không thay thế các route này.

<a id="hearing-settings"></a>

## Cài đặt thính giác

`/settings/modules/hearing` là tổng quan. Nó chứa các điều khiển `HearingConfig` được chia sẻ (chế độ đầu vào, công tắc micrô, thiết bị đầu vào) và cài đặt phân phối bản ghi (Tự động gửi và ghi lại bản ghi).

- `/settings/modules/hearing/transcriber` chọn phiên âm nhà cung cấp và mô hình. Sân chơi của nó chỉ yêu cầu quyền sử dụng micrô khi quá trình giám sát bắt đầu.
- `/settings/modules/hearing/wake-words` liệt kê các từ đánh thức của từng thẻ và trạng thái của máy dò. Khi hai thẻ có cùng cách phát âm, người dùng sẽ chọn ký tự trả lời nó. Lựa chọn vẫn còn trên thiết bị và cả hai thẻ đều giữ lời.

Trang thẻ ký tự hiển thị cảnh báo trong khi cách phát âm được chia sẻ không có ký tự. Cảnh báo liên kết đến trang từ đánh thức.
