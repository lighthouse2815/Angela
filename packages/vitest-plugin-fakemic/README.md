<a id="vitest-plugin-for-fake-microphones"></a>

# Plugin Vitest cho micro giả

Gói này cung cấp Web micrô giả và Electron runtime có tích hợp dự án Vitest.

Nhập giao diện Vitest từ gói gốc:

```ts
import fakemic, {
  createAudioTestAPI,
  electron,
  runAudioTestSession,
  web,
} from '@angela/vitest-plugin-fakemic'
```

`src/index.ts` sở hữu cấu hình dự án, khởi chạy runtime, thu thập nhiệm vụ và lập lịch trình trước chuyến bay. `src/runner.ts` sở hữu khả năng thực thi nhiệm vụ.

Cấu hình runtime chỉ chứa các giá trị có thể tuần tự hóa. Mô-đun `prepare` điều chỉnh Playwright runtime đã khởi chạy thành một phiên ứng dụng.

```ts
fakemic({
  name: 'audio-web',
  include: ['cases/**/*.audio.test.ts', 'cases/**/*.audio.web.test.ts'],
  runtime: web({
    name: 'web',
    prepare: new URL('./prepare-web.ts', import.meta.url).href,
    url: 'http://127.0.0.1:4173/',
  }),
})
```

Các gói ứng dụng sở hữu bộ chọn, route, đầu dò, cài đặt nhà cung cấp và mô-đun chuẩn bị.
