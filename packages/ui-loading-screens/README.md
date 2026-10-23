# @angela/ui-loading-screens

Gói này cung cấp màn hình tải cho ứng dụng Angela. [Xem sân chơi](https://proj-airi-packages-ui-loading-screens.netlify.app/).

<a id="use"></a>

## Sử dụng

Nhập `StartupScreen` từ `@angela/ui-loading-screens/startup-screen`. Cung cấp cho nó giai đoạn, tiến trình, logo URL và các nhãn đã dịch.

```vue
<StartupScreen phase="loading" :progress="50" logo-src="/favicon.svg" :label="t('stage.operations.load-models-status.loading')" :error-title="t('stage.startup.failed')" :error-hint="t('stage.startup.recover')" :error-details-label="t('stage.startup.details')" :error-details-close-label="t('stage.startup.close-details')" :retry-label="t('stage.startup.retry')" />
```

Pha `splash` hiển thị logo. Pha `loading` thể hiện sự tiến triển ở gần mép dưới. Giai đoạn `error` hiển thị tiêu đề lỗi, hướng dẫn, thanh tiến trình và hành động khôi phục. desktop đặt các hành động bên dưới văn bản lỗi và giữ tiến trình ở phía dưới cùng. Điện thoại di động ẩn logo và đặt tiến trình ngay phía trên các hành động phía dưới. Tiến trình lỗi không có nhãn phần trăm. Nút chi tiết nhỏ sẽ mở chú giải công cụ desktop hoặc ngăn kéo phía dưới di động. Pha `done` loại bỏ màn hình.

Màn hình sử dụng Comfortaa cho thương hiệu và nội dung. Thanh tiến trình sử dụng `Progress` từ `@angela/ui`. `StartupOverlay` đọc trạng thái tài nguyên và cung cấp văn bản lỗi. `alternative-label` tùy chọn thêm hành động thứ hai đối với lỗi có thể phục hồi.

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

Sử dụng `StartupScreen` trong khi ứng dụng chờ tác vụ khởi động track. Báo cáo tiến độ từ các nhiệm vụ đã hoàn thành.

<a id="when-not-to-use-it"></a>

## Khi nào không nên sử dụng nó

Không sử dụng tiến trình khởi động để tải xuống mà không có tín hiệu hoàn thành. Hiển thị trạng thái tải riêng cho các thay đổi mô hình sau này.

<a id="license"></a>

## Giấy phép

[MIT](../../LICENSE)
