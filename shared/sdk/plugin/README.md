# @angela/plugin-sdk

runtime-agnostic SDK dành cho tiện ích mở rộng Angela.

<a id="extension-manifest"></a>

## Bản kê khai tiện ích mở rộng

Mỗi gói Tiện ích mở rộng có thể cài đặt đều có tệp `extension.airi.json` ở gốc. host hiện tại chỉ chấp nhận Bản kê khai v2:

```json
{
  "manifestVersion": 2,
  "kind": "manifest.extension.airi.moeru.ai",
  "id": "example-extension",
  "version": "1.0.0",
  "engines": {
    "airi": "*",
    "runtimes": ["electron"]
  },
  "entrypoints": {
    "electron": "./extension.mjs"
  },
  "permissions": {},
  "kits": {
    "uses": [
      {
        "id": "dev.airi.example",
        "version": "^1.0.0",
        "optional": true
      }
    ]
  }
}
```

Phân tích cú pháp kê khai là nghiêm ngặt. Các trường không xác định, id không an toàn, điểm nhập trống và điểm nhập runtime bị thiếu không xác thực được.

Khai báo Kit nhà cung cấp sử dụng các phiên bản ngữ nghĩa chính xác. Khai báo bộ bên sử dụng chấp nhận phạm vi phiên bản ngữ nghĩa.

Tệp kê khai sở hữu phiên bản Tiện ích mở rộng cho phiên host. `defineExtension(...)` phải sử dụng cùng một ID tiện ích mở rộng.

<a id="kit-api-naming"></a>

## Đặt tên bộ API

Bộ công cụ nên ẩn thông tin chi tiết về transport khỏi tác giả tiện ích mở rộng. Tiện ích mở rộng thông thường nên sử dụng bộ công cụ làm đối tượng API bình thường ngay từ quá trình thiết lập:

```ts
const gamelets = await ctx.kits.use(gameletKit)
await gamelets.mount(input)
```

Phạm vi mô-đun rõ ràng là vòng đời và phân bổ nâng cao API. Chỉ sử dụng `module.kits.use(...)` khi host cần đóng góp để liên kết với phạm vi phụ mà sau này có thể được kiểm tra, xử lý hoặc khởi động lại một cách độc lập.

Khi một bộ công cụ cần hoạt động xuyên qua các ranh giới quy trình hoặc mạng, hãy hiển thị các hợp đồng gọi Eventa được chia sẻ từ gói bộ công cụ và xây dựng ứng dụng khách từ các hợp đồng đó. Không giới thiệu các tên phương thức transport dành riêng cho bộ công cụ như `invokeGamelet`, `gameletRpc` hoặc `gameletRuntime`.

Sử dụng những tên này một cách nhất quán:

| Tên | Ý nghĩa |
| --- | --- |
| `gameletKitApis` | Hợp đồng Eventa API được chia sẻ được xuất theo gói kit. Đây thường là bản đồ của các mục `defineInvokeEventa(...)`. |
| `gameletKitService` | Việc triển khai bộ công cụ phía host. Nó sở hữu các tác dụng phụ thực sự như gắn, cập nhật và dọn dẹp UI. |
| `gameletKit` | Định nghĩa bộ công cụ được sử dụng bởi `ctx.kits.use(...)` hoặc phạm vi mô-đun tùy chọn. Nó sở hữu danh tính, phiên bản, chính sách sẵn có và tạo ứng dụng khách. |
| `gamelets` | Phiên bản máy khách được trả về cho tác giả tiện ích mở rộng. Thích một không gian tên số nhiều khi máy khách hiển thị nhiều thao tác. |
| `createGameletKit(...)` | hàm tạo kết nối các phần phụ thuộc vào `gameletKit`, bao gồm tạo ứng dụng khách cục bộ và tạo ứng dụng khách được hỗ trợ bởi Eventa từ xa. |

Hình dạng ví dụ:

```ts
export const gameletKitApis = {
  mount: defineInvokeEventa<GameletMountResult, GameletMountInput>(
    'airi:kit:gamelet:mount',
  ),
}

export interface GameletKitService {
  mount: (input: GameletMountInput, scope: KitCallScope) => Promise<GameletMountResult>
}

export function createGameletKit(options: { service: GameletKitService }) {
  return defineKit<GameletClient>({
    id: 'kit.gamelet',
    version: '1.0.0',
    createClient(runtime) {
      return {
        mount: input => options.service.mount(input, runtime),
      }
    },
  })
}
```

Máy khách từ xa nên sử dụng lại lệnh gọi Eventa thay vì xác định giao thức RPC song song. Sử dụng hàm gọi lại ngữ cảnh lười biếng khi transport cơ bản có thể kết nối lại hoặc được tạo sau đối tượng máy khách:

```ts
const mount = defineInvoke(getContext, gameletKitApis.mount)

const gamelets = {
  mount(input: GameletMountInput) {
    return mount(input, scope)
  },
}
```

artifact được chia sẻ là hợp đồng Eventa API, không phải chức năng triển khai. Khách hàng cục bộ có thể gọi trực tiếp đến `gameletKitService`; khách hàng từ xa gọi cùng một API thông qua Eventa. Cả hai nên thể hiện hình dạng tác giả giống nhau.
