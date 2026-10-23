# `@angela/stage-shared`

Hợp đồng chia sẻ và người trợ giúp trung lập runtime cho các ứng dụng Angela stage và các gói UI.

<a id="use-this-package"></a>

## Sử dụng gói này

Sử dụng gói này khi một loại hoặc hành vi phải vượt qua ranh giới ứng dụng stage mà không phụ thuộc vào Electron, mã chỉ dành cho trình duyệt hoặc gói tính năng UI.

Điểm vào `plugin-host` sở hữu các ảnh chụp nhanh host của Plugin có thể tuần tự hóa được trao đổi giữa quy trình chính của Electron và mã renderer được chia sẻ:

```ts
import type { PluginHostDebugSnapshot } from '@angela/stage-shared/plugin-host'
```

Điểm nhập `model-assets` sở hữu các bảng kê khai tệp mô hình, trạng thái tải xuống và hợp đồng bộ điều hợp lưu trữ. Sử dụng bộ điều hợp nền tảng cho store và mở tệp. Nó không sở hữu bộ nhận dạng hoặc worker.

<a id="do-not-use-this-package"></a>

## Không sử dụng gói này

Giữ các định nghĩa về Electron IPC trong ứng dụng Electron. Giữ trạng thái và hành động của UI trong `@angela/stage-ui`. Giữ tiện ích mở rộng runtime và hành vi hiển thị trong `@angela/plugin-sdk`.

Không thêm các tác dụng phụ khởi động ứng dụng, kiên trì hoặc dành riêng cho nền tảng ở đây.
