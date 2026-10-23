# @angela/plugin-sdk-desktop

Trình trợ giúp desktop dành cho tiện ích mở rộng Angela, bao gồm các tiện ích, trò chơi nhỏ và công cụ. Gói workspace riêng tư này cung cấp các hợp đồng được chia sẻ bởi các plugin Electron host, Kirie renderer và desktop.

<a id="use"></a>

## Sử dụng

Nhập đối tượng địa lý từ đường dẫn phụ công khai của nó:

```ts
import type { WidgetsIframeInitPayload } from '@angela/plugin-sdk-desktop/widgets'
```

Xây dựng và kiểm tra gói từ kho lưu trữ gốc:

```sh
pnpm -F @angela/plugin-sdk-desktop build
pnpm -F @angela/plugin-sdk-desktop typecheck
pnpm -F @angela/plugin-sdk-desktop exec vitest run --maxWorkers=1
```

Sử dụng gói này cho các hợp đồng gia hạn desktop. Sử dụng [`@angela/plugin-sdk`](../plugin-sdk/README.md) cho các tệp kê khai tiện ích mở rộng và API vòng đời độc lập với host. Việc đổi tên gói sẽ giữ nguyên tên sự kiện, ID tiện ích mở rộng và trường bảng kê khai hiện có.
