# @angela/cap-vite

CLI dành cho phát triển tải lại [Capacitor](https://capacitorjs.com/) trực tiếp bằng Vite.

<a id="usage"></a>

## Cách sử dụng

```bash
cap-vite [vite args...] -- <ios|android> [cap run args...]
```

Ví dụ:

```bash
pnpm exec cap-vite -- ios --target <DEVICE_ID_OR_SIMULATOR_NAME>
pnpm exec cap-vite -- --host 0.0.0.0 --port 5173 -- android --target <DEVICE_ID_OR_SIMULATOR_NAME> --flavor release
CAPACITOR_DEVICE_ID_IOS=<DEVICE_ID_OR_SIMULATOR_NAME> pnpm exec cap-vite -- ios
```

- Các đối số trước `--` được chuyển tiếp tới `vite`.
- Các đối số sau `--` được chuyển tiếp tới `cap run`.
- Nếu env dành riêng cho nền tảng được đặt (`CAPACITOR_DEVICE_ID_IOS` hoặc `CAPACITOR_DEVICE_ID_ANDROID`) và các đối số `cap run` không chứa `--target`, `cap-vite` sẽ tự động tiêm `--target` với giá trị đó.
- Nếu không có đối số `--target` hoặc env dành riêng cho nền tảng nào được đặt, `cap-vite` sẽ sử dụng mục tiêu đầu tiên từ `cap run <platform> --list --json`.
- `cap-vite` luôn khởi chạy máy chủ Vite dev. Không chuyển `vite dev` hoặc `vite serve` làm đối số bổ sung.
- Sau khi máy chủ nhà phát triển khởi động, nhấn `R` trong terminal để chạy lại `cap run` mà không cần khởi động lại Vite.

Bạn có thể xem danh sách các thiết bị và trình mô phỏng có sẵn bằng cách chạy `pnpm exec cap run ios --list` hoặc `pnpm exec cap run android --list`.

<a id="capacitor-configuration"></a>

## Cấu hình Capacitor

Bạn cần đặt `server.url` trong `capacitor.config.ts` thành biến env `CAPACITOR_DEV_SERVER_URL`, sau đó cli sẽ xử lý phần còn lại cho bạn.

```ts
const serverURL = env.CAPACITOR_DEV_SERVER_URL
const isCleartext = serverURL?.startsWith('http://') ?? false

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'Example App',
  webDir: 'dist',
  server: serverURL
    ? {
        url: serverURL,
        cleartext: isCleartext,
      }
    : undefined,
}

export default config
```

<a id="why-we-need-this"></a>

## Tại sao chúng ta cần điều này?

- Không cần quan tâm `server.url` là gì, nó sẽ tự động được đặt thành giá trị chính xác.
- Chạy lại ứng dụng native khi mã native thay đổi, bạn sẽ không quên khởi động nó.
- Chạy lại `cap run` theo yêu cầu từ cùng một thiết bị đầu cuối khi bạn cần khởi chạy lại native sạch sẽ.
- Không cần phải mở hai thiết bị đầu cuối để chạy dự án, bạn có thể chạy nó bằng một lệnh.

<a id="architecture-notes"></a>

## Ghi chú kiến ​​trúc

- Các đối số Vite được để lại cho Vite CLI thực thay vì được triển khai lại bên trong `cap-vite`.
- `cap-vite` chèn cấu hình trình bao bọc để nó có thể thêm plugin Vite của riêng mình mà không cần chỉnh sửa `vite.config.*` hiện có của người dùng.
- Plugin được chèn sẽ đọc `server.resolvedUrls`, khởi động `cap run` và khởi động lại nó khi các tệp trong thư mục nền tảng native thay đổi hoặc khi bạn nhấn `R` trong thiết bị đầu cuối.
- `cap-vite` chỉ tách hai nhóm đối số và chuyển các đối số `cap run` vào plugin được chèn thông qua các biến môi trường.
